.PHONY: all build run clean frontend backend

all: build

# Build both frontend and backend
build: frontend backend

# Build frontend
frontend:
	cd frontend && npm install && npm run build

# Build backend
backend:
	cd backend && go build -o bin/server cmd/server.go

# Run the application
run: build
	cd backend && ./bin/server

# Run with a sample log file
run-with-log:
	cd backend && ./bin/server --log-file=sample.log

# Run with Kubernetes API
run-with-k8s:
	cd backend && ./bin/server --use-k8s-api

# Clean build artifacts
clean:
	rm -rf frontend/build
	rm -rf backend/bin

# Development: Run frontend dev server
dev-frontend:
	cd frontend && npm start

# Development: Run backend server
dev-backend:
	cd backend && go run cmd/server.go 