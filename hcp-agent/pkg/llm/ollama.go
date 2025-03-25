package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// OllamaClient represents a client for the Ollama API
type OllamaClient struct {
	baseURL    string
	model      string
	httpClient *http.Client
}

// NewOllamaClient creates a new Ollama client
func NewOllamaClient(baseURL, model string) *OllamaClient {
	return &OllamaClient{
		baseURL:    baseURL,
		model:      model,
		httpClient: &http.Client{},
	}
}

// Request represents the request to the Ollama API
type Request struct {
	Model   string  `json:"model"`
	Prompt  string  `json:"prompt"`
	Stream  bool    `json:"stream"`
	Options Options `json:"options,omitempty"`
}

// Options represents the options for the Ollama API
type Options struct {
	Temperature float64 `json:"temperature,omitempty"`
	TopP        float64 `json:"top_p,omitempty"`
	MaxTokens   int     `json:"max_tokens,omitempty"`
}

// Response represents the response from the Ollama API
type Response struct {
	Model     string `json:"model"`
	Response  string `json:"response"`
	CreatedAt string `json:"created_at"`
}

// Analyze sends the Kubernetes data to the LLM for analysis
func (c *OllamaClient) Analyze(k8sData, question string) (string, error) {
	prompt := fmt.Sprintf(`You are a Kubernetes expert specializing in OpenShift HyperShift. Analyze the following HyperShift resources and answer the question.

HyperShift Resources:
%s

Provide a detailed analysis the conditions passed for each resource above. 
For each resource use a bullet point title HostedCluster followed by the name.
To do analyse the passed conditions you can use the following dictionaries of the HostedCluster and NodePool conditions so you can use to interpret the ones passed to you:

HostedCluster Conditions dictionary:
// "Condition values may change back and forth, but some condition transitions may be monotonic, depending on the resource and condition type.
// However, conditions are observations and not, themselves, state machines."
// https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#typical-status-properties

// Conditions.
const (
	// HostedClusterAvailable indicates whether the HostedCluster has a healthy
	// control plane.
	// When this is false for too long and there's no clear indication in the "Reason", please check the remaining more granular conditions.
	HostedClusterAvailable ConditionType = "Available"
	// HostedClusterProgressing indicates whether the HostedCluster is attempting
	// an initial deployment or upgrade.
	// When this is false for too long and there's no clear indication in the "Reason", please check the remaining more granular conditions.
	HostedClusterProgressing ConditionType = "Progressing"
	// HostedClusterDegraded indicates whether the HostedCluster is encountering
	// an error that may require user intervention to resolve.
	HostedClusterDegraded ConditionType = "Degraded"

	// Bubble up from HCP.

	// InfrastructureReady bubbles up the same condition from HCP. It signals if the infrastructure for a control plane to be operational,
	// e.g. load balancers were created successfully.
	// A failure here may require external user intervention to resolve. E.g. hitting quotas on the cloud provider.
	InfrastructureReady ConditionType = "InfrastructureReady"
	// KubeAPIServerAvailable bubbles up the same condition from HCP. It signals if the kube API server is available.
	// A failure here often means a software bug or a non-stable cluster.
	KubeAPIServerAvailable ConditionType = "KubeAPIServerAvailable"
	// EtcdAvailable bubbles up the same condition from HCP. It signals if etcd is available.
	// A failure here often means a software bug or a non-stable cluster.
	EtcdAvailable ConditionType = "EtcdAvailable"
	// ValidHostedControlPlaneConfiguration bubbles up the same condition from HCP. It signals if the hostedControlPlane input is valid and
	// supported by the underlying management cluster.
	// A failure here is unlikely to resolve without the changing user input.
	ValidHostedControlPlaneConfiguration ConditionType = "ValidHostedControlPlaneConfiguration"
	// CloudResourcesDestroyed bubbles up the same condition from HCP. It signals if the cloud provider infrastructure created by Kubernetes
	// in the consumer cloud provider account was destroyed.
	// A failure here may require external user intervention to resolve. E.g. cloud provider perms were corrupted. E.g. the guest cluster was broken
	// and kube resource deletion that affects cloud infra like service type load balancer can't succeed.
	CloudResourcesDestroyed ConditionType = "CloudResourcesDestroyed"
	// HostedClusterDestroyed indicates that a hosted has finished destroying and that it is waiting for a destroy grace period to go away.
	// The grace period is determined by the hypershift.openshift.io/destroy-grace-period annotation in the HostedCluster if present.
	HostedClusterDestroyed ConditionType = "HostedClusterDestroyed"
	// ExternalDNSReachable bubbles up the same condition from HCP. It signals if the configured external DNS is reachable.
	// A failure here requires external user intervention to resolve. E.g. changing the external DNS domain or making sure the domain is created
	// and registered correctly.
	ExternalDNSReachable ConditionType = "ExternalDNSReachable"
	// ValidReleaseInfo bubbles up the same condition from HCP. It indicates if the release contains all the images used by hypershift
	// and reports missing images if any.
	ValidReleaseInfo ConditionType = "ValidReleaseInfo"

	// Bubble up from HCP which bubbles up from CVO.

	// ClusterVersionSucceeding indicates the current status of the desired release
	// version of the HostedCluster as indicated by the Failing condition in the
	// underlying cluster's ClusterVersion.
	ClusterVersionSucceeding ConditionType = "ClusterVersionSucceeding"
	// ClusterVersionUpgradeable indicates the Upgradeable condition in the
	// underlying cluster's ClusterVersion.
	ClusterVersionUpgradeable ConditionType = "ClusterVersionUpgradeable"
	// ClusterVersionFailing bubbles up Failing from the CVO.
	ClusterVersionFailing ConditionType = "ClusterVersionFailing"
	// ClusterVersionProgressing bubbles up configv1.OperatorProgressing from the CVO.
	ClusterVersionProgressing ConditionType = "ClusterVersionProgressing"
	// ClusterVersionAvailable bubbles up Failing configv1.OperatorAvailable from the CVO.
	ClusterVersionAvailable ConditionType = "ClusterVersionAvailable"
	// ClusterVersionReleaseAccepted bubbles up Failing ReleaseAccepted from the CVO.
	ClusterVersionReleaseAccepted ConditionType = "ClusterVersionReleaseAccepted"
	// ClusterVersionRetrievedUpdates bubbles up RetrievedUpdates from the CVO.
	ClusterVersionRetrievedUpdates ConditionType = "ClusterVersionRetrievedUpdates"

	// UnmanagedEtcdAvailable indicates whether a user-managed etcd cluster is
	// healthy.
	UnmanagedEtcdAvailable ConditionType = "UnmanagedEtcdAvailable"

	// IgnitionEndpointAvailable indicates whether the ignition server for the
	// HostedCluster is available to handle ignition requests.
	// A failure here often means a software bug or a non-stable cluster.
	IgnitionEndpointAvailable ConditionType = "IgnitionEndpointAvailable"

	// IgnitionServerValidReleaseInfo indicates if the release contains all the images used by the local ignition provider
	// and reports missing images if any.
	IgnitionServerValidReleaseInfo ConditionType = "IgnitionServerValidReleaseInfo"

	// ValidHostedClusterConfiguration signals if the hostedCluster input is valid and
	// supported by the underlying management cluster.
	// A failure here is unlikely to resolve without the changing user input.
	ValidHostedClusterConfiguration ConditionType = "ValidConfiguration"

	// SupportedHostedCluster indicates whether a HostedCluster is supported by
	// the current configuration of the hypershift-operator.
	// e.g. If HostedCluster requests endpointAcess Private but the hypershift-operator
	// is running on a management cluster outside AWS or is not configured with AWS
	// credentials, the HostedCluster is not supported.
	// A failure here is unlikely to resolve without the changing user input.
	SupportedHostedCluster ConditionType = "SupportedHostedCluster"

	// ValidOIDCConfiguration indicates if an AWS cluster's OIDC condition is
	// detected as invalid.
	// A failure here may require external user intervention to resolve. E.g. oidc was deleted out of band.
	ValidOIDCConfiguration ConditionType = "ValidOIDCConfiguration"

	// ValidIDPConfiguration indicates if the Identity Provider configuration is valid.
	// A failure here may require external user intervention to resolve
	// e.g. the user-provided IDP configuration provided is invalid or the IDP is not reachable.
	ValidIDPConfiguration ConditionType = "ValidIDPConfiguration"

	// ValidReleaseImage indicates if the release image set in the spec is valid
	// for the HostedCluster. For example, this can be set false if the
	// HostedCluster itself attempts an unsupported version before 4.9 or an
	// unsupported upgrade e.g y-stream upgrade before 4.11.
	// A failure here is unlikely to resolve without the changing user input.
	ValidReleaseImage ConditionType = "ValidReleaseImage"

	// ValidKubeVirtInfraNetworkMTU indicates if the MTU configured on an infra cluster
	// hosting a guest cluster utilizing kubevirt platform is a sufficient value that will avoid
	// performance degradation due to fragmentation of the double encapsulation in ovn-kubernetes
	ValidKubeVirtInfraNetworkMTU ConditionType = "ValidKubeVirtInfraNetworkMTU"

	// KubeVirtNodesLiveMigratable indicates if all nodes (VirtualMachines) of the kubevirt
	// hosted cluster can be live migrated without experiencing a node restart
	KubeVirtNodesLiveMigratable ConditionType = "KubeVirtNodesLiveMigratable"

	// ValidAWSIdentityProvider indicates if the Identity Provider referenced
	// in the cloud credentials is healthy. E.g. for AWS the idp ARN is referenced in the iam roles.
	// 		"Version": "2012-10-17",
	//		"Statement": [
	//			{
	//				"Effect": "Allow",
	//				"Principal": {
	//					"Federated": "{{ .ProviderARN }}"
	//				},
	//					"Action": "sts:AssumeRoleWithWebIdentity",
	//				"Condition": {
	//					"StringEquals": {
	//						"{{ .ProviderName }}:sub": {{ .ServiceAccounts }}
	//					}
	//				}
	//			}
	//		]
	//
	// A failure here may require external user intervention to resolve.
	ValidAWSIdentityProvider ConditionType = "ValidAWSIdentityProvider"

	// ValidAWSKMSConfig indicates whether the AWS KMS role and encryption key are valid and operational
	// A failure here indicates that the role or the key are invalid, or the role doesn't have access to use the key.
	ValidAWSKMSConfig ConditionType = "ValidAWSKMSConfig"

	// ValidAzureKMSConfig indicates whether the given KMS input for the Azure platform is valid and operational
	// A failure here indicates that the input is invalid, or permissions are missing to use the encryption key.
	ValidAzureKMSConfig ConditionType = "ValidAzureKMSConfig"

	// AWSDefaultSecurityGroupCreated indicates whether the default security group
	// for AWS workers has been created.
	// A failure here indicates that NodePools without a security group will be
	// blocked from creating machines.
	AWSDefaultSecurityGroupCreated ConditionType = "AWSDefaultSecurityGroupCreated"

	// AWSDefaultSecurityGroupDeleted indicates whether the default security group
	// for AWS workers has been deleted.
	// A failure here indicates that the Security Group has some dependencies that
	// there are still pending cloud resources to be deleted that are using that SG.
	AWSDefaultSecurityGroupDeleted ConditionType = "AWSDefaultSecurityGroupDeleted"

	// PlatformCredentialsFound indicates that credentials required for the
	// desired platform are valid.
	// A failure here is unlikely to resolve without the changing user input.
	PlatformCredentialsFound ConditionType = "PlatformCredentialsFound"

	// ReconciliationActive indicates if reconciliation of the HostedCluster is
	// active or paused hostedCluster.spec.pausedUntil.
	ReconciliationActive ConditionType = "ReconciliationActive"
	// ReconciliationSucceeded indicates if the HostedCluster reconciliation
	// succeeded.
	// A failure here often means a software bug or a non-stable cluster.
	ReconciliationSucceeded ConditionType = "ReconciliationSucceeded"

	// EtcdRecoveryActive indicates that the Etcd cluster is failing and the
	// recovery job was triggered.
	EtcdRecoveryActive ConditionType = "EtcdRecoveryActive"

	// ClusterSizeComputed indicates that a t-shirt size was computed for this HostedCluster.
	// The last transition time for this condition is used to manage how quickly transitions occur.
	ClusterSizeComputed = "ClusterSizeComputed"
	// ClusterSizeTransitionPending indicates that a t-shirt size transition is pending, but has
	// not been applied yet. This may either be due to transition delays on the cluster itself
	// or from management-cluster-wide limits to transition throughput.
	ClusterSizeTransitionPending = "ClusterSizeTransitionPending"
	// ClusterSizeTransitionRequired exposes the next t-shirt size that the cluster will transition to.
	ClusterSizeTransitionRequired = "ClusterSizeTransitionRequired"
)

// Reasons.
const (
	StatusUnknownReason         = "StatusUnknown"
	AsExpectedReason            = "AsExpected"
	NotFoundReason              = "NotFound"
	WaitingForAvailableReason   = "WaitingForAvailable"
	SecretNotFoundReason        = "SecretNotFound"
	WaitingForGracePeriodReason = "WaitingForGracePeriod"
	BlockedReason               = "Blocked"

	InfraStatusFailureReason           = "InfraStatusFailure"
	WaitingOnInfrastructureReadyReason = "WaitingOnInfrastructureReady"

	EtcdQuorumAvailableReason     = "QuorumAvailable"
	EtcdWaitingForQuorumReason    = "EtcdWaitingForQuorum"
	EtcdStatefulSetNotFoundReason = "StatefulSetNotFound"
	EtcdRecoveryJobFailedReason   = "EtcdRecoveryJobFailed"

	UnmanagedEtcdMisconfiguredReason = "UnmanagedEtcdMisconfigured"
	UnmanagedEtcdAsExpected          = "UnmanagedEtcdAsExpected"

	FromClusterVersionReason = "FromClusterVersion"

	InvalidConfigurationReason            = "InvalidConfiguration"
	KubeconfigWaitingForCreateReason      = "KubeconfigWaitingForCreate"
	UnsupportedHostedClusterReason        = "UnsupportedHostedCluster"
	InsufficientClusterCapabilitiesReason = "InsufficientClusterCapabilities"
	OIDCConfigurationInvalidReason        = "OIDCConfigurationInvalid"
	PlatformCredentialsNotFoundReason     = "PlatformCredentialsNotFound"
	InvalidImageReason                    = "InvalidImage"
	InvalidIdentityProvider               = "InvalidIdentityProvider"
	PayloadArchNotFoundReason             = "PayloadArchNotFound"

	InvalidIAMRoleReason = "InvalidIAMRole"

	InvalidAzureCredentialsReason = "InvalidAzureCredentials"
	AzureErrorReason              = "AzureError"

	ExternalDNSHostNotReachableReason = "ExternalDNSHostNotReachable"

	KASLoadBalancerNotReachableReason = "KASLoadBalancerNotReachable"

	MissingReleaseImagesReason = "MissingReleaseImages"

	ReconciliationPausedConditionReason             = "ReconciliationPaused"
	ReconciliationInvalidPausedUntilConditionReason = "InvalidPausedUntilValue"

	KubeVirtSuboptimalMTUReason = "KubeVirtSuboptimalMTUDetected"

	KubeVirtNodesLiveMigratableReason = "KubeVirtNodesNotLiveMigratable"
)

// Messages.
const (
	// AllIsWellMessage is standard message.
	AllIsWellMessage = "All is well"
)


NodePool Conditions dictionary:
// Conditions
const (
	// NodePoolValidGeneratedPayloadConditionType signals if the ignition sever generated an ignition payload successfully for Nodes in that pool.
	// A failure here often means a software bug or a non-stable cluster.
	NodePoolValidGeneratedPayloadConditionType = "ValidGeneratedPayload"
	// NodePoolValidPlatformImageType signals if an OS image e.g. an AMI was found successfully based on the consumer input e.g. releaseImage.
	// If the image is direct user input then this condition is meaningless.
	// A failure here is unlikely to resolve without the changing user input.
	NodePoolValidPlatformImageType = "ValidPlatformImage"
	// NodePoolValidReleaseImageConditionType signals if the input in nodePool.spec.release.image is valid.
	// A failure here is unlikely to resolve without the changing user input.
	NodePoolValidReleaseImageConditionType = "ValidReleaseImage"
	// NodePoolValidMachineConfigConditionType signals if the content within nodePool.spec.config is valid.
	// A failure here is unlikely to resolve without the changing user input.
	NodePoolValidMachineConfigConditionType = "ValidMachineConfig"
	// NodePoolValidTuningConfigConditionType signals if the content within nodePool.spec.tuningConfig is valid.
	// A failure here is unlikely to resolve without the changing user input.
	NodePoolValidTuningConfigConditionType = "ValidTuningConfig"

	// NodePoolUpdateManagementEnabledConditionType signals if the nodePool.spec.management input is valid.
	// A failure here is unlikely to resolve without the changing user input.
	NodePoolUpdateManagementEnabledConditionType = "UpdateManagementEnabled"
	// NodePoolAutoscalingEnabledConditionType signals if nodePool.spec.replicas and nodePool.spec.AutoScaling input is valid.
	// A failure here is unlikely to resolve without the changing user input.
	NodePoolAutoscalingEnabledConditionType = "AutoscalingEnabled"
	// NodePoolAutorepairEnabledConditionType signals if MachineHealthChecks resources were created successfully.
	// A failure here often means a software bug or a non-stable cluster.
	NodePoolAutorepairEnabledConditionType = "AutorepairEnabled"

	// NodePoolUpdatingVersionConditionType signals if a version update is currently happening in NodePool.
	NodePoolUpdatingVersionConditionType = "UpdatingVersion"
	// NodePoolUpdatingConfigConditionType signals if a config update is currently happening in NodePool.
	NodePoolUpdatingConfigConditionType = "UpdatingConfig"
	// NodePoolUpdatingPlatformMachineTemplateConditionType signals if a platform machine template update is currently happening in NodePool.
	NodePoolUpdatingPlatformMachineTemplateConditionType = "UpdatingPlatformMachineTemplate"
	// NodePoolReadyConditionType bubbles up CAPI MachineDeployment/MachineSet Ready condition.
	// This is true when all replicas are ready Nodes.
	// When this is false for too long, NodePoolAllMachinesReadyConditionType and NodePoolAllNodesHealthyConditionType might provide more context.
	NodePoolReadyConditionType = "Ready"
	// NodePoolAllMachinesReadyConditionType bubbles up and aggregates CAPI Machine Ready condition.
	// It signals when the infrastructure for a Machine resource was created successfully.
	// https://github.com/kubernetes-sigs/cluster-api/blob/main/api/v1beta1/condition_consts.go
	// A failure here may require external user intervention to resolve. E.g. hitting quotas on the cloud provider.
	NodePoolAllMachinesReadyConditionType = "AllMachinesReady"
	// NodePoolAllNodesHealthyConditionType bubbles up and aggregates CAPI NodeHealthy condition.
	// It signals when the Node for a Machine resource is healthy.
	// https://github.com/kubernetes-sigs/cluster-api/blob/main/api/v1beta1/condition_consts.go
	// A failure here often means a software bug or a non-stable cluster.
	NodePoolAllNodesHealthyConditionType = "AllNodesHealthy"

	// NodePoolReconciliationActiveConditionType signals the state of nodePool.spec.pausedUntil.
	NodePoolReconciliationActiveConditionType = "ReconciliationActive"

	// NodePoolReachedIgnitionEndpoint signals if at least an instance was able to reach the ignition endpoint to get the payload.
	// When this is false for too long it may require external user intervention to resolve. E.g. Enable AWS security groups to enable networking access.
	NodePoolReachedIgnitionEndpoint = "ReachedIgnitionEndpoint"

	// NodePoolAWSSecurityGroupAvailableConditionType signals whether the NodePool has an available security group to use.
	// If the security group is specified for the NodePool, this condition is always true. If no security group is specified
	// for the NodePool, the status of this condition depends on the availability of the default security group in the HostedCluster.
	NodePoolAWSSecurityGroupAvailableConditionType = "AWSSecurityGroupAvailable"

	// NodePoolValidMachineTemplateConditionType signal that the machine template created by the node pool is valid
	NodePoolValidMachineTemplateConditionType = "ValidMachineTemplate"

	// NodePoolClusterNetworkCIDRConflictType signals if a NodePool's machine objects are colliding with the
	// cluster network's CIDR range. This can indicate why some network functionality might be degraded.
	NodePoolClusterNetworkCIDRConflictType = "ClusterNetworkCIDRConflict"

	// KubeVirtNodesLiveMigratable indicates if all (VirtualMachines) nodes of the kubevirt
	// hosted cluster can be live migrated without experiencing a node restart
	NodePoolKubeVirtLiveMigratableType = "KubeVirtNodesLiveMigratable"
)

// PerformanceProfile Conditions
const (

	// NodePoolPerformanceProfileTuningConditionTypePrefix is a common prefix to all PerformanceProfile
	// status conditions reported by NTO
	NodePoolPerformanceProfileTuningConditionTypePrefix = "performance.operator.openshift.io"

	// NodePoolPerformanceProfileTuningAvailableConditionType signals that the PerformanceProfile associated with the
	// NodePool is available and its tunings were being applied successfully.
	NodePoolPerformanceProfileTuningAvailableConditionType = NodePoolPerformanceProfileTuningConditionTypePrefix + "/Available"

	// NodePoolPerformanceProfileTuningProgressingConditionType signals that the PerformanceProfile associated with the
	// NodePool is in the middle of its tuning processing and its in progressing state.
	NodePoolPerformanceProfileTuningProgressingConditionType = NodePoolPerformanceProfileTuningConditionTypePrefix + "/Progressing"

	// NodePoolPerformanceProfileTuningUpgradeableConditionType signals that it's safe to
	// upgrade the PerformanceProfile operator component
	NodePoolPerformanceProfileTuningUpgradeableConditionType = NodePoolPerformanceProfileTuningConditionTypePrefix + "/Upgradeable"

	// NodePoolPerformanceProfileTuningDegradedConditionType signals that the PerformanceProfile associated with the
	// NodePool is failed to apply its tuning.
	// This is usually happening because more lower-level components failed to apply successfully, like
	// MachineConfig or KubeletConfig
	NodePoolPerformanceProfileTuningDegradedConditionType = NodePoolPerformanceProfileTuningConditionTypePrefix + "/Degraded"
)

// Reasons
const (
	NodePoolValidationFailedReason        = "ValidationFailed"
	NodePoolInplaceUpgradeFailedReason    = "InplaceUpgradeFailed"
	NodePoolNotFoundReason                = "NotFound"
	NodePoolFailedToGetReason             = "FailedToGet"
	IgnitionEndpointMissingReason         = "IgnitionEndpointMissing"
	IgnitionCACertMissingReason           = "IgnitionCACertMissing"
	IgnitionNotReached                    = "ignitionNotReached"
	DefaultAWSSecurityGroupNotReadyReason = "DefaultSGNotReady"
	NodePoolValidArchPlatform             = "ValidArchPlatform"
	NodePoolInvalidArchPlatform           = "InvalidArchPlatform"
	InvalidKubevirtMachineTemplate        = "InvalidKubevirtMachineTemplate"
	InvalidOpenStackMachineTemplate       = "InvalidOpenStackMachineTemplate"
	CIDRConflictReason                    = "CIDRConflict"
	NodePoolKubeVirtLiveMigratableReason  = "KubeVirtNodesNotLiveMigratable"
)

At the end provide a summary including the overall health of the fleet of HostedClusters and NodePools.
`, k8sData)

	fmt.Println("Prompt: ", prompt)
	reqBody := Request{
		Model:  c.model,
		Prompt: prompt,
		Stream: false,
		Options: Options{
			Temperature: 0.7,
			MaxTokens:   2000,
		},
	}

	reqJSON, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/api/generate", "application/json", bytes.NewBuffer(reqJSON))
	if err != nil {
		return "", fmt.Errorf("failed to send request to Ollama: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Ollama API error (status %d): %s", resp.StatusCode, string(body))
	}

	var response Response
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return response.Response, nil
}
