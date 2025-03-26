package rag

import (
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Document represents a document with its content and metadata
type Document struct {
	ID       string
	Content  string
	Filename string
	Chunks   []Chunk
}

// Chunk represents a chunk of text from a document
type Chunk struct {
	ID        string
	Content   string
	DocID     string
	Embedding []float32
}

// Indexer handles document indexing and chunking
type Indexer struct {
	Documents    map[string]*Document
	Chunks       map[string]*Chunk
	embeddingAPI *EmbeddingAPI
	chunkSize    int
	chunkOverlap int
}

// NewIndexer creates a new document indexer
func NewIndexer(ollamaURL, embeddingModel string) *Indexer {
	return &Indexer{
		Documents:    make(map[string]*Document),
		Chunks:       make(map[string]*Chunk),
		embeddingAPI: NewEmbeddingAPI(ollamaURL, embeddingModel),
		chunkSize:    500, // Smaller chunk size (was 1000)
		chunkOverlap: 100, // Smaller overlap (was 200)
	}
}

// IndexDirectory indexes all text files in a directory
func (i *Indexer) IndexDirectory(dirPath string) error {
	files, err := ioutil.ReadDir(dirPath)
	if err != nil {
		return fmt.Errorf("failed to read directory: %w", err)
	}

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		// Only process text files
		if !strings.HasSuffix(strings.ToLower(file.Name()), ".txt") {
			continue
		}

		filePath := filepath.Join(dirPath, file.Name())
		err := i.IndexFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to index file %s: %w", file.Name(), err)
		}
	}

	return nil
}

// IndexFile indexes a single text file
func (i *Indexer) IndexFile(filePath string) error {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	docID := filepath.Base(filePath)
	doc := &Document{
		ID:       docID,
		Content:  string(content),
		Filename: filePath,
		Chunks:   []Chunk{},
	}

	// Chunk the document
	chunks := i.chunkDocument(doc)

	// Generate embeddings for each chunk
	for idx := range chunks {
		embedding, err := i.embeddingAPI.GetEmbedding(chunks[idx].Content)
		if err != nil {
			return fmt.Errorf("failed to generate embedding for chunk: %w", err)
		}
		chunks[idx].Embedding = embedding
		i.Chunks[chunks[idx].ID] = &chunks[idx]
	}

	doc.Chunks = chunks
	i.Documents[docID] = doc

	fmt.Printf("Indexed document: %s with %d chunks\n", docID, len(chunks))
	return nil
}

// chunkDocument splits a document into chunks
func (i *Indexer) chunkDocument(doc *Document) []Chunk {
	content := doc.Content
	var chunks []Chunk

	// Split by paragraphs first
	paragraphs := strings.Split(content, "\n\n")

	var currentChunk strings.Builder
	chunkCount := 0

	for _, para := range paragraphs {
		// Skip empty paragraphs
		if strings.TrimSpace(para) == "" {
			continue
		}

		// If adding this paragraph would exceed the chunk size,
		// save the current chunk and start a new one
		if currentChunk.Len() > 0 && currentChunk.Len()+len(para) > i.chunkSize {
			chunkID := fmt.Sprintf("%s_chunk_%d", doc.ID, chunkCount)
			chunk := Chunk{
				ID:      chunkID,
				Content: currentChunk.String(),
				DocID:   doc.ID,
			}
			chunks = append(chunks, chunk)
			chunkCount++
			currentChunk.Reset()
		}

		// Add paragraph to current chunk
		if currentChunk.Len() > 0 {
			currentChunk.WriteString("\n\n")
		}
		currentChunk.WriteString(para)

		// If this paragraph alone is bigger than the chunk size,
		// we need to split it further
		if currentChunk.Len() > i.chunkSize {
			// Split by sentences
			sentences := splitIntoSentences(currentChunk.String())
			currentChunk.Reset()

			var sentenceChunk strings.Builder
			for _, sentence := range sentences {
				if sentenceChunk.Len()+len(sentence) > i.chunkSize {
					if sentenceChunk.Len() > 0 {
						chunkID := fmt.Sprintf("%s_chunk_%d", doc.ID, chunkCount)
						chunk := Chunk{
							ID:      chunkID,
							Content: sentenceChunk.String(),
							DocID:   doc.ID,
						}
						chunks = append(chunks, chunk)
						chunkCount++
						sentenceChunk.Reset()
					}
				}

				if sentenceChunk.Len() > 0 {
					sentenceChunk.WriteString(" ")
				}
				sentenceChunk.WriteString(sentence)
			}

			if sentenceChunk.Len() > 0 {
				currentChunk.WriteString(sentenceChunk.String())
			}
		}
	}

	// Don't forget the last chunk
	if currentChunk.Len() > 0 {
		chunkID := fmt.Sprintf("%s_chunk_%d", doc.ID, chunkCount)
		chunk := Chunk{
			ID:      chunkID,
			Content: currentChunk.String(),
			DocID:   doc.ID,
		}
		chunks = append(chunks, chunk)
	}

	return chunks
}

// Helper function to split text into sentences
func splitIntoSentences(text string) []string {
	// Simple sentence splitting by common sentence terminators
	// This is a basic implementation - could be improved with NLP libraries
	re := regexp.MustCompile(`[.!?]\s+`)
	sentences := re.Split(text, -1)

	var result []string
	for _, s := range sentences {
		s = strings.TrimSpace(s)
		if s != "" {
			result = append(result, s)
		}
	}
	return result
}

// GetAllChunks returns all indexed chunks
func (i *Indexer) GetAllChunks() []*Chunk {
	chunks := make([]*Chunk, 0, len(i.Chunks))
	for _, chunk := range i.Chunks {
		chunks = append(chunks, chunk)
	}
	return chunks
}
