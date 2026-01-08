#!/usr/bin/env python3
"""
Add manual knowledge to a bot's vector store without crawling.
Chunks, embeds, and stores text directly.
"""

import os
import sys
import hashlib
import time
import logging
from datetime import datetime
import chromadb
from nltk.tokenize import sent_tokenize

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def chunk_text(text, min_chunk_size=250, max_chunk_size=3250):
    """
    Chunk text using sentence boundaries.
    
    Args:
        text: Input text to chunk
        min_chunk_size: Minimum chunk size in characters
        max_chunk_size: Maximum chunk size in characters
    
    Returns:
        List of text chunks
    """
    sentences = sent_tokenize(text)
    chunks = []
    current_chunk = ""
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
            
        potential_chunk = current_chunk + " " + sentence if current_chunk else sentence
        
        if len(potential_chunk) > max_chunk_size and current_chunk:
            if len(current_chunk.strip()) >= min_chunk_size:
                chunks.append(current_chunk.strip())
            
            words = current_chunk.split()
            overlap_words = min(len(words), 15)
            
            if overlap_words > 0:
                overlap_text = " ".join(words[-overlap_words:])
                current_chunk = overlap_text + " " + sentence
            else:
                current_chunk = sentence
        else:
            current_chunk = potential_chunk
    
    if current_chunk and len(current_chunk.strip()) >= min_chunk_size:
        chunks.append(current_chunk.strip())
    
    # If no chunks, use original text if substantial enough
    if not chunks and len(text.strip()) >= min_chunk_size:
        chunks = [text.strip()]
    
    # Filter quality chunks
    quality_chunks = []
    for chunk in chunks:
        if len(chunk.split()) >= 3:  # Only need 3+ words
            quality_chunks.append(chunk)
    
    return quality_chunks


def add_manual_knowledge(
    content,
    vector_store_path,
    bot_id,
    collection_name="scraped_content",
    embedding_model_name="all-MiniLM-L6-v2"
):
    """
    Add manual knowledge to a bot's vector store.
    
    Args:
        content: Text content to add
        vector_store_path: Path to bot's vector store directory
        bot_id: Bot ID for metadata
        collection_name: ChromaDB collection name
        embedding_model_name: SentenceTransformer model name
    
    Returns:
        Dictionary with success status and details
    """
    try:
        # Import embedding functions
        try:
            import chromadb.utils.embedding_functions as embedding_functions
        except ImportError:
            try:
                from chromadb.utils import embedding_functions
            except ImportError:
                try:
                    from chromadb import utils
                    embedding_functions = utils.embedding_functions
                except ImportError:
                    from chromadb import embedding_functions
        
        # Validate vector store path
        if not vector_store_path or not vector_store_path.strip():
            raise ValueError("vector_store_path is required")
        
        vector_path = os.path.abspath(vector_store_path)
        
        # Ensure directory exists
        os.makedirs(vector_path, exist_ok=True)
        logger.info(f"✅ Vector store directory: {vector_path}")
        
        # Validate content
        if not content or not content.strip():
            raise ValueError("Content cannot be empty")
        
        cleaned_content = content.strip()
        
        # Chunk the content
        logger.info(f"📝 Chunking content ({len(cleaned_content)} characters)...")
        chunks = chunk_text(cleaned_content)
        
        if not chunks:
            raise ValueError("No valid chunks created from content")
        
        logger.info(f"✅ Created {len(chunks)} chunks")
        
        # Initialize ChromaDB client
        logger.info(f"🔄 Initializing ChromaDB client...")
        client = chromadb.PersistentClient(path=vector_path)
        
        # Load embedding model
        logger.info(f"🔄 Loading embedding model: {embedding_model_name}...")
        embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=embedding_model_name
        )
        
        # Get or create collection
        logger.info(f"🔄 Getting collection: {collection_name}...")
        collection = client.get_or_create_collection(
            name=collection_name,
            embedding_function=embedding_function
        )
        
        # Log existing document count
        existing_count = collection.count()
        logger.info(f"📊 Existing documents in collection: {existing_count}")
        
        # Prepare documents for storage
        timestamp = datetime.utcnow().isoformat()
        ts_ms = str(int(time.time() * 1000000))
        
        ids = []
        documents = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            # Generate unique ID
            content_hash = hashlib.md5(chunk.encode()).hexdigest()
            doc_id = hashlib.md5(f"manual_{bot_id}_{content_hash}_{ts_ms}_{i}".encode()).hexdigest()
            
            # Prepare metadata
            metadata = {
                'source': 'manual',
                'bot_id': str(bot_id),
                'created_at': timestamp,
                'chunk_index': i,
                'chunk_length': len(chunk),
                'chunk_word_count': len(chunk.split()),
                'unique_id': doc_id,
                'extraction_timestamp': ts_ms
            }
            
            ids.append(doc_id)
            documents.append(chunk)
            metadatas.append(metadata)
        
        # Store in ChromaDB
        logger.info(f"💾 Storing {len(chunks)} chunks in vector database...")
        collection.add(
            documents=documents,
            ids=ids,
            metadatas=metadatas
        )
        
        # Verify storage
        new_count = collection.count()
        logger.info(f"✅ Storage complete. Documents: {existing_count} → {new_count}")
        
        return {
            'success': True,
            'chunks_stored': len(chunks),
            'total_documents': new_count,
            'message': f'Successfully added {len(chunks)} chunks to bot knowledge base'
        }
        
    except Exception as e:
        logger.error(f"❌ Error adding manual knowledge: {e}")
        return {
            'success': False,
            'error': str(e)
        }


def main():
    """CLI entry point for manual knowledge addition"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Add manual knowledge to bot vector store')
    parser.add_argument('--content', required=True, help='Text content to add')
    parser.add_argument('--vector-store-path', required=True, help='Path to vector store directory')
    parser.add_argument('--bot-id', required=True, help='Bot ID')
    parser.add_argument('--collection-name', default='scraped_content', help='Collection name')
    parser.add_argument('--embedding-model', default='all-MiniLM-L6-v2', help='Embedding model name')
    
    args = parser.parse_args()
    
    result = add_manual_knowledge(
        content=args.content,
        vector_store_path=args.vector_store_path,
        bot_id=args.bot_id,
        collection_name=args.collection_name,
        embedding_model_name=args.embedding_model
    )
    
    if result['success']:
        logger.info(f"✅ {result['message']}")
        sys.exit(0)
    else:
        logger.error(f"❌ {result['error']}")
        sys.exit(1)


if __name__ == '__main__':
    main()
