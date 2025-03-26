package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"strings"

	"doc-rag-bot/pkg/llm"
	"doc-rag-bot/pkg/rag"
)

func main() {
	// Define command-line flags
	docsDir := flag.String("docs", "./docs", "Directory containing documents to index")
	ollamaURL := flag.String("ollama-url", "http://localhost:11434", "Ollama API URL")
	embeddingModel := flag.String("embedding-model", "llama3", "Ollama model to use for embeddings")
	llmModel := flag.String("llm-model", "qwen2.5", "Ollama model to use for generation")
	flag.Parse()

	// Create Ollama client
	ollamaClient := llm.NewOllamaClient(*ollamaURL, *llmModel)

	// Create indexer and index documents
	fmt.Println("Indexing documents from", *docsDir)
	indexer := rag.NewIndexer(*ollamaURL, *embeddingModel)
	err := indexer.IndexDirectory(*docsDir)
	if err != nil {
		fmt.Printf("Error indexing documents: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Indexing complete!")

	// Create retriever
	retriever := rag.NewRetriever(indexer)

	// Main interaction loop
	scanner := bufio.NewScanner(os.Stdin)
	fmt.Println("\nSpecial commands:")
	fmt.Println("  exit - Exit the program")
	fmt.Println("  list - List all indexed documents")
	fmt.Println("  show <filename> - Show the content of a document")
	fmt.Println("\nDoc RAG Bot ready! Type your questions or commands:")
	for {
		fmt.Print("\n> ")
		if !scanner.Scan() {
			break
		}

		query := strings.TrimSpace(scanner.Text())
		if query == "exit" {
			break
		}

		if query == "" {
			continue
		}

		// Handle special commands
		if query == "list" {
			fmt.Println("\nIndexed documents:")
			for docID := range indexer.Documents {
				fmt.Printf("- %s\n", docID)
			}
			continue
		}

		if strings.HasPrefix(query, "show ") {
			docName := strings.TrimPrefix(query, "show ")
			if doc, ok := indexer.Documents[docName]; ok {
				fmt.Printf("\nContent of %s:\n", docName)
				fmt.Println("-----------------------------------")
				fmt.Println(doc.Content)
				fmt.Println("-----------------------------------")
			} else {
				fmt.Printf("Document '%s' not found\n", docName)
			}
			continue
		}

		// Retrieve relevant document chunks
		fmt.Println("Retrieving relevant information...")
		chunks, err := retriever.RetrieveRelevantChunks(query, 7) // Get top 5 relevant chunks
		if err != nil {
			fmt.Printf("Error retrieving information: %v\n", err)
			continue
		}

		// Generate response with RAG
		fmt.Println("Generating response...")
		response, err := ollamaClient.GenerateWithContext(query, chunks)
		if err != nil {
			fmt.Printf("Error generating response: %v\n", err)
			continue
		}

		// Add suggestion about creating domain-specific content
		enhancedResponse := response + "\n\n---\n" +
			"💡 **Tip**: For better results, add domain-specific knowledge by creating a text file:\n" +
			"```bash\n" +
			"cat > docs/domain-guide.txt << 'EOF'\n" +
			"# Comprehensive Guide to [Your Domain]\n\n" +
			"## Key Concepts\n" +
			"[Add detailed explanations of key concepts here]\n\n" +
			"## Common Issues and Solutions\n" +
			"[Document common problems and their solutions]\n\n" +
			"## Troubleshooting Steps\n" +
			"[Include step-by-step troubleshooting procedures]\n" +
			"EOF\n" +
			"```\n" +
			"Then run `make run` to index the new content."

		fmt.Println("\n=== Response ===")
		fmt.Println(enhancedResponse)
		fmt.Println("================")
	}

	fmt.Println("Goodbye!")
}
