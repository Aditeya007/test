# Multi-Tenant RAG Chatbot System

This is a chatbot platform that lets multiple users create AI assistants trained on their own websites. Each user gets isolated resources and can scrape their site to build a knowledge base that powers their chatbot.

## What It Does

The system has three main parts working together:

**Admin Panel**
- User registration and authentication with JWT tokens
- Each user gets their own dedicated database, vector store, and bot endpoint
- Dashboard to manage scrapers and chatbot settings
- Built-in chat widget that can be embedded on any website
- User management for administrators

**Web Scraper**
- Crawls websites and extracts text content from pages
- Handles both static sites and JavaScript-heavy single-page apps using Playwright
- Cleans up tracking parameters and filters out duplicate content
- Stores raw scraped data in MongoDB with metadata like titles, descriptions, and timestamps
- Can run on schedules or be triggered manually

**RAG Chatbot**
- Uses Retrieval-Augmented Generation to answer questions based on scraped content
- Stores document embeddings in ChromaDB vector database
- Semantic search finds relevant content chunks for each query
- generates natural responses using the retrieved context
- Cross-encoder reranking improves answer quality
- Tracks conversation history and stores lead information when users provide contact details

## How Data Flows

When a new user registers, the system provisions isolated resources for them. They can then start a scrape job which crawls their website and stores the content. The updater service processes this scraped content into embeddings stored in ChromaDB. When someone asks the chatbot a question, it searches the vector store for relevant passages and uses them to generate an answer.

## Multi-Tenancy

Every user operates in complete isolation. Their database, vector store path, scraper endpoint, and bot endpoint are all unique to them. The system uses resource IDs to route requests and ensure no user can access another user's data or chatbot. Administrators can view tenant metadata but regular users only see their own resources.

## Key Features

- Automatic website content extraction from sitemaps and page crawling
- Intelligent content chunking and duplicate detection
- Semantic search over scraped content using embeddings
- Context-aware responses with source attribution
- Lead capture when users provide email or phone numbers
- Scheduled updates to keep chatbot knowledge current
- JWT authentication with role-based access control
- CORS protection and rate limiting
- Embeddable chat widget with customization options

## Project Structure

- `admin-backend/` - Express API server handling auth, user management, and scraping jobs
- `admin-frontend/` - React dashboard for managing bots and viewing analytics
- `BOT/` - FastAPI service running the RAG pipeline and chatbot responses
- `Scraping2/` - Scrapy spider for extracting website content
- `UPDATER/` - Background service that detects changed pages and updates embeddings
- `deployment/` - Production deployment scripts and configuration files

## Scheduler Feature

The scheduler allows automatic periodic updates to keep your chatbot's knowledge base current.

**Functions:**
- `startScheduler` - Spawns a detached Python process that runs the updater on a 2-hour interval
- `stopScheduler` - Terminates the running scheduler process for a tenant
- `getSchedulerStatus` - Returns current scheduler state (active/stopped) and configuration

**How it works:**
1. User enables "automatic updates" checkbox in the scrape modal
2. System starts a background scheduler that runs every 2 hours
3. Scheduler crawls the configured website and updates the vector store with new/changed content
4. Process runs independently until manually stopped or server restart

