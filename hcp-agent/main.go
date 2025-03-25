package main

import (
	"flag"
	"os"

	"github.com/yourusername/k8s-llm-analyzer/pkg/controller"
	"github.com/yourusername/k8s-llm-analyzer/pkg/llm"
	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	_ "k8s.io/client-go/plugin/pkg/client/auth"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
)

var (
	scheme   = runtime.NewScheme()
	setupLog = ctrl.Log.WithName("setup")
)

func init() {
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
}

func main() {
	var (
		namespace        string
		ollamaURL        string
		ollamaModel      string
		analysisQuestion string
	)

	flag.StringVar(&namespace, "namespace", "", "Namespace to watch for resources. Leave empty to watch all namespaces.")
	flag.StringVar(&ollamaURL, "ollama-url", "http://localhost:11434", "Ollama API URL")
	flag.StringVar(&ollamaModel, "ollama-model", "qwen2.5", "Ollama model to use")
	flag.StringVar(&analysisQuestion, "analysis-question", "Analyze these resources status and conditions.",
		"Question to ask the LLM about the resources")

	opts := zap.Options{
		Development: true,
	}
	opts.BindFlags(flag.CommandLine)
	flag.Parse()
	ctrl.SetLogger(zap.New(zap.UseFlagOptions(&opts)))

	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
		Scheme:         scheme,
		LeaderElection: false,
	})
	if err != nil {
		setupLog.Error(err, "unable to start manager")
		os.Exit(1)
	}

	// Create Ollama client
	ollamaClient := llm.NewOllamaClient(ollamaURL, ollamaModel)

	// Setup the controller
	if err = controller.NewReconciler(
		mgr.GetClient(),
		ollamaClient,
		analysisQuestion,
		ctrl.Log.WithName("controllers").WithName("HyperShift"),
	).SetupWithManager(mgr); err != nil {
		setupLog.Error(err, "unable to create controller", "controller", "HyperShift")
		os.Exit(1)
	}

	setupLog.Info("starting manager", "namespace", namespace)
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		setupLog.Error(err, "problem running manager")
		os.Exit(1)
	}
}
