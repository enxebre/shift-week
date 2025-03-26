package parser

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"
)

// LogParser parses controller log files
type LogParser struct {
	filePath       string
	eventRegex     *regexp.Regexp
	reconcileRegex *regexp.Regexp
	events         map[string]ControllerEvent
	steps          map[string][]ReconcileStep
}

// LogEntry represents a JSON log entry
type LogEntry struct {
	Level         string `json:"level"`
	Timestamp     string `json:"ts"`
	Message       string `json:"msg"`
	Controller    string `json:"controller"`
	ControllerGrp string `json:"controllerGroup"`
	ControllerKnd string `json:"controllerKind"`
	Resource      string `json:"name"`
	Namespace     string `json:"namespace"`
	ReconcileID   string `json:"reconcileID"`
}

// NewLogParser creates a new log parser for the given file
func NewLogParser(filePath string) (*LogParser, error) {
	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, fmt.Errorf("log file does not exist: %s", filePath)
	}

	// For JSON logs, we don't need the regexes, but keeping them for backward compatibility
	eventRegex := regexp.MustCompile(`Event: (ADD|UPDATE|DELETE) (\S+) (\S+)/(\S+)`)
	reconcileRegex := regexp.MustCompile(`Reconcile: (START|COMPLETE|ERROR) (\S+) (\S+)/(\S+)`)

	return &LogParser{
		filePath:       filePath,
		eventRegex:     eventRegex,
		reconcileRegex: reconcileRegex,
		events:         make(map[string]ControllerEvent),
		steps:          make(map[string][]ReconcileStep),
	}, nil
}

