package rag

import (
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
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

	// Simple chunking by character count
	for start := 0; start < len(content); start += i.chunkSize - i.chunkOverlap {
		end := start + i.chunkSize
		if end > len(content) {
			end = len(content)
		}

		chunkID := fmt.Sprintf("%s_chunk_%d", doc.ID, len(chunks))
		chunk := Chunk{
			ID:      chunkID,
			Content: content[start:end],
			DocID:   doc.ID,
		}
		chunks = append(chunks, chunk)

		if end == len(content) {
			break
		}
	}

	return chunks
}

// GetAllChunks returns all indexed chunks
func (i *Indexer) GetAllChunks() []*Chunk {
	chunks := make([]*Chunk, 0, len(i.Chunks))
	for _, chunk := range i.Chunks {
		chunks = append(chunks, chunk)
	}
	return chunks
}
