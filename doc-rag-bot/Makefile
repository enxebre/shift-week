# Setting SHELL to bash allows bash commands to be executed by recipes
SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

# Directory structure
BIN_DIR = bin
DOCS_DIR = docs

# Add this line near the top
ARGS ?=

.PHONY: all
all: build

.PHONY: fmt
fmt: ## Run go fmt against code.
	go fmt ./cmd/... ./pkg/...

.PHONY: vet
vet: ## Run go vet against code.
	go vet ./cmd/... ./pkg/...

.PHONY: build
build: fmt vet ## Build the binary.
	mkdir -p $(BIN_DIR)
	go build -o $(BIN_DIR)/doc-rag-bot ./cmd/main.go

.PHONY: run
run: build ## Run the bot from your host.
	./$(BIN_DIR)/doc-rag-bot --docs=$(DOCS_DIR) $(ARGS)

.PHONY: clean
clean: ## Clean build artifacts.
	rm -rf $(BIN_DIR)

.PHONY: setup-docs
setup-docs: ## Create sample documents for testing.
	mkdir -p $(DOCS_DIR)
	@echo "Creating sample documents in $(DOCS_DIR)..."
	@echo "This is a sample document about artificial intelligence. AI is the simulation of human intelligence processes by machines, especially computer systems." > $(DOCS_DIR)/ai.txt
	@echo "Kubernetes is an open-source container orchestration platform that automates the deployment, scaling, and management of containerized applications." > $(DOCS_DIR)/kubernetes.txt
	@echo "Sample documents created successfully."

.PHONY: help
help: ## Display this help.
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' 