package rag

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// EmbeddingAPI handles interactions with the embedding model
type EmbeddingAPI struct {
	baseURL string
	model   string
	client  *http.Client
}

// EmbeddingRequest represents a request to the embedding API
type EmbeddingRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

// EmbeddingResponse represents a response from the embedding API
type EmbeddingResponse struct {
	Embedding []float32 `json:"embedding"`
}

// NewEmbeddingAPI creates a new embedding API client
func NewEmbeddingAPI(baseURL, model string) *EmbeddingAPI {
	return &EmbeddingAPI{
		baseURL: baseURL,
		model:   model,
		client:  &http.Client{},
	}
}

// GetEmbedding generates an embedding for the given text
func (e *EmbeddingAPI) GetEmbedding(text string) ([]float32, error) {
	reqBody := EmbeddingRequest{
		Model:  e.model,
		Prompt: text,
	}

	reqJSON, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := e.client.Post(e.baseURL+"/api/embeddings", "application/json", bytes.NewBuffer(reqJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to send request to embedding API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding API error (status %d): %s", resp.StatusCode, string(body))
	}

	var response EmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return response.Embedding, nil
}
