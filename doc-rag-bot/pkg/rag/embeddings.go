package rag

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode"
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

// Add this function to preprocess text before embedding
func preprocessText(text string) string {
	// Convert to lowercase for better matching
	text = strings.ToLower(text)

	// Remove excessive whitespace
	text = strings.Join(strings.Fields(text), " ")

	// Remove special characters that might not be relevant for semantic meaning
	text = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsSpace(r) || r == '.' || r == ',' || r == ':' || r == '-' {
			return r
		}
		return ' '
	}, text)

	return text
}

// Update GetEmbedding to use preprocessing
func (e *EmbeddingAPI) GetEmbedding(text string) ([]float32, error) {
	// Preprocess the text
	processedText := preprocessText(text)

	reqBody := EmbeddingRequest{
		Model:  e.model,
		Prompt: processedText,
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
