package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"kube-controller-viz/pkg/api"
	"kube-controller-viz/pkg/k8s"
	"kube-controller-viz/pkg/parser"
)

func main() {
	// Command line flags
	logFile := flag.String("log-file", "", "Path to controller log file to parse")
	useK8sAPI := flag.Bool("use-k8s-api", false, "Connect to Kubernetes API server")
	kubeconfig := flag.String("kubeconfig", "", "Path to kubeconfig file (defaults to in-cluster config if empty)")
	port := flag.Int("port", 8080, "Port to serve the API on")
	flag.Parse()

	// Initialize the log parser if a log file is provided
	var logParser *parser.LogParser
	if *logFile != "" {
		var err error
		logParser, err = parser.NewLogParser(*logFile)
		if err != nil {
			log.Fatalf("Failed to initialize log parser: %v", err)
		}
		log.Printf("Initialized log parser with file: %s", *logFile)
	}

	// Initialize Kubernetes client if requested
	var k8sClient *k8s.Client
	if *useK8sAPI {
		// If kubeconfig is not provided, use default path
		if *kubeconfig == "" {
			if home := os.Getenv("HOME"); home != "" {
				*kubeconfig = filepath.Join(home, ".kube", "config")
			}
		}

		var err error
		k8sClient, err = k8s.NewClient(*kubeconfig)
		if err != nil {
			log.Fatalf("Failed to create Kubernetes client: %v", err)
		}
		log.Println("Connected to Kubernetes API server")
	}

	// Start the API server
	server := api.NewServer(logParser, k8sClient)
	log.Printf("Starting API server on port %d...", *port)
	if err := server.Start(*port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
