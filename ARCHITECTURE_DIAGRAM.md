# Vector Reload Architecture - Visual Guide

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          MULTI-TENANT RAG CHATBOT                                │
│                         WITH AUTO VECTOR RELOAD                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: DATA UPDATE                                                              │
└───────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │  Admin User     │
    │  (Web UI)       │
    └────────┬────────┘
             │
             │ (1) POST /api/scrape/start or /api/scrape/update
             │     Body: { startUrl, resourceId, ... }
             │
             ▼
    ┌──────────────────────────────────────────────┐
    │  Admin Backend (Express/Node.js)             │
    │  scrapeController.js                         │
    │  - Validates request                         │
    │  - Gets tenant context                       │
    │  - Builds job options                        │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (2) runTenantScrape() or runTenantUpdater()
                         │     Spawns Python process
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  Python Scraper/Updater                      │
    │  run_tenant_spider.py / run_tenant_updater.py│
    │  - Crawls website                            │
    │  - Extracts content                          │
    │  - Generates embeddings                      │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (3) Writes new vectors to disk
                         │     location: tenant-vector-stores/{resource_id}/
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  ChromaDB on Disk                            │
    │  chroma.sqlite3                              │
    │  - Stores document embeddings                │
    │  - Persists metadata                         │
    │  - ✅ NEW DATA NOW ON DISK                   │
    └──────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: AUTO RELOAD (THE NEW SOLUTION!)                                         │
└───────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────┐
    │  Python Process Returns                      │
    │  Status: completed                           │
    │  Stats: { pages_crawled, docs_added, ... }   │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (4) Scrape job completes
                         │     Control returns to Node.js
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  Admin Backend (Express)                     │
    │  scrapeController.js                         │
    │  const result = await runTenantScrape(...)   │
    │                                              │
    │  ➜ AUTOMATIC CALL:                          │
    │    await refreshBotCache(tenantContext)     │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (5) POST /reload_vectors
                         │     params: { resource_id, vector_store_path, ... }
                         │     headers: { X-Service-Secret: ... }
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  FastAPI Bot (Python)                        │
    │  app_20.py                                   │
    │  @app.post("/reload_vectors")                │
    │  async def reload_vectors(...)               │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (6) Calls reload_vector_store()
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  SemanticIntelligentRAG Class                │
    │  reload_vector_store() method                │
    │                                              │
    │  Step 1: Close old ChromaDB client           │
    │  Step 2: Clear references                    │
    │  Step 3: Wait for cleanup (0.2s)             │
    │  Step 4: Create FRESH client                 │
    │  Step 5: Load collection from disk           │
    │  Step 6: Return new doc count                │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (7) Fresh ChromaDB client created
                         │     Collection reloaded from disk
                         │     ✅ NEW DATA NOW IN MEMORY!
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  ChromaDB In-Memory Cache                    │
    │  - Old vectors (still there)                 │
    │  - ✅ New vectors (just loaded!)             │
    │  - READY TO ANSWER WITH ALL DATA             │
    └──────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: BOT ANSWERS WITH FRESH DATA                                             │
└───────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │  End User       │
    │  (Chat Widget)  │
    └────────┬────────┘
             │
             │ (8) POST /chat
             │     Body: { query: "What's new?", resource_id, ... }
             │
             ▼
    ┌──────────────────────────────────────────────┐
    │  FastAPI Bot                                 │
    │  @app.post("/chat")                          │
    │  async def chat_endpoint(...)                │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (9) Gets tenant chatbot instance
                         │     (Already has fresh vectors loaded!)
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  Bot Processing                              │
    │  1. Generate query embedding                 │
    │  2. Search ChromaDB (has new vectors!)       │
    │  3. Retrieve relevant docs (old + new)       │
    │  4. Rerank with cross-encoder                │
    │  5. Generate answer with Gemini              │
    └────────────────────┬─────────────────────────┘
                         │
                         │ (10) Returns answer based on:
                         │      ✅ Old data (pre-update)
                         │      ✅ New data (just scraped)
                         │      🎉 NO RESTART NEEDED!
                         │
                         ▼
    ┌──────────────────────────────────────────────┐
    │  User sees comprehensive answer              │
    │  Including latest information                │
    └──────────────────────────────────────────────┘
```

## Key Components

### 1. ChromaDB Persistence Layer
```
tenant-vector-stores/
├── tenant-123/
│   ├── chroma.sqlite3          ← Persistent storage
│   └── {uuid}/                 ← Document chunks
└── tenant-456/
    ├── chroma.sqlite3
    └── {uuid}/
