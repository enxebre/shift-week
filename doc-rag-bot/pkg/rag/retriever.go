package rag

import (
	"fmt"
	"math"
	"sort"
)

// Retriever handles retrieving relevant document chunks
type Retriever struct {
	indexer *Indexer
}

// ChunkScore represents a chunk with its relevance score
type ChunkScore struct {
	Chunk *Chunk
	Score float32
}

// NewRetriever creates a new retriever
func NewRetriever(indexer *Indexer) *Retriever {
	return &Retriever{
		indexer: indexer,
	}
}

// RetrieveRelevantChunks retrieves the most relevant chunks for a query
func (r *Retriever) RetrieveRelevantChunks(query string, topK int) ([]string, error) {
	// Generate embedding for the query
	queryEmbedding, err := r.indexer.embeddingAPI.GetEmbedding(query)
	if err != nil {
		return nil, fmt.Errorf("failed to generate embedding for query: %w", err)
	}

	// Get all chunks
	allChunks := r.indexer.GetAllChunks()
	fmt.Printf("Total chunks available: %d\n", len(allChunks))

	// Calculate similarity scores
	var scores []ChunkScore
	for _, chunk := range allChunks {
		score := cosineSimilarity(queryEmbedding, chunk.Embedding)
		scores = append(scores, ChunkScore{
			Chunk: chunk,
			Score: score,
		})
	}

	// Sort by score (descending)
	sort.Slice(scores, func(i, j int) bool {
		return scores[i].Score > scores[j].Score
	})

	// Get top K chunks
	var result []string
	fmt.Println("\nTop retrieved chunks:")
	fmt.Println("---------------------")
	for i := 0; i < topK && i < len(scores); i++ {
		result = append(result, scores[i].Chunk.Content)
		fmt.Printf("Score: %.4f, Document: %s\n", scores[i].Score, scores[i].Chunk.DocID)
		// Print a preview of the chunk content (first 100 chars)
		preview := scores[i].Chunk.Content
		if len(preview) > 100 {
			preview = preview[:100] + "..."
		}
		fmt.Printf("Preview: %s\n\n", preview)
	}
	fmt.Println("---------------------")

	return result, nil
}

// cosineSimilarity calculates the cosine similarity between two vectors
func cosineSimilarity(a, b []float32) float32 {
	var dotProduct float32
	var normA float32
	var normB float32

	for i := 0; i < len(a); i++ {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	// Avoid division by zero
	if normA == 0 || normB == 0 {
		return 0
	}

	return dotProduct / (float32(math.Sqrt(float64(normA))) * float32(math.Sqrt(float64(normB))))
}
