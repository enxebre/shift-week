package rag

import (
	"fmt"
	"math"
	"sort"
	"strings"
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

// Add BM25 scoring for keyword matching
func calculateBM25Score(query string, chunk *Chunk) float32 {
	// Constants for BM25
	const k1 = 1.2
	const b = 0.75
	const avgDocLength = 500.0 // This should ideally be calculated from your corpus

	// Tokenize query and document
	queryTerms := strings.Fields(strings.ToLower(query))
	docTerms := strings.Fields(strings.ToLower(chunk.Content))

	docLength := float32(len(docTerms))

	// Count term frequencies
	termFreq := make(map[string]int)
	for _, term := range docTerms {
		termFreq[term]++
	}

	// Calculate BM25 score
	var score float32
	for _, term := range queryTerms {
		if freq, exists := termFreq[term]; exists {
			// Calculate IDF - in a real implementation, this would use corpus statistics
			// Here we use a simplified approach
			idf := float32(1.0) // Simplified IDF

			// BM25 term scoring formula
			numerator := float32(freq) * (k1 + 1)
			denominator := float32(freq) + k1*(1-b+b*(docLength/avgDocLength))
			score += idf * (numerator / denominator)
		}
	}

	return score
}

// Update the query expansion function to be more generic
func expandQuery(query string) string {
	// Split the query into terms
	// terms := strings.Fields(strings.ToLower(query))

	// // Common technical troubleshooting terms
	// troubleshootingTerms := map[string]bool{
	// 	"troubleshoot": true,
	// 	"debug":        true,
	// 	"fix":          true,
	// 	"issue":        true,
	// 	"problem":      true,
	// 	"error":        true,
	// 	"fail":         true,
	// 	"failure":      true,
	// }

	// // Check if this is a troubleshooting query
	// isTroubleshooting := false
	// for _, term := range terms {
	// 	if troubleshootingTerms[term] {
	// 		isTroubleshooting = true
	// 		break
	// 	}
	// }

	// // Expand with generic terms based on query type
	// expanded := query
	// if isTroubleshooting {
	// 	expanded += " resolve solution steps guide how-to fix repair"
	// }

	return query
}

// Update RetrieveRelevantChunks to use the generic query expansion
func (r *Retriever) RetrieveRelevantChunks(query string, topK int) ([]string, error) {
	// Expand the query with related terms
	expandedQuery := expandQuery(query)

	if expandedQuery != query {
		fmt.Printf("Original query: %s\nExpanded query: %s\n", query, expandedQuery)
	}

	// Generate embedding for the query
	queryEmbedding, err := r.indexer.embeddingAPI.GetEmbedding(expandedQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to generate embedding for query: %w", err)
	}

	// Get all chunks
	allChunks := r.indexer.GetAllChunks()
	fmt.Printf("Total chunks available: %d\n", len(allChunks))

	// Calculate scores with hybrid approach (semantic + BM25)
	var scores []ChunkScore
	for _, chunk := range allChunks {
		// Semantic similarity
		semanticScore := cosineSimilarity(queryEmbedding, chunk.Embedding) * 0.8

		// BM25 score for keyword matching
		bm25Score := calculateBM25Score(query, chunk) * 0.2

		// Combined score
		totalScore := semanticScore + bm25Score

		scores = append(scores, ChunkScore{
			Chunk: chunk,
			Score: totalScore,
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