```

### 2. Bot Memory Layer
```python
# TenantChatbotManager
_instances: Dict[str, SemanticIntelligentRAG]
    └── "path::uri" → Bot Instance
                          └── chroma_client (in-memory)
                                 └── collection (cached vectors)
```

### 3. Communication Flow
```
Admin Backend ←→ FastAPI Bot
  (Node.js)         (Python)
      │                 │
      │  HTTP POST       │
      │  /reload_vectors │
      ├────────────────→ │
      │                 │
      │  Response JSON  │
      │  { doc_count }  │
      │ ←────────────────┤
      │                 │
```

## Problem vs Solution

### ❌ BEFORE: Old Behavior
```
1. Scrape adds data to disk ✅
2. Bot still uses old in-memory cache ❌
3. User gets outdated answers ❌
4. Manual restart required to fix ❌
```

### ✅ AFTER: New Behavior
```
1. Scrape adds data to disk ✅
2. Auto-reload refreshes cache ✅
3. User gets latest answers ✅
4. No restart needed! ✅
```

## Timeline of Events

```
T=0s    │ User starts scrape
        │
T=30s   │ Scraper crawls website
        │ ↓ Downloads pages
        │ ↓ Extracts content
        │ ↓ Generates embeddings
        │
T=60s   │ ✅ Scrape completes
        │ New data written to ChromaDB disk
        │
T=60.1s │ 🔄 Auto-reload triggered
        │ POST /reload_vectors called
        │
T=60.5s │ Bot closes old ChromaDB client
        │ Creates fresh client
        │
T=61s   │ ✅ Fresh vectors loaded from disk
        │ Bot now has old + new data
        │
T=62s   │ User asks question
        │ Bot answers with latest info
        │ 🎉 Success! No restart needed!
```

## Multi-Tenant Isolation

```
┌─────────────────────────────────────────────────────────┐
│  TenantChatbotManager                                   │
│                                                         │
│  _instances:                                            │
│    "store1::db1" → Bot Instance A (tenant-123)          │
│    "store2::db1" → Bot Instance B (tenant-456)          │
│    "store3::db2" → Bot Instance C (tenant-789)          │
│                                                         │
│  Reloading one tenant does NOT affect others!           │
└─────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
                    ┌─────────────────┐
                    │ Scrape Completes│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Try: Reload     │
                    │ POST /reload_   │
                    │ vectors         │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
            Success │                 │ Failure
                    │                 │
                    ▼                 ▼
        ┌───────────────────┐  ┌─────────────────┐
        │ Return doc count  │  │ Log error       │
        │ Confirm reload    │  │ Don't fail scrape│
        │ ✅ Done!          │  │ (Data still saved│
        └───────────────────┘  │ on disk)        │
                               │ User can manually│
                               │ reload later    │
                               └─────────────────┘
```

## Configuration Points

### Environment Variables
```bash
# Bot Service
FASTAPI_SHARED_SECRET=secret123          # Auth between services
MONGODB_URI=mongodb://localhost:27017    # Database connection
DEFAULT_VECTOR_BASE_PATH=./vectors       # Default vector location

# Admin Backend  
FASTAPI_BOT_URL=http://localhost:8000    # Bot endpoint
FASTAPI_SHARED_SECRET=secret123          # Same secret!
BOT_RELOAD_TIMEOUT=15000                 # Reload timeout (ms)
```

### Timeout Considerations
```
Small DB (< 500 docs):   5s timeout OK
Medium DB (500-2k docs): 10s timeout recommended
Large DB (> 2k docs):    15-20s timeout recommended
```

## API Endpoints Summary

```
┌────────────────────────────────────────────────────────────────┐
│ Endpoint           │ Purpose                │ When to Use      │
├────────────────────────────────────────────────────────────────┤
│ /reload_vectors    │ Immediate reload       │ ✅ RECOMMENDED   │
│ (NEW!)             │ from disk              │ After scrape     │
├────────────────────────────────────────────────────────────────┤
│ /mark-data-updated │ Set dirty flag         │ Lazy loading OK  │
│                    │ Reload on next chat    │                  │
├────────────────────────────────────────────────────────────────┤
│ /refresh-cache     │ Destroy & recreate     │ Hard reset needed│
│                    │ bot instance           │                  │
└────────────────────────────────────────────────────────────────┘
```

## Success Metrics

✅ **Reload Success Indicators:**
- HTTP 200 response
- `"status": "success"` in JSON
- `document_count` > previous count
- `reloaded_at` timestamp present
- Logs show "NUCLEAR RELOAD COMPLETE"

✅ **Bot Using New Data Indicators:**
- Answers reference new information
- Source URLs include new pages
- Conversation context includes latest facts
- No "I don't have information about..." for new topics

---

This visual guide shows the complete end-to-end flow of the auto-reload solution!
