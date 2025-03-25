package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
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

// GenerateWithContext sends a query with document context to the LLM
func (c *OllamaClient) GenerateWithContext(query string, contexts []string) (string, error) {
	// Combine contexts into a single string
	contextText := strings.Join(contexts, "\n\n")

	// Create the prompt with improved RAG format
	prompt := fmt.Sprintf(`You are an expert technical assistant specializing in Kubernetes, OpenShift, and HyperShift. 
Answer the following question using ONLY the information provided in the context below.

CONTEXT:
%s

QUESTION: %s

INSTRUCTIONS:
1. Answer ONLY based on the information in the context provided.
2. If the context doesn't contain enough information to fully answer the question, say "The provided context doesn't contain sufficient information about [specific missing information]."
3. Be specific, technical, and detailed in your response.
4. If the context contains relevant troubleshooting steps, include them in a clear, step-by-step format.
5. Format your response using markdown for readability.`, contextText, query)

	reqBody := Request{
		Model:  c.model,
		Prompt: prompt,
		Stream: false,
		Options: Options{
			Temperature: 0.3,  // Lower temperature for more focused responses
			MaxTokens:   2000, // Increased token limit for more detailed responses
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
