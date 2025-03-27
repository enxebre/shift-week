package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"kube-controller-viz/pkg/k8s"
	"kube-controller-viz/pkg/parser"
)

// Server represents the API server
type Server struct {
	logParser *parser.LogParser
	k8sClient *k8s.Client
}

// NewServer creates a new API server
func NewServer(logParser *parser.LogParser, k8sClient *k8s.Client) *Server {
	return &Server{
		logParser: logParser,
		k8sClient: k8sClient,
	}
}

// Start starts the API server on the specified port
func (s *Server) Start(port int) error {
	// Set up routes
	http.HandleFunc("/api/state", s.handleGetState)
	// Events represent controller events (ADD/UPDATE/DELETE) in the queue
	// Each event has a unique ID and contains metadata about the resource
	http.HandleFunc("/api/events", s.handleGetEvents)

	// Steps represent individual actions within a reconciliation process
	// Multiple steps can belong to a single event, showing the reconciliation progress
	http.HandleFunc("/api/steps", s.handleGetSteps)

	// Serve static files from the frontend directory
	fs := http.FileServer(http.Dir("../frontend/build"))
	http.Handle("/", fs)

	// Start the server
	return http.ListenAndServe(fmt.Sprintf(":%d", port), nil)
}

// handleGetState handles requests for the controller state
func (s *Server) handleGetState(w http.ResponseWriter, r *http.Request) {
	if s.logParser == nil {
		http.Error(w, "Log parser not initialized", http.StatusInternalServerError)
		return
	}

	state, err := s.logParser.GetControllerState()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get controller state: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

// handleGetEvents handles requests for controller events
func (s *Server) handleGetEvents(w http.ResponseWriter, r *http.Request) {
	if s.logParser == nil {
		http.Error(w, "Log parser not initialized", http.StatusInternalServerError)
		return
	}

	eventsJSON, err := s.logParser.GetEventsJSON()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get events: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(eventsJSON))
}

// handleGetSteps handles requests for reconcile steps
func (s *Server) handleGetSteps(w http.ResponseWriter, r *http.Request) {
	if s.logParser == nil {
		http.Error(w, "Log parser not initialized", http.StatusInternalServerError)
		return
	}

	stepsJSON, err := s.logParser.GetStepsJSON()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get steps: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(stepsJSON))
}
