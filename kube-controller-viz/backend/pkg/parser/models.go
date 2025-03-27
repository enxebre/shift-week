package parser

// ControllerEvent represents an event in the controller's queue
type ControllerEvent struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Key         string `json:"key"`
	Namespace   string `json:"namespace"`
	Name        string `json:"name"`
	Timestamp   int64  `json:"timestamp"`
	Status      string `json:"status"` // queued, processing, completed, failed
	ReconcileID string `json:"reconcileId"`
}

// ReconcileStep represents a step in the reconciliation process
type ReconcileStep struct {
	ID            string `json:"id"`
	EventID       string `json:"eventId"`
	StepType      string `json:"stepType"`
	Description   string `json:"description"`
	Timestamp     int64  `json:"timestamp"`
	Duration      int64  `json:"duration"` // in milliseconds
	Status        string `json:"status"`   // started, completed, failed
	ReconcileID   string `json:"reconcileId"`
	Controller    string `json:"controller,omitempty"`
	ControllerGrp string `json:"controllerGroup,omitempty"`
	ControllerKnd string `json:"controllerKind,omitempty"`
	Namespace     string `json:"namespace,omitempty"`
	Name          string `json:"name,omitempty"`
	RawLogLine    string `json:"_original,omitempty"` // The original log line
}

// ReconcileStat represents statistics about a specific reconciliation process
type ReconcileStat struct {
	ID        string `json:"id"`        // reconcileID
	StepCount int    `json:"stepCount"` // how many steps in this reconcile process
	Status    string `json:"status"`    // current status of this reconcile process
}

// ControllerState represents the current state of the controller
type ControllerState struct {
	QueueLength    int                      `json:"queueLength"`
	ProcessingRate float64                  `json:"processingRate"` // events per second
	Events         []ControllerEvent        `json:"events"`
	RecentSteps    []ReconcileStep          `json:"recentSteps"`
	ReconcileStats map[string]ReconcileStat `json:"reconcileStats"` // stats per reconcileID
}