// ParseLogs parses the log file and returns the controller state
func (p *LogParser) ParseLogs() (*ControllerState, error) {
	file, err := os.Open(p.filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open log file: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)

	// Track events and steps
	var events []ControllerEvent
	var steps []ReconcileStep

	// Track which reconcileIDs we've already seen
	reconcileIDs := make(map[string]bool)

	// Map to track step counts per reconcileID
	stepCounts := make(map[string]int)

	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()

		// Try to parse as JSON first
		var logEntry LogEntry
		if err := json.Unmarshal([]byte(line), &logEntry); err == nil {
			// Successfully parsed as JSON
			timestamp, _ := time.Parse(time.RFC3339, logEntry.Timestamp)

			// Extract reconcileID - critical for visualization
			reconcileID := logEntry.ReconcileID
			if reconcileID == "" {
				// Try to extract from other fields if not directly available
				if reconcileMap, ok := getField([]byte(line), "reconcileID"); ok {
					if id, ok := reconcileMap.(string); ok {
						reconcileID = id
					}
				}
			}

			// Skip entries without reconcileID
			if reconcileID == "" {
				continue
			}

			// Track this reconcileID
			reconcileIDs[reconcileID] = true

			// Update step count for this reconcileID
			stepCounts[reconcileID]++

			// Create an event ID that includes reconcileID
			eventID := fmt.Sprintf("%s-%s-%s-%s",
				logEntry.Controller,
				logEntry.Namespace,
				logEntry.Resource,
				reconcileID[:8]) // Use first 8 chars of reconcileID for readability

			// Determine event type based on message
			eventType := "INFO"
			if strings.Contains(logEntry.Message, "reconciling") {
				eventType = "RECONCILE-START"
			} else if strings.Contains(logEntry.Message, "Deleted") ||
				strings.Contains(logEntry.Message, "Complete") ||
				strings.Contains(logEntry.Message, "complete") {
				eventType = "RECONCILE-COMPLETE"
			} else if strings.Contains(logEntry.Message, "ERROR") ||
				strings.Contains(logEntry.Message, "error") ||
				strings.Contains(logEntry.Message, "fail") ||
				strings.Contains(logEntry.Message, "Fail") {
				eventType = "RECONCILE-ERROR"
			}

			// Create event
			event := ControllerEvent{
				ID:          eventID + "-" + fmt.Sprintf("%d", lineNum),
				Type:        eventType,
				Key:         logEntry.ControllerKnd,
				Namespace:   logEntry.Namespace,
				Name:        logEntry.Resource,
				Timestamp:   timestamp.UnixNano() / int64(time.Millisecond),
				Status:      strings.ToLower(eventType),
				ReconcileID: reconcileID,
			}

			p.events[eventID] = event
			events = append(events, event)

			// Create step for each log entry
			step := ReconcileStep{
				ID:          fmt.Sprintf("%s-%d", eventID, lineNum),
				EventID:     eventID,
				StepType:    eventType,
				Description: logEntry.Message,
				Timestamp:   timestamp.UnixNano() / int64(time.Millisecond),
				Duration:    0,
				Status:      strings.ToLower(eventType),
				ReconcileID: reconcileID,
			}

			p.steps[eventID] = append(p.steps[eventID], step)
			steps = append(steps, step)

			continue
		}

		// Fallback to regex-based parsing (original code)
		// Try to match event pattern
		if matches := p.eventRegex.FindStringSubmatch(line); matches != nil {
			timestamp, _ := time.Parse(time.RFC3339, matches[1])
			eventType := matches[2]
			key := matches[3]
			namespace := matches[4]
			name := matches[5]

			eventID := fmt.Sprintf("%s-%s-%s", eventType, namespace, name)

			event := ControllerEvent{
				ID:        eventID,
				Type:      eventType,
				Key:       key,
				Namespace: namespace,
				Name:      name,
				Timestamp: timestamp.UnixNano() / int64(time.Millisecond),
				Status:    "queued",
			}

			p.events[eventID] = event
			events = append(events, event)
		}

		// Try to match reconcile pattern
		if matches := p.reconcileRegex.FindStringSubmatch(line); matches != nil {
			timestamp, _ := time.Parse(time.RFC3339, matches[1])
			stepType := matches[2]
			namespace := matches[4]
			name := matches[5]

			eventID := fmt.Sprintf("%s-%s-%s", "RECONCILE", namespace, name)
			stepID := fmt.Sprintf("%s-%d", eventID, lineNum)

			step := ReconcileStep{
				ID:          stepID,
				EventID:     eventID,
				StepType:    stepType,
				Description: fmt.Sprintf("Reconciling %s/%s", namespace, name),
				Timestamp:   timestamp.UnixNano() / int64(time.Millisecond),
				Duration:    0, // Would need to calculate from subsequent logs
				Status:      strings.ToLower(stepType),
			}

			p.steps[eventID] = append(p.steps[eventID], step)
			steps = append(steps, step)

			// Update event status based on reconcile step
			if event, ok := p.events[eventID]; ok {
				switch stepType {
				case "START":
					event.Status = "processing"
				case "COMPLETE":
					event.Status = "completed"
				case "ERROR":
					event.Status = "failed"
				}
				p.events[eventID] = event
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading log file: %v", err)
	}

	// Calculate processing rate (events per second)
	// This is a simplified calculation
	processingRate := 0.0
	if len(events) > 0 {
		firstEvent := events[0]
		lastEvent := events[len(events)-1]
		durationSec := float64(lastEvent.Timestamp-firstEvent.Timestamp) / 1000.0
		if durationSec > 0 {
			processingRate = float64(len(events)) / durationSec
		}
	}

	// Add metadata about reconcileIDs
	reconcileStats := make(map[string]ReconcileStat)
	for id, count := range stepCounts {
		reconcileStats[id] = ReconcileStat{
			ID:        id,
			StepCount: count,
			Status:    getReconcileStatus(id, steps),
		}
	}

	return &ControllerState{
		QueueLength:    len(events),
		ProcessingRate: processingRate,
		Events:         events,
		RecentSteps:    steps,
		ReconcileStats: reconcileStats,
	}, nil
}

// Helper function to extract a field from JSON
func getField(jsonData []byte, fieldName string) (interface{}, bool) {
	var data map[string]interface{}
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return nil, false
	}
	if val, ok := data[fieldName]; ok {
		return val, true
	}
	return nil, false
}

// Determine the overall status of a reconcileID
func getReconcileStatus(reconcileID string, steps []ReconcileStep) string {
	var lastStep ReconcileStep
	var found bool

	// Find the most recent step for this reconcileID
	for i := len(steps) - 1; i >= 0; i-- {
		if steps[i].ReconcileID == reconcileID {
			lastStep = steps[i]
			found = true
			break
		}
	}

	if !found {
		return "unknown"
	}

	// Return the status of the last step
	return lastStep.Status
}

// GetControllerState returns the current state of the controller
func (p *LogParser) GetControllerState() (*ControllerState, error) {
	return p.ParseLogs()
}

// GetEventsJSON returns the events as JSON
func (p *LogParser) GetEventsJSON() (string, error) {
	state, err := p.ParseLogs()
	if err != nil {
		return "", err
	}

	jsonData, err := json.Marshal(state.Events)
	if err != nil {
		return "", fmt.Errorf("failed to marshal events to JSON: %v", err)
	}

	return string(jsonData), nil
}

// GetStepsJSON returns the reconcile steps as JSON
func (p *LogParser) GetStepsJSON() (string, error) {
	state, err := p.ParseLogs()
	if err != nil {
		return "", err
	}

	jsonData, err := json.Marshal(state.RecentSteps)
	if err != nil {
		return "", fmt.Errorf("failed to marshal steps to JSON: %v", err)
	}

	return string(jsonData), nil
}
