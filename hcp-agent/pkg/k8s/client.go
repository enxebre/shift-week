package k8s

import (
	"context"
	"fmt"
	"path/filepath"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// Define the GVK (Group, Version, Kind) for our custom resources
var (
	hostedClusterGVK = schema.GroupVersionKind{
		Group:   "hypershift.openshift.io",
		Version: "v1alpha1",
		Kind:    "HostedCluster",
	}

	nodePoolGVK = schema.GroupVersionKind{
		Group:   "hypershift.openshift.io",
		Version: "v1alpha1",
		Kind:    "NodePool",
	}
)

// Client wraps the controller-runtime client
type Client struct {
	client client.Client
	scheme *runtime.Scheme
}

// NewClient creates a new Kubernetes client using controller-runtime
func NewClient() (*Client, error) {
	// Use the current context in kubeconfig
	home := homedir.HomeDir()
	kubeconfig := filepath.Join(home, ".kube", "config")

	// Build the config from the kubeconfig file
	config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to build config: %w", err)
	}

	// Create a new scheme
	scheme := runtime.NewScheme()

	// Register the custom resource types with the scheme
	schemeBuilder := runtime.NewSchemeBuilder(
		func(scheme *runtime.Scheme) error {
			scheme.AddKnownTypeWithName(hostedClusterGVK, &runtime.Unknown{})
			scheme.AddKnownTypeWithName(nodePoolGVK, &runtime.Unknown{})
			return nil
		},
	)
	if err := schemeBuilder.AddToScheme(scheme); err != nil {
		return nil, fmt.Errorf("failed to add custom resources to scheme: %w", err)
	}

	// Create the client
	c, err := client.New(config, client.Options{
		Scheme: scheme,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}

	return &Client{
		client: c,
		scheme: scheme,
	}, nil
}

// HostedCluster represents a simplified version of the HostedCluster CR
type HostedCluster struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Version    string            `json:"version"`
	Platform   string            `json:"platform"`
	Status     string            `json:"status"`
	Conditions []Condition       `json:"conditions,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
}

// NodePool represents a simplified version of the NodePool CR
type NodePool struct {
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	ClusterName  string            `json:"clusterName"`
	Replicas     int32             `json:"replicas"`
	InstanceType string            `json:"instanceType"`
	Status       string            `json:"status"`
	Conditions   []Condition       `json:"conditions,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
	AutoScaling  bool              `json:"autoScaling"`
	MinReplicas  int32             `json:"minReplicas,omitempty"`
	MaxReplicas  int32             `json:"maxReplicas,omitempty"`
}

// Condition represents a status condition
type Condition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`
}

// GetHostedClusters retrieves HostedCluster resources from the specified namespace
func (c *Client) GetHostedClusters(namespace string) (string, error) {
	ctx := context.Background()

	// Create a list object for HostedClusters
	list := &unstructured.UnstructuredList{}
	list.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   hostedClusterGVK.Group,
		Version: hostedClusterGVK.Version,
		Kind:    hostedClusterGVK.Kind + "List",
	})

	// List the HostedClusters
	if err := c.client.List(ctx, list, client.InNamespace(namespace)); err != nil {
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

// GetNodePools retrieves NodePool resources from the specified namespace
func (c *Client) GetNodePools(namespace string) (string, error) {
	ctx := context.Background()

	// Create a list object for NodePools
	list := &unstructured.UnstructuredList{}
	list.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   nodePoolGVK.Group,
		Version: nodePoolGVK.Version,
		Kind:    nodePoolGVK.Kind + "List",
	})

	// List the NodePools
	if err := c.client.List(ctx, list, client.InNamespace(namespace)); err != nil {
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

// GetAllResources retrieves both HostedClusters and NodePools from the specified namespace
func (c *Client) GetAllResources(namespace string) (string, error) {
	hostedClusters, err := c.GetHostedClusters(namespace)
	if err != nil {
		return "", err
	}

	nodePools, err := c.GetNodePools(namespace)
	if err != nil {
		return "", err
	}

	return hostedClusters + "\n" + nodePools, nil
}
