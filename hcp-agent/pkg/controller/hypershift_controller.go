package controller

import (
	"context"
	"fmt"
	"time"

	"github.com/go-logr/logr"
	"github.com/yourusername/k8s-llm-analyzer/pkg/llm"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
)

// Define the GVK (Group, Version, Kind) for our custom resources
var (
	hostedClusterGVK = schema.GroupVersionKind{
		Group:   "hypershift.openshift.io",
		Version: "v1beta1",
		Kind:    "HostedCluster",
	}

	nodePoolGVK = schema.GroupVersionKind{
		Group:   "hypershift.openshift.io",
		Version: "v1beta1",
		Kind:    "NodePool",
	}
)

// Reconciler reconciles HostedCluster and NodePool resources
type Reconciler struct {
	client           client.Client
	ollamaClient     *llm.OllamaClient
	analysisQuestion string
	lastAnalysisTime time.Time
}

// NewHyperShiftReconciler creates a new reconciler for HyperShift resources
func NewReconciler(
	client client.Client,
	ollamaClient *llm.OllamaClient,
	analysisQuestion string,
	log logr.Logger,
) *Reconciler {
	return &Reconciler{
		client:           client,
		ollamaClient:     ollamaClient,
		analysisQuestion: analysisQuestion,
		lastAnalysisTime: time.Time{}, // Zero time
	}
}

// Reconcile processes HostedCluster and NodePool resources
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := ctrl.LoggerFrom(ctx).WithName("agent")

	// Throttle analysis to avoid too frequent LLM calls
	// Only analyze once every 5 minutes
	if time.Since(r.lastAnalysisTime) < 5*time.Minute {
		log.Info("Skipping analysis due to throttling", "lastAnalysis", r.lastAnalysisTime)
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}

	log.Info("Starting reconciliation")

	// Get all HostedClusters in the namespace
	hostedClustersData, err := r.getHostedClusters(ctx, req.Namespace)
	if err != nil {
		log.Error(err, "Failed to get HostedClusters")
		return ctrl.Result{}, err
	}

	// Get all NodePools in the namespace
	nodePoolsData, err := r.getNodePools(ctx, req.Namespace)
	if err != nil {
		log.Error(err, "Failed to get NodePools")
		return ctrl.Result{}, err
	}

	// Combine the data
	combinedData := hostedClustersData + "\n" + nodePoolsData

	// If there's no data, skip analysis
	if combinedData == fmt.Sprintf("Found 0 HostedClusters in namespace %s:\n\nFound 0 NodePools in namespace %s:\n",
		req.Namespace, req.Namespace) {
		log.Info("No resources found, skipping analysis")
		return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
	}

	// Send to LLM for analysis
	log.Info("Sending resources to LLM for analysis", "combinedData", combinedData)

	analysis, err := r.ollamaClient.Analyze(combinedData, r.analysisQuestion)
	if err != nil {
		log.Error(err, "Failed to analyze with LLM")
		return ctrl.Result{}, err
	}

	// Update the last analysis time
	r.lastAnalysisTime = time.Now()

	// Log the analysis
	fmt.Println("Agent analysis: ", analysis)
	// Requeue after 5 minutes
	return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
}

// SetupWithManager sets up the controller with the Manager
func (r *Reconciler) SetupWithManager(mgr ctrl.Manager) error {
	hostedClusterObj := &unstructured.Unstructured{}
	hostedClusterObj.SetGroupVersionKind(hostedClusterGVK)

	nodePoolObj := &unstructured.Unstructured{}
	nodePoolObj.SetGroupVersionKind(nodePoolGVK)

	return ctrl.NewControllerManagedBy(mgr).
		For(hostedClusterObj).
		Watches(
			nodePoolObj,
			&handler.EnqueueRequestForObject{},
		).
		Complete(r)
}

// getHostedClusters retrieves HostedCluster resources from the specified namespace
func (r *Reconciler) getHostedClusters(ctx context.Context, namespace string) (string, error) {
	// Create a list object for HostedClusters
	list := &unstructured.UnstructuredList{}
	list.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   hostedClusterGVK.Group,
		Version: hostedClusterGVK.Version,
		Kind:    hostedClusterGVK.Kind + "List",
	})

	// List the HostedClusters
	if err := r.client.List(ctx, list, client.InNamespace(namespace)); err != nil {
		return "", fmt.Errorf("failed to list HostedClusters: %w", err)
	}

	// Format HostedCluster information as a string
	result := fmt.Sprintf("Found %d HostedClusters in namespace %s:\n", len(list.Items), namespace)

	for _, item := range list.Items {
		name, _, _ := unstructured.NestedString(item.Object, "metadata", "name")
		version, _, _ := unstructured.NestedString(item.Object, "spec", "release", "image")
		platform, _, _ := unstructured.NestedString(item.Object, "spec", "platform", "type")
		status, _, _ := unstructured.NestedString(item.Object, "status", "phase")

		result += fmt.Sprintf("- %s\n", name)
		result += fmt.Sprintf("  • Version: %s\n", version)
		result += fmt.Sprintf("  • Platform: %s\n", platform)
		result += fmt.Sprintf("  • Status: %s\n", status)

		// Get conditions
		conditions, exists, _ := unstructured.NestedSlice(item.Object, "status", "conditions")
		if exists && len(conditions) > 0 {
			result += "  • Conditions:\n"
			for _, c := range conditions {
				condition, ok := c.(map[string]interface{})
				if !ok {
					continue
				}

				condType, _, _ := unstructured.NestedString(condition, "type")
				status, _, _ := unstructured.NestedString(condition, "status")
				reason, _, _ := unstructured.NestedString(condition, "reason")

				result += fmt.Sprintf("    - %s: %s (%s)\n", condType, status, reason)
			}
		}

		result += "\n"
	}

	return result, nil
}

// getNodePools retrieves NodePool resources from the specified namespace
func (r *Reconciler) getNodePools(ctx context.Context, namespace string) (string, error) {
	// Create a list object for NodePools
	list := &unstructured.UnstructuredList{}
	list.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   nodePoolGVK.Group,
		Version: nodePoolGVK.Version,
		Kind:    nodePoolGVK.Kind + "List",
	})

	// List the NodePools
	if err := r.client.List(ctx, list, client.InNamespace(namespace)); err != nil {
		return "", fmt.Errorf("failed to list NodePools: %w", err)
	}

	// Format NodePool information as a string
	result := fmt.Sprintf("Found %d NodePools in namespace %s:\n", len(list.Items), namespace)

	for _, item := range list.Items {
		name, _, _ := unstructured.NestedString(item.Object, "metadata", "name")
		clusterName, _, _ := unstructured.NestedString(item.Object, "spec", "clusterName")
		instanceType, _, _ := unstructured.NestedString(item.Object, "spec", "platform", "aws", "instanceType")
		replicas, _, _ := unstructured.NestedInt64(item.Object, "spec", "replicas")

		result += fmt.Sprintf("- %s\n", name)
		result += fmt.Sprintf("  • Cluster: %s\n", clusterName)
		result += fmt.Sprintf("  • Instance Type: %s\n", instanceType)
		result += fmt.Sprintf("  • Replicas: %d\n", replicas)

		// Check for autoscaling
		minReplicas, minExists, _ := unstructured.NestedInt64(item.Object, "spec", "autoScaling", "min")
		maxReplicas, maxExists, _ := unstructured.NestedInt64(item.Object, "spec", "autoScaling", "max")

		if minExists && maxExists {
			result += fmt.Sprintf("  • Auto Scaling: Enabled (min: %d, max: %d)\n", minReplicas, maxReplicas)
		} else {
			result += "  • Auto Scaling: Disabled\n"
		}

		// Get conditions
		conditions, exists, _ := unstructured.NestedSlice(item.Object, "status", "conditions")
		if exists && len(conditions) > 0 {
			result += "  • Conditions:\n"
			for _, c := range conditions {
				condition, ok := c.(map[string]interface{})
				if !ok {
					continue
				}

				condType, _, _ := unstructured.NestedString(condition, "type")
				status, _, _ := unstructured.NestedString(condition, "status")
				reason, _, _ := unstructured.NestedString(condition, "reason")

				result += fmt.Sprintf("    - %s: %s (%s)\n", condType, status, reason)
			}
		}

		result += "\n"
	}

	return result, nil
}
