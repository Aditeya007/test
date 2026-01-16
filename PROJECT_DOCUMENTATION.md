# 📚 Excellis Chatbot - Complete Project Documentation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Core Components](#core-components)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Deployment Guide](#deployment-guide)
9. [Environment Variables](#environment-variables)
10. [Multi-Tenancy Architecture](#multi-tenancy-architecture)

---

## 🎯 Project Overview

**Excellis Chatbot** is a comprehensive multi-tenant RAG (Retrieval-Augmented Generation) chatbot system that enables users to create AI assistants trained on their own website content. The platform provides complete isolation between tenants, automatic content extraction, and intelligent question-answering capabilities.

### Key Features
- ✅ Multi-tenant architecture with complete data isolation
- ✅ Automatic website content extraction and processing
- ✅ RAG-based chatbot with semantic search
- ✅ JWT authentication with role-based access control
- ✅ Embeddable chat widget for websites
- ✅ Automatic content updates via scheduler
- ✅ Lead capture functionality
- ✅ Admin and agent dashboards
- ✅ Real-time chat via Socket.IO
- ✅ Cross-encoder reranking for accurate responses

---

## 🏗️ System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Admin Frontend │────▶│  Admin Backend   │────▶│   MongoDB       │
│  (React SPA)    │     │  (Express API)   │     │   (Main DB)     │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              │
                        ┌─────▼─────────┐
                        │               │
                        │  Bot Service  │
                        │  (FastAPI)    │
                        │               │
                        └───────┬───────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
            ┌───────▼─────┐ ┌──▼────────┐ ┌▼──────────┐
            │  ChromaDB   │ │  Scraper  │ │  Updater  │
            │  (Vectors)  │ │ (Scrapy)  │ │ (Scheduler)│
            └─────────────┘ └───────────┘ └───────────┘
```

### Data Flow
1. **User Registration** → Admin creates resources (DB, vector store, API tokens)
2. **Website Scraping** → Scraper extracts content → Stored in MongoDB
3. **Content Processing** → Updater converts content → Embeddings in ChromaDB
4. **Chat Query** → Bot retrieves relevant chunks → Generates response using Gemini API
5. **Lead Capture** → User provides contact info → Stored in tenant database

---

## 💻 Technology Stack

### Backend
- **Node.js** (v16+) - Admin backend runtime
- **Express.js** - Web framework for REST API
- **Python** (v3.9+) - Bot service and scrapers
- **FastAPI** - High-performance async API for chatbot

### Frontend
- **React** (v18) - UI library
- **Redux** - State management
- **React Router** - Client-side routing
- **Socket.IO Client** - Real-time communication

### Databases & Storage
- **MongoDB** - Primary database (user data, bots, conversations)
- **ChromaDB** - Vector database for embeddings
- **File System** - Vector store persistence

### AI & ML
- **Google Gemini API** - Text generation
- **Sentence Transformers** - Text embeddings (all-MiniLM-L6-v2)
- **Cross-Encoder** - Reranking search results
- **SpellChecker** - Query normalization

### Web Scraping
- **Scrapy** - Web scraping framework
- **Playwright** - Headless browser for JavaScript-heavy sites
- **BeautifulSoup4** - HTML parsing

### Security & Authentication
- **JWT** - Token-based authentication
- **bcryptjs** - Password hashing
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing

### DevOps & Deployment
- **PM2** - Process manager
- **Nginx** - Reverse proxy and web server
- **Certbot** - SSL certificates
- **systemd** - Service management

---

## 📁 Directory Structure

### Root Level Files

| File | Description |
|------|-------------|
| `README.md` | Project overview and main documentation |
| `requirements.txt` | Python dependencies for bot and scraper |
| `run_bot_with_autorestart.py` | Auto-restart wrapper for bot service |
| `scrapy.cfg` | Scrapy project configuration |
| `SIMPLE_DEPLOYMENT_GUIDE.md` | Step-by-step deployment instructions |
| `test2.html`, `test3.html`, `test4.html` | HTML test files for widget testing |

---

## 📂 Core Components

### 1️⃣ Admin Backend (`admin-backend/`)

**Purpose**: REST API server handling authentication, user management, bot configuration, and scraping job orchestration.

#### Main Files

| File | Description | Key Functions |
|------|-------------|---------------|
| `server.js` | Application entry point | - Express app initialization<br>- Socket.IO setup<br>- Route registration<br>- Environment validation<br>- CORS configuration |
| `package.json` | Node.js dependencies | Dependencies: express, mongoose, jwt, bcrypt, socket.io, axios, cors, helmet |

#### Configuration (`config/`)

| File | Description |
|------|-------------|
| `default.json` | Default configuration values for ports, timeouts, rate limits |

#### Controllers (`controllers/`)

| File | Description | Key Functions |
|------|-------------|---------------|
| `authController.js` | User authentication | - `registerUser()`: Create new users with resource provisioning<br>- `loginUser()`: JWT token generation<br>- `requestPasswordReset()`: Send reset email<br>- `resetPassword()`: Update password with token |
| `userController.js` | User management | - `getUserProfile()`: Get user details<br>- `updateUserProfile()`: Update user info<br>- `deleteUser()`: Remove user and cleanup resources |
| `botController.js` | Bot management | - `createBot()`: Create new bot instance<br>- `getBots()`: List user's bots<br>- `updateBot()`: Modify bot settings<br>- `deleteBot()`: Remove bot and vector store |
| `scrapeController.js` | Scraping operations | - `startScrape()`: Initiate website scrape job<br>- `getScrapeHistory()`: View scrape logs<br>- `startScheduler()`: Enable auto-updates<br>- `stopScheduler()`: Disable auto-updates<br>- `getSchedulerStatus()`: Check scheduler state |
| `chatController.js` | Conversation management | - `getConversations()`: List chat sessions<br>- `getMessages()`: Retrieve conversation history<br>- `exportConversation()`: Export chat data |
| `agentController.js` | Agent management | - `createAgent()`: Create customer support agents<br>- `getAgents()`: List agents<br>- `updateAgent()`: Modify agent details<br>- `deleteAgent()`: Remove agent |

#### Models (`models/`)

| File | Description | Schema Fields |
|------|-------------|---------------|
| `User.js` | User accounts | - `name`, `email`, `username`, `password` (hashed)<br>- `role`: 'admin' or 'user'<br>- `resourceId`: Tenant identifier<br>- `databaseUri`: Tenant MongoDB connection<br>- `vectorStorePath`: Tenant ChromaDB path<br>- `resetPasswordToken`, `resetPasswordExpire` |
| `Bot.js` | Chatbot instances | - `userId`: Owner reference<br>- `name`: Bot display name<br>- `vectorStorePath`: Vector DB location<br>- `apiToken`: Authentication token<br>- `scrapedWebsites[]`: Scraped URLs<br>- `schedulerPid`, `schedulerStatus`: Scheduler state<br>- `isReady`: Bot readiness flag<br>- `lastScrapedAt`: Last scrape timestamp |
| `Agent.js` | Support agents | - `name`, `email`, `password`<br>- `adminId`: Parent admin reference<br>- `isActive`: Account status<br>- `assignedConversations[]`: Chat assignments |
| `Conversation.js` | Chat sessions | - `userId`: Bot owner<br>- `sessionId`: Unique session ID<br>- `messages[]`: Chat history<br>- `leadInfo`: Captured contact details<br>- `startedAt`, `lastMessageAt`: Timestamps |
| `Message.js` | Chat messages | - `conversationId`: Parent conversation<br>- `sender`: 'user' or 'bot'<br>- `content`: Message text<br>- `timestamp`: Message time |
| `ScrapeHistory.js` | Scrape logs | - `userId`: Initiator<br>- `website`: Scraped URL<br>- `status`: 'pending', 'completed', 'failed'<br>- `pagesScraped`: Count of pages<br>- `errors[]`: Error logs<br>- `completedAt`: Finish timestamp |

#### Middleware (`middleware/`)

| File | Description | Purpose |
|------|-------------|---------|
| `auth.js` | JWT verification | - Extracts token from Authorization header<br>- Verifies JWT signature<br>- Attaches user info to `req.user` |
| `authenticateBotToken.js` | Bot token auth | - Validates bot API tokens<br>- Checks bot readiness status<br>- Loads tenant context |
| `authenticateAgent.js` | Agent authentication | - Verifies agent JWT tokens<br>- Checks agent active status |
| `requireAdmin.js` | Admin authorization | - Ensures user has admin role<br>- Blocks regular users from admin routes |
| `resolveTenant.js` | Tenant resolution | - Extracts resourceId from request<br>- Loads tenant configuration<br>- Ensures data isolation |
| `widgetAuth.js` | Widget authentication | - Validates widget embed origins<br>- CORS enforcement for widgets |
| `rateLimiter.js` | Rate limiting | - Prevents API abuse<br>- Configurable limits per endpoint |
| `validate.js` | Input validation | - Sanitizes request data<br>- Validates required fields |

#### Routes (`routes/`)

| File | Endpoints | Description |
|------|-----------|-------------|
| `auth.js` | `/api/auth/*` | - `POST /register`: User registration<br>- `POST /login`: User login<br>- `POST /request-reset`: Password reset request<br>- `POST /reset-password`: Reset password with token |
| `user.js` | `/api/user/*` | - `GET /profile`: Get user profile<br>- `PUT /profile`: Update profile<br>- `DELETE /account`: Delete account |
| `users.js` | `/api/users/*` | - `GET /`: List all users (admin)<br>- `POST /`: Create sub-user (admin)<br>- `PUT /:id`: Update user (admin)<br>- `DELETE /:id`: Delete user (admin) |
| `bot.js` | `/api/bot/*` | - `POST /create`: Create new bot<br>- `GET /`: List user's bots<br>- `PUT /:id`: Update bot<br>- `DELETE /:id`: Delete bot<br>- `GET /:id/status`: Check bot readiness |
| `scrape.js` | `/api/scrape/*` | - `POST /start`: Start scrape job<br>- `GET /history`: Get scrape logs<br>- `POST /scheduler/start`: Enable scheduler<br>- `POST /scheduler/stop`: Disable scheduler<br>- `GET /scheduler/status`: Check scheduler |
| `chat.js` | `/api/chat/*` | - `GET /conversations`: List conversations<br>- `GET /conversations/:id/messages`: Get messages<br>- `POST /conversations/:id/export`: Export chat |
| `agent.js` | `/api/agents/*` | - `POST /`: Create agent<br>- `GET /`: List agents<br>- `PUT /:id`: Update agent<br>- `DELETE /:id`: Delete agent<br>- `POST /login`: Agent login |

#### Services (`services/`)

| File | Description | Key Functions |
|------|-------------|---------------|
| `provisioningService.js` | Resource provisioning | - `provisionResourcesForUser()`: Create tenant resources<br>- `cleanupUserResources()`: Delete tenant data<br>- `ensureUserResources()`: Verify resources exist |
| `emailService.js` | Email notifications | - `sendPasswordResetEmail()`: Send reset link<br>- `sendWelcomeEmail()`: New user welcome |
| `userContextService.js` | Tenant context | - `getTenantContext()`: Load tenant config<br>- `validateResourceId()`: Verify tenant ID |

#### Jobs (`jobs/`)

| File | Description | Purpose |
|------|-------------|---------|
| `pythonJob.js` | Python process manager | - Spawns Python scripts<br>- Manages subprocesses<br>- Error handling |
| `scrapeJob.js` | Scraping job orchestration | - Initiates Scrapy crawlers<br>- Monitors scrape progress<br>- Updates scrape history |
| `botJob.js` | Bot service management | - Starts/stops bot instances<br>- Health checks |

#### Scripts (`scripts/`)

| File | Description | Purpose |
|------|-------------|---------|
| `backfillResourceIds.js` | Data migration | - Adds resourceId to existing users<br>- One-time migration script |
| `dropOldUniqueIndexes.js` | Index cleanup | - Removes deprecated MongoDB indexes |
| `migrateUsernameEmailIndexes.js` | Index migration | - Updates unique constraints for multi-tenancy |
| `migrateUsersAdminId.js` | Admin migration | - Adds adminId to existing users |
| `resolveDuplicateUsernames.js` | Data cleanup | - Handles duplicate username conflicts |

#### Utilities (`utils/`)

| File | Description | Key Functions |
|------|-------------|---------------|
| `db.js` | Database connection | - `connectDB()`: MongoDB connection with retry logic<br>- Connection pooling<br>- Error handling |

---

### 2️⃣ Admin Frontend (`admin-frontend/`)

**Purpose**: React-based Single Page Application (SPA) providing user interface for bot management, chat monitoring, and administration.

#### Main Files

| File | Description | Key Components |
|------|-------------|----------------|
| `package.json` | Dependencies | React, Redux, React Router, Socket.IO Client, Axios |
| `src/index.js` | Application entry point | - React DOM rendering<br>- Redux store provider<br>- Global styles |
| `src/App.js` | Root component | - Route configuration<br>- Context providers<br>- Layout wrapper |
| `src/config.js` | Frontend configuration | - API base URL<br>- WebSocket URL<br>- Environment settings |

#### Public Assets (`public/`)

| File | Description |
|------|-------------|
| `index.html` | HTML template for React app |
| `ragChatWidget.js` | Embeddable chat widget script for external websites |

#### API Integration (`src/api/`)

| File | Description | Functions |
|------|-------------|-----------|
| `index.js` | API client | - Axios instance with interceptors<br>- JWT token management<br>- Error handling<br>- Request/response transformers |

#### Components (`src/components/`)

##### Core Components

| File | Description | Props/Features |
|------|-------------|----------------|
| `ProtectedRoute.js` | Route guard | - Redirects unauthenticated users to login<br>- Validates user session |
| `AdminRoute.js` | Admin-only routes | - Restricts access to admin users<br>- Shows 403 error for non-admins |
| `AgentRoute.js` | Agent-only routes | - Agent dashboard access control |
| `ErrorBoundary.js` | Error handling | - Catches React errors<br>- Displays fallback UI |
| `Loader.js` | Loading spinner | - Shows during async operations |
| `Pagination.js` | Page navigation | - Table pagination controls<br>- Page size selector |
| `SuspenseBoundary.js` | Lazy loading | - Code splitting support<br>- Loading fallback |

##### Forms (`src/components/forms/`)

| File | Description | Purpose |
|------|-------------|---------|
| `BotForm.js` | Bot creation/edit form | Input fields for bot name, settings |
| `ScrapeForm.js` | Scrape configuration | Website URL, depth, scheduler options |
| `UserForm.js` | User management form | Name, email, username, password fields |
| `AgentForm.js` | Agent creation form | Agent details and permissions |

##### Layout (`src/components/layout/`)

| File | Description | Purpose |
|------|-------------|---------|
| `AdminLayout.js` | Main layout wrapper | - Navigation header<br>- Sidebar menu<br>- Content area<br>- Footer |
| `Sidebar.js` | Navigation menu | - Dashboard link<br>- Bots link<br>- Users link (admin)<br>- Agents link<br>- Logout button |
| `Header.js` | Top navigation bar | - Logo<br>- User profile dropdown<br>- Notifications |

##### Chat Widget (`src/components/ChatWidget/`)

| File | Description | Purpose |
|------|-------------|---------|
| `ChatWidgetWrapper.js` | Widget container | - Manages widget state<br>- Socket.IO connection |
| `ChatWindow.js` | Chat interface | - Message display<br>- Input field<br>- Send button |
| `MessageBubble.js` | Message component | - User/bot message styling<br>- Timestamp display |

##### User Management (`src/components/users/`)

| File | Description | Purpose |
|------|-------------|---------|
| `UserList.js` | User table | - Displays all users<br>- Edit/delete actions |
| `UserCard.js` | User details card | - Profile information<br>- Resource usage stats |

##### Specialized Components

| File | Description | Purpose |
|------|-------------|---------|
| `BotCard.js` | Bot display card | - Bot name and status<br>- API token display<br>- Edit/delete buttons |
| `WidgetInstaller.js` | Widget embed code | - Generates embed script<br>- Copy to clipboard<br>- Installation instructions |

#### Context (`src/context/`)

| File | Description | Provides |
|------|-------------|----------|
| `AuthContext.js` | Authentication state | - `user`: Current user object<br>- `login()`: Login function<br>- `logout()`: Logout function<br>- `isAuthenticated`: Boolean flag |
| `ChatWidgetContext.js` | Widget state | - `isOpen`: Widget visibility<br>- `messages[]`: Chat history<br>- `sendMessage()`: Send chat message |

#### Hooks (`src/hooks/`)

| File | Description | Returns |
|------|-------------|---------|
| `useApi.js` | API call hook | - `data`: Response data<br>- `loading`: Loading state<br>- `error`: Error object<br>- `refetch()`: Retry function |
| `useAsync.js` | Async operation hook | - `execute()`: Run async function<br>- `status`: 'idle', 'pending', 'success', 'error'<br>- `value`: Result value |

#### Pages (`src/pages/`)

| File | Description | Features |
|------|-------------|----------|
| `LoginPage.js` | User login | - Username/password form<br>- Remember me checkbox<br>- Forgot password link |
| `RegisterPage.js` | User registration | - Name, email, username, password<br>- Terms acceptance<br>- Email verification |
| `AgentLoginPage.js` | Agent login | - Agent credentials<br>- Separate from user login |
| `ResetPasswordPage.js` | Password reset | - Email input<br>- Reset link sending<br>- Token validation |
| `DashboardPage.js` | Main dashboard | - Statistics cards<br>- Recent activity<br>- Quick actions |
| `BotPage.js` | Bot management | - Bot list<br>- Create bot button<br>- Bot configuration |
| `AdminUsersPage.js` | User management (admin) | - User table<br>- Add/edit/delete users<br>- Role assignment |
| `UserProfilePage.js` | User profile | - Profile editing<br>- Password change<br>- Account settings |
| `AgentPanel.js` | Agent dashboard | - Assigned conversations<br>- Chat interface<br>- Status updates |
| `AgentsPage.js` | Agent management | - Agent list<br>- Create agent<br>- Permissions |
| `AgentChatsPage.js` | Agent conversations | - Conversation list<br>- Message history<br>- Lead information |
| `CreateAgentPage.js` | Create agent form | - Agent details<br>- Permission settings |
| `WebsitesPage.js` | Scraped websites | - Website list<br>- Scrape history<br>- Re-scrape button |
| `HealthPage.js` | System health | - Service status<br>- Database connectivity<br>- API health |
| `CreateEditUserPage.js` | User form page | - Create/edit user<br>- Resource allocation |
| `SiteSettingsPage.js` | Site configuration | - Global settings<br>- Feature toggles |

#### Store (Redux) (`src/store/`)

| File | Description | State |
|------|-------------|-------|
| `index.js` | Redux store | - Store configuration<br>- Root reducer<br>- Middleware setup |
| `authSlice.js` | Auth state | - `user`, `token`, `isAuthenticated` |
| `botsSlice.js` | Bots state | - `bots[]`, `selectedBot`, `loading` |
| `chatsSlice.js` | Conversations state | - `conversations[]`, `activeChat`, `messages[]` |
| `usersSlice.js` | Users state (admin) | - `users[]`, `totalUsers`, `filters` |

#### Styles (`src/styles/`)

| File | Description |
|------|-------------|
| `index.css` | Global styles, CSS variables, utility classes |
| `theme.css` | Color scheme, typography, spacing |

#### Utilities (`src/utils/`)

| File | Description | Functions |
|------|-------------|-----------|
| `formatters.js` | Data formatting | - `formatDate()`: Date formatting<br>- `formatTime()`: Time formatting<br>- `formatNumber()`: Number formatting |
| `validators.js` | Input validation | - `validateEmail()`: Email validation<br>- `validatePassword()`: Password strength<br>- `validateURL()`: URL validation |
| `storage.js` | Local storage | - `saveToken()`: Store JWT<br>- `getToken()`: Retrieve JWT<br>- `clearToken()`: Remove JWT |

---

### 3️⃣ Bot Service (`BOT/`)

**Purpose**: FastAPI-based RAG chatbot service that handles query processing, semantic search, and response generation using Google Gemini API.

#### 📁 Main Files

| File | Purpose |
|------|---------|
| `app_20.py` | Main bot service with AI chatbot logic (2,492 lines) |
| `test_spelling.py` | Tests for spell checking and query correction |
| `run_bot_with_autorestart.py` | Wrapper script that automatically restarts the bot if it crashes |

---

## 🤖 Understanding `app_20.py` - The Brain of the Chatbot

This file is like the **brain** of your chatbot. It reads questions from users, searches through stored website content, and generates intelligent answers. Let's break down what each part does:

---

### 🔧 **1. Helper Functions (The Utilities)**

#### `get_tenant_context()` - Who's Asking?
**What it does:** Checks which user/company is using the bot and loads their specific settings.

**Think of it like:** A security guard checking your ID card before letting you into a building. Each user has their own "room" (data) and this function makes sure you only access your own room.

```python
def get_tenant_context(resource_id, database_uri, vector_store_path):
    # resource_id = Your unique ID (like "user_123")
    # database_uri = Where your data is stored (like a file cabinet address)
    # vector_store_path = Where your AI knowledge is stored
```

**Real example:** If two companies (Company A and Company B) use the same chatbot system, this function ensures Company A can't accidentally see Company B's data.

---

### 👤 **2. LeadValidator Class - Checking Contact Information**

This class validates (checks if information is correct) when users provide their name, email, or phone number.

#### `validate_name()` - Is this a real name?
**What it does:** Checks if someone's name looks real and not fake.

**Checks performed:**
- ✅ Not too short (at least 2 letters)
- ✅ Not too long (max 100 characters)
- ✅ Contains actual letters (not just numbers)
- ✅ Only uses valid characters (letters, spaces, hyphens, apostrophes)

**Example:**
```python
validate_name("John Smith")  # ✅ Valid
validate_name("J")          # ❌ Too short
validate_name("12345")      # ❌ No letters
validate_name("John@123")   # ❌ Invalid character @
```

#### `validate_email()` - Is this a real email?
**What it does:** Checks if an email address is properly formatted.

**Checks performed:**
- ✅ Has exactly one @ symbol
- ✅ Has a domain (the part after @)
- ✅ Domain has a period (like .com or .org)
- ✅ No weird characters or spaces

**Example:**
```python
validate_email("user@example.com")  # ✅ Valid
validate_email("user@com")          # ❌ No period in domain
validate_email("user.example.com")  # ❌ Missing @
```

#### `validate_phone()` - Is this a valid phone number?
**What it does:** Checks if a phone number has the right format.

**Accepts formats:**
- ✅ `(123) 456-7890`
- ✅ `123-456-7890`
- ✅ `+1 123 456 7890`
- ✅ `1234567890`

---

### 📧 **3. ContactInformationExtractor Class - Finding Contact Info**

This class is like a **detective** that reads messages and finds email addresses or phone numbers hidden in the text.

#### `extract_emails()` - Find emails in text
**What it does:** Scans text and pulls out any email addresses it finds.

**Example:**
```python
text = "You can reach me at john@example.com for more info"
extract_emails(text)  # Returns: ["john@example.com"]
```

#### `extract_phones()` - Find phone numbers in text
**What it does:** Scans text and finds phone numbers in various formats.

**Example:**
```python
text = "Call me at (555) 123-4567 or text 555-987-6543"
extract_phones(text)  # Returns: ["(555) 123-4567", "555-987-6543"]
```

---

### 🧠 **4. TenantRAGChatbot Class - The Main Chatbot Brain**

This is the **heart of the chatbot**. It's a big class with many functions that work together to answer questions intelligently.

---

#### **Initialization: `__init__()` - Setting Up the Bot**

**What it does:** When you create a new chatbot instance, this function sets up all the necessary tools:

1. **Loads the AI model** (for understanding questions)
2. **Connects to the vector database** (where knowledge is stored)
3. **Connects to MongoDB** (where conversations are saved)
4. **Sets up Google Gemini API** (for generating answers)

**Think of it like:** Opening a restaurant - you need to turn on the lights, stock the kitchen, and get your staff ready before serving customers.

---

#### **Knowledge Management Functions:**

#### `semantic_search()` - Finding Relevant Information
**What it does:** When a user asks a question, this function searches through all the stored website content to find the most relevant information.

**How it works:**
1. Convert the question into numbers (called "embeddings")
2. Compare with all stored website content
3. Find the top 10 most similar pieces of content
4. Return them for answering

**Real-world analogy:** Like using Ctrl+F to search a document, but **way smarter**. Instead of just matching exact words, it understands **meaning**. So "How much does it cost?" and "What's the price?" would both find pricing information.

```python
def semantic_search(self, query, top_k=10):
    # query = User's question like "What are your business hours?"
    # top_k = How many results to return (default 10)
    
    # Step 1: Convert question to numbers
    query_embedding = self.embedder.encode(query)
    
    # Step 2: Search the vector database
    results = self.collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k
    )
    
    # Step 3: Return matching content
    return results
```

---

#### `rerank_results()` - Sorting by Relevance
**What it does:** After finding 10 potential answers, this function re-checks them more carefully and sorts them from most relevant to least relevant.

**Why it's needed:** The first search is fast but rough. This second pass is slower but more accurate.

**Think of it like:** First, you quickly grab 10 books from a library shelf that might have your answer. Then you carefully read the table of contents of each to pick the 3 best ones.

```python
def rerank_results(self, query, documents):
    # query = User's question
    # documents = The 10 pieces of content found earlier
    
    # Use a more powerful AI model to score each document
    scores = cross_encoder.predict([[query, doc] for doc in documents])
    
    # Sort by score (highest first)
    # Return top 3-5 most relevant
```

---

#### `generate_response()` - Creating the Answer
**What it does:** Takes the relevant information found and uses Google Gemini AI to write a natural, helpful answer.

**How it works:**
1. Build a prompt with the user's question and relevant context
2. Send to Google Gemini API
3. Get back a human-like response
4. Return it to the user

**Think of it like:** You're a librarian who just found 3 relevant books. Now you read the important parts and explain the answer to the visitor in your own words, making it easy to understand.

```python
def generate_response(self, query, context):
    # query = "What are your shipping costs?"
    # context = Relevant text from website about shipping
    
    # Build a prompt for the AI
    prompt = f"""
    Based on this information: {context}
    
    Answer this question: {query}
    
    Be helpful and accurate. If you don't know, say so.
    """
    
    # Send to Google Gemini
    response = genai.generate_content(prompt)
    
    # Return the AI's answer
    return response.text
```

---

#### **Lead Capture Functions:**

#### `extract_contact_info()` - Finding Contact Details
**What it does:** Reads the user's message and checks if they provided their name, email, or phone number.

**When it's used:** When someone says things like:
- "My email is john@example.com"
- "You can call me at 555-1234"
- "I'm John Smith"

**What it returns:**
```python
{
    "name": "John Smith",
    "email": "john@example.com", 
    "phone": "555-1234"
}
```

---

#### `store_lead()` - Saving Contact Information
**What it does:** When someone provides their contact info, this function saves it to the database so the business can follow up later.

**Steps:**
1. Check if the information is valid (using LeadValidator)
2. Save to MongoDB database
3. Mark the conversation as having captured a lead

**Think of it like:** When a customer fills out a "Contact Me" form on a website - the information gets saved so a salesperson can call them later.

```python
def store_lead(self, session_id, lead_info):
    # session_id = Unique ID for this conversation
    # lead_info = {name, email, phone}
    
    # Save to database
    self.leads_collection.insert_one({
        "name": lead_info["name"],
        "email": lead_info["email"],
        "phone": lead_info["phone"],
        "captured_at": datetime.now(),
        "session_id": session_id
    })
```

---

#### **Conversation Management:**

#### `reload_vector_store()` - Refreshing Knowledge
**What it does:** Reloads all the stored website content from disk. Used after updating the website content.

**When it's used:** After scraping new pages from the website or when content has been updated.

**Think of it like:** Refreshing your browser to see the latest version of a website.

---

#### **MongoDB Functions:**

#### `init_mongodb_connection()` - Connect to Database
**What it does:** Opens a connection to MongoDB where conversations and leads are stored.

#### `save_lead_to_database()` - Save Lead Data
**What it does:** Saves captured contact information to MongoDB.

#### `get_all_leads()` - Retrieve All Leads
**What it does:** Gets all captured leads from the database (used by admins to see who's interested).

---

### 🌐 **5. FastAPI Endpoints - The Public Interface**

These are the "doors" that other programs use to talk to the chatbot.

#### `POST /chat` - Main Chat Endpoint
**What it does:** This is the main entry point. When a user sends a message, it comes here.

**Flow:**
1. Receive user's question
2. Check authentication (is this a valid bot?)
3. Search for relevant content (`semantic_search`)
4. Re-rank results (`rerank_results`)
5. Generate answer (`generate_response`)
6. Check for contact info (`extract_contact_info`)
7. Save leads if found (`store_lead`)
8. Return answer to user

**Example request:**
```json
{
  "query": "What are your business hours?",
  "sessionId": "abc123",
  "resourceId": "user_456",
  "botToken": "secret_token"
}
```

**Example response:**
```json
{
  "response": "We're open Monday-Friday, 9 AM to 5 PM.",
  "sources": ["https://example.com/about"],
  "leadCaptured": false
}
```

---

#### `GET /health` - Health Check
**What it does:** Returns a simple status to check if the bot service is running.

**Returns:** `{"status": "ok", "uptime": 3600}`

---

#### `POST /reload` - Reload Vector Store
**What it does:** Forces the bot to reload all its knowledge from disk.

**When to use:** After scraping new website content.

---

### 📊 **Complete Flow Example:**

**User asks:** "What are your shipping costs?"

1. **FastAPI receives request** at `/chat` endpoint
2. **Authentication checked** - Is this bot token valid?
3. **`semantic_search()`** - Finds 10 relevant content pieces about shipping
4. **`rerank_results()`** - Picks the top 3 most relevant
5. **`generate_response()`** - Google Gemini writes an answer based on those 3 pieces
6. **`extract_contact_info()`** - Checks if user provided email/phone (they didn't)
7. **Response sent back:** "Shipping is $5 for orders under $50, free over $50!"

---

### 🎯 **Key Takeaways for Beginners:**

- **`app_20.py` is the chatbot's brain** - it processes questions and generates answers
- **LeadValidator** makes sure contact info is real before saving it
- **semantic_search** finds relevant information (like Google search, but for one website)
- **rerank_results** sorts results by relevance (picks the best answers)
- **generate_response** uses AI to write human-like answers
- **FastAPI endpoints** are how other programs talk to the bot

---

### 4️⃣ Web Scraper (`Scraping2/`)

**Purpose**: Scrapy-based web scraper that extracts content from websites, handles JavaScript-heavy sites, and stores data in MongoDB.

#### 📁 Main Files

| File | Purpose |
|------|---------|
| `settings.py` | Configuration for how the scraper behaves |
| `items.py` | Defines what data to extract from each page |
| `pipelines.py` | Processes and saves the scraped data |
| `middlewares.py` | Handles requests and responses |
| `run_tenant_spider.py` | Script to start the scraper for a specific user |
| `spiders/spider.py` | The main scraping logic (1,151 lines) |

---

## 🕷️ Understanding `spider.py` - The Web Crawler

This file is like a **robot that visits websites**, reads all the pages, and extracts useful information. Let's understand each part:

---

### 🎯 **1. FixedUniversalSpider Class - The Main Spider**

Think of this as a **smart robot** that:
- Visits websites
- Reads every page
- Extracts text content
- Saves information to a database

---

### 🔧 **2. Initialization: `__init__()` - Setting Up the Robot**

**What it does:** When you start the scraper, this function sets up all the rules and settings.

**Key parameters:**
```python
def __init__(
    self,
    domain: str,              # Which website to scrape (e.g., "example.com")
    start_url: str,           # Where to start (e.g., "https://example.com")
    max_depth: int = 999,     # How many "clicks" deep to go
    sitemap_url: str = None,  # Optional sitemap.xml location
    max_links_per_page: int = 1000,  # Max links to follow per page
):
```

**Real-world analogy:** Like giving instructions to a library assistant:
- "Start at the front desk"
- "Visit every room"
- "Don't go more than 5 floors deep"
- "Read every book you find"

**What it sets up:**
- ✅ Which website to crawl (allowed_domains)
- ✅ Where to start crawling (start_urls)
- ✅ How deep to go (max_depth)
- ✅ Which file types to skip (PDF, images, videos, etc.)

---

### 📋 **3. File Skipping - What NOT to Scrape**

#### `SKIP_EXTENSIONS` - File Types to Ignore
**What it does:** Lists file types that don't contain useful text content.

**Files skipped:**
- 📄 Documents: `.pdf`, `.doc`, `.docx`, `.xls`
- 📦 Archives: `.zip`, `.rar`, `.tar`
- 🎵 Media: `.mp3`, `.mp4`, `.jpg`, `.png`
- 💻 Code: `.css`, `.js`, `.xml`
- 🔤 Fonts: `.ttf`, `.woff`

**Why skip them?** These files either:
- Don't contain text the chatbot can read
- Are too large to process
- Don't help answer user questions

**Think of it like:** A librarian who only catalogs books with text, not picture books or DVDs.

---

### 🚀 **4. Starting the Scrape: `start_requests()`**

**What it does:** Creates the first requests to begin crawling the website.

**Process:**
1. Try to find sitemap.xml (a list of all pages on the website)
2. If sitemap exists, use it to find all pages quickly
3. If no sitemap, start from the homepage and follow links

**Think of it like:** 
- **With sitemap:** Getting a map of a museum showing all exhibits
- **Without sitemap:** Walking through the museum room by room

```python
def start_requests(self):
    # Try common sitemap locations
    potential_sitemaps = [
        "https://example.com/sitemap.xml",
        "https://example.com/sitemap_index.xml"
    ]
    
    # Start crawling!
```

---

### 🗺️ **5. Sitemap Parsing: `parse_sitemap()`**

**What it does:** Reads sitemap.xml files to get a list of all pages on the website.

**What's a sitemap?** An XML file that lists all pages on a website, like:
```xml
<urlset>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
  <url><loc>https://example.com/products</loc></url>
</urlset>
```

**What the function does:**
1. Download the sitemap.xml file
2. Parse (read) the XML to extract URLs
3. Create a request to visit each URL
4. Skip URLs that point to files we don't want (PDFs, images, etc.)

**Think of it like:** Reading a table of contents in a book to know what chapters exist.

---

### 📄 **6. Page Processing: `parse()` and `parse_any()`**

These are the **core functions** that process each webpage.

#### `parse_any()` - Smart Page Handler
**What it does:** Decides how to process a page based on its type.

**Decision flow:**
```
Is it HTML? → Use parse()
Is it JavaScript-heavy? → Use parse_playwright()
Is it a file (PDF)? → Skip it
```

#### `parse()` - Extract Content from HTML
**What it does:** Extracts text content from regular HTML pages.

**Steps:**
1. **Check page type** - Is it HTML? (Skip if it's a file)
2. **Extract text** - Get all visible text from the page
3. **Extract metadata** - Get title, description, etc.
4. **Clean text** - Remove scripts, styles, and junk
5. **Find links** - Discover new pages to visit
6. **Save data** - Store in MongoDB

**Example of what it extracts:**
```python
{
    "url": "https://example.com/about",
    "title": "About Us - Example Company",
    "content": "We are a company that...",
    "meta_description": "Learn about our mission",
    "word_count": 450,
    "scraped_at": "2026-01-16 10:30:00"
}
```

---

### 🧹 **7. Text Cleaning: `clean_text()` and `_aggressive_text_cleaning()`**

These functions **clean up messy text** extracted from web pages.

#### `_aggressive_text_cleaning()` - Deep Cleaning
**What it does:** Removes junk and keeps only useful sentences.

**Cleaning steps:**
1. **Remove HTML tags** - Get rid of `<div>`, `<p>`, etc.
2. **Remove scripts** - Delete JavaScript code
3. **Remove styles** - Delete CSS styling
4. **Decode HTML entities** - Convert `&amp;` to `&`
5. **Remove navigation** - Delete "Home | About | Contact" menus
6. **Remove duplicates** - If the same sentence appears twice, keep only one
7. **Remove boilerplate** - Delete "Copyright 2026" and similar text
8. **Remove social media** - Delete "Follow us on Twitter" text

**Before cleaning:**
```html
<div class="content">
  <script>alert('hi')</script>
  <h1>Welcome</h1>
  <p>We are a great company.</p>
  <p>We are a great company.</p>  <!-- Duplicate -->
  <footer>Copyright 2026. All rights reserved.</footer>
</div>
```

**After cleaning:**
```
Welcome
We are a great company.
```

**Think of it like:** Washing vegetables - you remove dirt, stems, and bad parts, keeping only the good stuff.

---

### 🔍 **8. Boilerplate Detection: `_is_boilerplate_text()`**

**What it does:** Identifies and removes repetitive or useless text that appears on many pages.

**Examples of boilerplate:**
- ❌ "Home | About | Services | Contact"
- ❌ "Follow us on Facebook Twitter Instagram"
- ❌ "Copyright © 2026 All Rights Reserved"
- ❌ "Click here to learn more"
- ❌ "Subscribe to our newsletter"

**Why remove it?** This text:
- Doesn't help answer user questions
- Appears on every page (repetitive)
- Wastes database storage

**Think of it like:** Skipping the ads and copyright notices when reading an article - you only want the actual content.

---

### 🔗 **9. Link Extraction: `_extract_follow_links()`**

**What it does:** Finds all links on a page and decides which ones to visit next.

**Criteria for following a link:**
- ✅ Same domain (stay on the same website)
- ✅ Not a file (PDF, image, etc.)
- ✅ Not already visited
- ✅ Within depth limit
- ✅ Not blocked by robots.txt

**Think of it like:** Following hallways in a building - you only go through doors that lead to rooms you haven't visited yet.

```python
def _extract_follow_links(self, response):
    # Find all <a href="..."> links on the page
    all_links = response.css('a::attr(href)').getall()
    
    # Filter to only valid, unvisited links
    valid_links = [link for link in all_links if self._should_follow(link)]
    
    return valid_links
```

---

### 🌐 **10. JavaScript Handling: `parse_playwright()`**

**What it does:** Handles websites that use JavaScript to load content (single-page applications).

**Why needed?** Some websites don't show content in the HTML. They use JavaScript to load it after the page opens. Regular scrapers can't see this content.

**How it works:**
1. Open the page in a real browser (Chromium)
2. Wait for JavaScript to run (2 seconds)
3. Let the page finish loading
4. Extract the fully-rendered HTML
5. Process like a regular page

**Think of it like:** 
- **Regular scraping:** Reading a book
- **Playwright scraping:** Watching a pop-up book where pictures unfold as you open pages

**Example websites that need this:**
- React applications
- Single-page apps (SPAs)
- Websites with infinite scrolling
- Dynamic content loaders

---

### 📊 **11. Metadata Extraction: `extract_metadata()`**

**What it does:** Extracts useful information about the page beyond just text.

**Metadata extracted:**
- 📌 Page title
- 📝 Meta description
- 🔑 Keywords
- 👤 Author
- 📅 Publish date
- 🖼️ Featured image

**Example:**
```python
metadata = {
    "title": "10 Tips for Better Sleep",
    "description": "Learn how to improve your sleep quality",
    "author": "Dr. Jane Smith",
    "publish_date": "2026-01-10"
}
```

**Why it matters:** This helps the chatbot:
- Show page titles in responses
- Cite sources accurately
- Understand context better

---

### ✅ **12. Duplicate Prevention**

The spider tracks URLs it has already visited to avoid processing the same page twice.

**Tracking variables:**
```python
self.fully_processed_urls = set()  # Pages completely scraped
self.currently_processing_urls = set()  # Pages being processed now
self.discovered_urls = set()  # All URLs found
```

**Before scraping a URL:**
```python
if url in self.fully_processed_urls:
    print(f"Skipping {url} - already scraped")
    return
```

**Think of it like:** Marking books you've already read so you don't read them again.

---

### 🎯 **Complete Scraping Flow - Step by Step:**

**Example: Scraping "example.com"**

1. **Start:** `start_requests()` called
   - Checks for sitemap.xml
   - Finds: `https://example.com/sitemap.xml`

2. **Parse Sitemap:** `parse_sitemap()` called
   - Extracts 50 URLs from sitemap
   - Queues them for processing

3. **Visit First Page:** `parse_any()` called for `/about`
   - Checks: Is it HTML? ✅
   - Calls: `parse()`

4. **Extract Content:** `parse()` processes the page
   - Extracts text: "About Us - We are a company..."
   - Extracts title: "About Us"
   - Finds 5 links: `/products`, `/contact`, `/blog`, etc.

5. **Clean Text:** `_aggressive_text_cleaning()` called
   - Removes navigation
   - Removes "Copyright" footer
   - Keeps only useful content

6. **Save to MongoDB:** Pipeline stores:
   ```python
   {
       "url": "https://example.com/about",
       "title": "About Us",
       "content": "We are a company that provides...",
       "word_count": 320,
       "scraped_at": "2026-01-16 10:30:00"
   }
   ```

7. **Follow Links:** Spider visits `/products` next
   - Repeat steps 3-6

8. **Continue:** Until all pages scraped or depth limit reached

---

### 🛠️ **Configuration Files Explained:**

#### `settings.py` - Scraper Behavior
```python
# How many pages to scrape at once (speed)
CONCURRENT_REQUESTS = 8

# Wait between requests (politeness - don't overload server)
DOWNLOAD_DELAY = 2  # seconds

# How deep to go (clicks from start page)
DEPTH_LIMIT = 5

# Use a real browser for JavaScript sites
PLAYWRIGHT_BROWSER_TYPE = "chromium"
```

#### `items.py` - Data Structure
Defines what fields to extract:
- url
- title  
- content
- meta_description
- scraped_at
- word_count

#### `pipelines.py` - Data Processing
After scraping, pipelines:
1. **Validate** - Is the content good quality?
2. **Clean** - Remove any remaining junk
3. **Store** - Save to MongoDB

---

### 🎓 **Key Takeaways for Beginners:**

- **`spider.py` is the web crawler** - it visits websites and extracts text
- **`start_requests()`** begins the crawl (either from sitemap or homepage)
- **`parse()`** extracts content from each page
- **`_aggressive_text_cleaning()`** removes junk and keeps useful text
- **`parse_playwright()`** handles JavaScript-heavy websites
- **Duplicate prevention** ensures each page is only scraped once
- **Link extraction** discovers new pages to visit
- **Metadata extraction** gets titles, descriptions, and other info
- **Depth limit** prevents crawling forever (stops at a certain "click depth")

**Real-world analogy:** The spider is like a librarian who:
1. Gets a list of books (sitemap)
2. Visits each book
3. Reads the content
4. Writes down important information
5. Finds references to other books
6. Repeats until all books are cataloged

---

### 5️⃣ Updater Service (`UPDATER/`)

**Purpose**: Background service that automatically checks websites for changes and keeps the chatbot's knowledge up-to-date.

#### 📁 Main Files

| File | Purpose |
|------|---------|
| `updater.py` | Main update logic - checks for website changes |
| `scheduler_new.py` | Runs updater on a schedule (every 2 hours) |
| `run_updater.py` | Manually run one update |
| `run_tenant_updater.py` | Run update for a specific user |
| `run_tenant_scheduler.py` | Start scheduler for a specific user |
| `config.py` | Configuration settings |
| `check_data.py` | Verify data integrity |
| `report_generator.py` | Generate update reports |

---

## 🔄 Understanding `updater.py` - The Change Detector

This service is like a **librarian who checks if books have been updated** and replaces old versions with new ones.

---

### 🎯 **1. What Problem Does It Solve?**

**The Problem:** Websites change over time:
- New pages are added
- Existing pages are edited
- Old pages are deleted
- Prices change
- Products are updated

**Without updater:** The chatbot would give outdated information.

**With updater:** The chatbot always has the latest information!

**Real-world analogy:** Like a newspaper that prints new editions every day with updated news.

---

### 🧩 **2. ContentChangeDetectorSpider Class**

This is a **smart spider** that extends the regular scraper with change detection.

#### `__init__()` - Setup
**What it does:** Sets up the updater with tenant-specific settings.

**Key setup:**
```python
def __init__(
    self,
    domain: str,              # Website to monitor
    start_url: str,           # Where to start checking
    mongo_uri: str,           # Where to store tracking data
    resource_id: str,         # Which user this is for
    vector_store_path: str    # Where embeddings are stored
):
```

**What it validates:**
- ✅ Tenant has a valid resource ID (can't mix user data!)
- ✅ Vector store path exists
- ✅ MongoDB connection works
- ✅ URL tracking collection is ready

**Think of it like:** Setting up a security system that monitors specific rooms (tenant data) and only those rooms.

---

### 📊 **3. URL Tracking - Remembering What We've Seen**

The updater keeps a **database table** called "url_tracking" that remembers:

```python
{
    "url": "https://example.com/products/item1",
    "content_hash": "abc123def456",  # Fingerprint of content
    "last_checked": "2026-01-16 10:00:00",
    "last_modified": "2026-01-15 08:30:00",
    "status": "active",
    "is_indexed": true  # Already in vector store
}
```

**What each field means:**
- **url**: The webpage address
- **content_hash**: A "fingerprint" (MD5 hash) of the content
- **last_checked**: When we last looked at this page
- **last_modified**: When the content last changed
- **status**: Is the page active, deleted, or has errors?
- **is_indexed**: Is this page in the vector store?

**How content_hash works:**
```python
# Old content
content = "Our price is $10"
hash1 = md5(content)  # abc123

# New content (price changed)
content = "Our price is $15"  
hash2 = md5(content)  # xyz789

# hash1 != hash2 → Content changed!
```

**Think of it like:** Taking a photo of each page. If the photo changes, you know the page changed.

---

### 🔍 **4. Change Detection Process**

#### Step 1: Fetch All Tracked URLs
```python
def get_tracked_urls(self):
    # Get all URLs we've seen before
    urls = self.url_tracking.find({"status": "active"})
    return list(urls)
```

#### Step 2: Re-scrape Each URL
```python
def scrape_url(self, url):
    # Visit the URL again
    response = fetch(url)
    
    # Extract the content
    new_content = extract_text(response)
    
    # Calculate new hash
    new_hash = md5(new_content)
    
    return new_content, new_hash
```

#### Step 3: Compare Hashes
```python
def detect_change(self, url):
    # Get old hash from database
    old_record = self.url_tracking.find_one({"url": url})
    old_hash = old_record["content_hash"]
    
    # Get new hash
    new_content, new_hash = scrape_url(url)
    
    # Compare
    if old_hash != new_hash:
        return "CHANGED", new_content
    else:
        return "UNCHANGED", None
```

#### Step 4: Update Vector Store
**If content changed:**
```python
def update_vector_store(self, url, new_content):
    # Step 1: Delete old embedding
    self.chroma_collection.delete(where={"url": url})
    
    # Step 2: Create new embedding
    embedding = self.embedder.encode(new_content)
    
    # Step 3: Add to vector store
    self.chroma_collection.add(
        ids=[url],
        embeddings=[embedding],
        documents=[new_content],
        metadatas=[{"url": url, "updated_at": now()}]
    )
```

#### Step 5: Update Tracking Database
```python
def update_tracking(self, url, new_hash):
    self.url_tracking.update_one(
        {"url": url},
        {
            "$set": {
                "content_hash": new_hash,
                "last_checked": now(),
                "last_modified": now()
            }
        }
    )
```

---

### 🎬 **Complete Update Flow - Example:**

**Scenario:** A store updates the price of a product.

**Before update:**
```
Page: https://store.com/product/laptop
Content: "Price: $999. Specs: 16GB RAM, 512GB SSD"
Hash: abc123
```

1. **Updater runs** (every 2 hours)

2. **Fetch tracked URLs**
   - Finds: `https://store.com/product/laptop`
   - Old hash: `abc123`

3. **Re-scrape the page**
   - New content: "Price: $1099. Specs: 16GB RAM, 512GB SSD"
   - New hash: `xyz789`

4. **Compare hashes**
   - `abc123` ≠ `xyz789` → **Change detected!**

5. **Update vector store**
   - Delete old embedding for this URL
   - Create new embedding with new content
   - Add to ChromaDB

6. **Update tracking database**
   ```python
   {
       "url": "https://store.com/product/laptop",
       "content_hash": "xyz789",  # Updated
       "last_checked": "2026-01-16 12:00:00",
       "last_modified": "2026-01-16 12:00:00"
   }
   ```

7. **Result:** Chatbot now knows the new price is $1099!

---

### ⏰ **5. Scheduler - Automatic Updates**

#### `run_tenant_scheduler.py` - Start Automatic Updates
**What it does:** Starts a background process that runs the updater every 2 hours.

```python
def start_scheduler(resource_id, website_url):
    # Start a loop that runs forever
    while True:
        # Run the updater
        run_updater(resource_id, website_url)
        
        # Wait 2 hours
        sleep(7200)  # 7200 seconds = 2 hours
```

**How it's used:**
1. User enables "Automatic Updates" in the admin panel
2. System calls `start_scheduler()`
3. Process runs in background
4. Updates happen every 2 hours automatically
5. Stops when user disables updates

**Think of it like:** Setting an alarm that goes off every 2 hours to check for website changes.

---

### 📝 **6. Configuration - `config.py`**

Settings that control how the updater behaves:

```python
# How often to check for updates
UPDATE_INTERVAL = 7200  # 2 hours in seconds

# How many URLs to process at once
BATCH_SIZE = 50

# How many times to retry if a page fails
MAX_RETRIES = 3

# MongoDB settings
MONGO_URI = "mongodb://localhost:27017/"
MONGO_DATABASE = "rag_updater"
MONGO_COLLECTION_URL_TRACKING = "url_tracking"

# Vector store settings
CHROMA_DB_PATH = "./final_db"
CHROMA_COLLECTION_NAME = "scraped_content"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Quality control
MINIMUM_CONTENT_LENGTH = 100  # Skip pages with less than 100 chars
```

---

### 🔄 **7. Different Types of Changes**

#### **New Pages** (Not in tracking database)
```python
if url not in tracking_database:
    # This is a new page!
    # 1. Scrape it
    # 2. Add to vector store
    # 3. Add to tracking database
```

#### **Updated Pages** (Hash changed)
```python
if old_hash != new_hash:
    # Content changed!
    # 1. Re-scrape it
    # 2. Update vector store
    # 3. Update tracking database
```

#### **Deleted Pages** (Returns 404 error)
```python
if status_code == 404:
    # Page no longer exists!
    # 1. Remove from vector store
    # 2. Mark as "deleted" in tracking database
```

#### **Unchanged Pages** (Hash same)
```python
if old_hash == new_hash:
    # Nothing changed
    # 1. Update "last_checked" timestamp
    # 2. Skip vector store update (saves time!)
```

---

### 📊 **8. Update Report - `report_generator.py`**

After each update, generates a summary:

```
Update Report - 2026-01-16 12:00:00
=====================================

Total URLs Checked: 100
New Pages Found: 5
Pages Updated: 12
Pages Deleted: 2
Pages Unchanged: 81

Updated Pages:
- https://store.com/product/laptop (Price changed)
- https://store.com/about (Team info updated)
- https://store.com/blog/post1 (Content edited)

Time Taken: 5 minutes
Status: SUCCESS
```

---

### ⚡ **9. Performance Optimizations**

#### Batch Processing
Instead of processing one URL at a time, process multiple at once:
```python
# Slow
for url in urls:
    update(url)

# Fast
batch = urls[0:50]  # Process 50 at a time
for batch in batches:
    update_batch(batch)
```

#### Skip Unchanged Pages
```python
if old_hash == new_hash:
    # Don't update vector store - saves computation!
    continue
```

#### Parallel Requests
Process multiple URLs simultaneously:
```python
import asyncio

async def update_urls(urls):
    tasks = [update(url) for url in urls]
    await asyncio.gather(*tasks)
```

---

### 🎯 **Key Takeaways for Beginners:**

- **Updater keeps chatbot knowledge current** by checking websites for changes
- **Content hash (MD5)** is a "fingerprint" that detects if a page changed
- **URL tracking database** remembers what we've seen and when
- **Scheduler runs every 2 hours** automatically (like a cron job)
- **Only changed pages** are re-processed (saves time and resources)
- **Four types of changes:** New pages, Updated pages, Deleted pages, Unchanged pages
- **Vector store is updated** only when content actually changes
- **Report generator** creates summaries of each update run

**Real-world analogy:** The updater is like a **newspaper editor** who:
1. Checks all news sources every 2 hours
2. Compares new articles to old versions
3. Only updates the newspaper when content actually changes
4. Removes outdated articles
5. Adds new articles
6. Keeps everything current for readers (chatbot users)

---

## 📚 **PYTHON FILES SUMMARY FOR BEGINNERS**

### 🎓 **How All Python Components Work Together**

Let me explain how the three main Python components (Bot, Scraper, Updater) work as a team:

---

### 🔄 **The Complete Lifecycle:**

#### **Phase 1: Initial Setup** (First Time)
```
1. User registers → Admin Backend creates tenant resources
2. User creates a bot → Gets a unique bot token
3. User enters website URL → Ready to scrape!
```

---

#### **Phase 2: Website Scraping** (Getting Knowledge)
```
User clicks "Start Scrape"
         ↓
Admin Backend starts Scraper (spider.py)
         ↓
Scraper visits website:
  • Finds sitemap.xml (list of pages)
  • Visits each page
  • Extracts text content
  • Cleans the text (removes junk)
  • Handles JavaScript sites with Playwright
  • Saves to MongoDB
         ↓
Scraping complete! (100 pages scraped)
```

**What happens:**
- `spider.py` crawls the website
- `parse()` extracts content from each page
- `_aggressive_text_cleaning()` removes navigation, ads, etc.
- Data saved to MongoDB with metadata

---

#### **Phase 3: Knowledge Processing** (Making it Smart)
```
Scraped data in MongoDB
         ↓
Updater processes content:
  • Reads text from MongoDB
  • Breaks long pages into chunks
  • Converts text to numbers (embeddings)
  • Stores in ChromaDB vector store
         ↓
Bot is now ready to answer questions!
```

**What happens:**
- `updater.py` reads scraped content
- Sentence transformer creates embeddings
- ChromaDB stores the vector data
- Bot marked as "ready"

---

#### **Phase 4: Answering Questions** (The Bot in Action)
```
User asks: "What are your business hours?"
         ↓
Widget sends question to Bot (app_20.py)
         ↓
Bot processes query:
  ├─ semantic_search() → Finds 10 relevant chunks
  ├─ rerank_results() → Picks top 3 most relevant
  ├─ generate_response() → Google Gemini writes answer
  └─ extract_contact_info() → Checks for email/phone
         ↓
Bot responds: "We're open Monday-Friday, 9 AM - 5 PM"
         ↓
If contact info found → Save lead to MongoDB
```

**What happens:**
- `semantic_search()` finds similar content using embeddings
- `rerank_results()` uses cross-encoder for accuracy
- `generate_response()` calls Google Gemini API
- `extract_contact_info()` detects email/phone in message
- Response sent back with source URLs

---

#### **Phase 5: Keeping Updated** (Automatic Updates)
```
Every 2 hours (if scheduler enabled):
         ↓
Scheduler wakes up
         ↓
Updater checks website:
  • Re-scrapes all pages
  • Compares content hash (fingerprint)
  • Detects changes
         ↓
For changed pages:
  ├─ Delete old embedding from ChromaDB
  ├─ Create new embedding
  └─ Update vector store
         ↓
Bot now has latest information!
```

**What happens:**
- `scheduler_new.py` runs every 2 hours
- `ContentChangeDetectorSpider` re-scrapes pages
- Compares MD5 hashes to detect changes
- Only updates vector store for changed pages
- Report generated showing what changed

---

### 🎯 **Quick Reference: Which File Does What?**

| Task | Which File? | Main Function |
|------|-------------|---------------|
| 🕷️ Scrape a website | `spider.py` | `parse()` |
| 🧹 Clean text | `spider.py` | `_aggressive_text_cleaning()` |
| 🌐 Handle JavaScript sites | `spider.py` | `parse_playwright()` |
| 🤖 Answer questions | `app_20.py` | `chat_endpoint()` |
| 🔍 Search for relevant info | `app_20.py` | `semantic_search()` |
| ✨ Generate AI response | `app_20.py` | `generate_response()` |
| 📧 Extract contact info | `app_20.py` | `extract_contact_info()` |
| 💾 Save leads | `app_20.py` | `store_lead()` |
| 🔄 Check for changes | `updater.py` | `detect_change()` |
| ⏰ Auto-update schedule | `scheduler_new.py` | Runs every 2 hours |
| 📊 Update vector store | `updater.py` | `update_vector_store()` |

---

### 🧩 **How Data Flows Between Components:**

```
┌─────────────────────────────────────────────────────────────┐
│                        USER'S WEBSITE                        │
│                    (example.com)                             │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Scrape
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    SPIDER (spider.py)                        │
│  • Crawls pages                                              │
│  • Extracts text                                             │
│  • Cleans content                                            │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Save raw text
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    MONGODB (Scraped Data)                    │
│  {url, title, content, metadata}                             │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Process
             ▼
┌─────────────────────────────────────────────────────────────┐
│                  UPDATER (updater.py)                        │
│  • Creates embeddings                                        │
│  • Detects changes                                           │
│  • Updates vector store                                      │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Store embeddings
             ▼
┌─────────────────────────────────────────────────────────────┐
│              CHROMADB (Vector Store)                         │
│  {embeddings, documents, metadata}                           │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Search
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    BOT (app_20.py)                           │
│  • Receives questions                                        │
│  • Searches ChromaDB                                         │
│  • Generates answers                                         │
│  • Captures leads                                            │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Response
             ▼
┌─────────────────────────────────────────────────────────────┐
│                        USER / WIDGET                         │
│              (Gets intelligent answer!)                      │
└─────────────────────────────────────────────────────────────┘
```

---

### 💡 **Common Beginner Questions Answered:**

#### Q: Why do we need both MongoDB and ChromaDB?
**A:** They serve different purposes:
- **MongoDB** stores the actual text content (like a filing cabinet)
- **ChromaDB** stores embeddings for fast semantic search (like an index)

**Analogy:** MongoDB is like a library's bookshelves (stores books), ChromaDB is like the card catalog (helps you find books quickly).

---

#### Q: What are embeddings?
**A:** Embeddings are **numbers that represent meaning**. 

**Example:**
- "What's the price?" → [0.23, -0.45, 0.67, ...]
- "How much does it cost?" → [0.24, -0.44, 0.68, ...]

These numbers are very similar, so the bot knows these questions mean the same thing!

---

#### Q: Why clean the text?
**A:** Websites have lots of junk:
- ❌ Navigation menus ("Home | About | Contact")
- ❌ Ads ("Buy now! Limited time!")
- ❌ Copyright text ("© 2026 All rights reserved")

This junk doesn't help answer questions and wastes storage space. Cleaning keeps only useful content.

---

#### Q: Why use a scheduler?
**A:** Websites change! Without a scheduler:
- ❌ Old prices stay in the bot
- ❌ Deleted pages still show up
- ❌ New products aren't mentioned

With scheduler: Bot always has current information ✅

---

#### Q: What happens if the bot doesn't know the answer?
**A:** The `generate_response()` function tells Gemini:
```python
"If you don't have enough information to answer, say:
'I don't have that information in my knowledge base.'"
```

The bot will **admit when it doesn't know** rather than making up answers.

---

#### Q: How does lead capture work?
**A:** The bot uses regex patterns to detect contact info:

```python
# User says: "My email is john@example.com"

extract_contact_info(message)
  ├─ Regex finds: john@example.com
  ├─ Validates: ✅ Valid email format
  └─ Saves to MongoDB leads collection

# Admin can now follow up with John!
```

---

### 🚀 **Next Steps for Learning:**

1. **Start with `spider.py`**
   - Read the `parse()` function
   - Understand how it extracts text
   - Try modifying `_aggressive_text_cleaning()`

2. **Move to `app_20.py`**
   - Study `semantic_search()` to see how it finds relevant content
   - Look at `generate_response()` to see AI in action
   - Understand `extract_contact_info()` regex patterns

3. **Finally `updater.py`**
   - See how `detect_change()` compares hashes
   - Understand the update flow
   - Study scheduler behavior

4. **Experiment!**
   - Add new regex patterns for lead extraction
   - Modify cleaning rules
   - Adjust search parameters
   - Test with different websites

---

### 📖 **Key Python Concepts Used:**

| Concept | Where It's Used | Example |
|---------|-----------------|---------|
| **Classes** | `TenantRAGChatbot`, `FixedUniversalSpider` | Object-oriented programming |
| **Async/Await** | FastAPI endpoints, async scraping | Non-blocking operations |
| **Regex** | Email/phone extraction, text cleaning | Pattern matching |
| **List Comprehensions** | Filtering links, cleaning sentences | `[x for x in list if condition]` |
| **Decorators** | `@app.post("/chat")`, `@staticmethod` | Function modifiers |
| **Context Managers** | MongoDB connections, file operations | `with ... as ...` |
| **Type Hints** | `def func(x: int) -> str:` | Type annotations |
| **Exception Handling** | `try/except` blocks everywhere | Error management |

---

### 🎯 **Final Summary:**

The Python components work together like a **smart library system**:

1. **Spider** = Librarian who visits bookstores and brings back new books
2. **Updater** = Assistant who checks if books have new editions
3. **Bot** = Reference desk that answers visitor questions using the books

All three ensure the chatbot has **current**, **accurate** information and can **intelligently answer** user questions!

---

### 6️⃣ Deployment (`deployment/`)

**Purpose**: Production deployment scripts and configuration files for server setup.

#### Files

| File | Description | Purpose |
|------|-------------|---------|
| `deploy.sh` | Deployment automation | - Pulls latest code from Git<br>- Installs dependencies<br>- Builds frontend<br>- Restarts services<br>- Runs migrations |
| `setup.sh` | Initial server setup | - Installs system dependencies<br>- Creates directories<br>- Sets file permissions<br>- Configures firewall |
| `nginx.conf` | Nginx configuration | - Reverse proxy setup<br>- SSL configuration<br>- Static file serving<br>- WebSocket support |
| `rag-bot.service` | systemd service file | - Auto-start on boot<br>- Process monitoring<br>- Restart on failure |

#### Nginx Configuration Highlights:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Frontend (React)
    location / {
        root /var/www/rag-chatbot/admin-frontend/build;
        try_files $uri /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Bot service
    location /bot {
        proxy_pass http://localhost:8000;
    }
    
    # WebSocket support
    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 🗄️ Database Schema

### MongoDB Collections

#### 1. Users Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique per admin),
  username: String (globally unique),
  password: String (bcrypt hash),
  role: String, // 'admin' or 'user'
  adminId: ObjectId, // Reference to parent admin (for users)
  resourceId: String, // Tenant identifier
  databaseUri: String, // Tenant MongoDB URI
  vectorStorePath: String, // Path to tenant ChromaDB
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### 2. Bots Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId, // Reference to User
  name: String,
  vectorStorePath: String,
  apiToken: String (unique), // Bot authentication token
  scrapedWebsites: [String], // List of scraped URLs
  isActive: Boolean,
  isReady: Boolean, // Ready for queries
  schedulerPid: Number, // Process ID of scheduler
  schedulerStatus: String, // 'active' or 'inactive'
  schedulerConfig: Object, // Scheduler configuration
  lastScrapedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### 3. Conversations Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId, // Bot owner
  sessionId: String (unique), // UUID session identifier
  messages: [
    {
      sender: String, // 'user' or 'bot'
      content: String,
      timestamp: Date
    }
  ],
  leadInfo: {
    name: String,
    email: String,
    phone: String,
    capturedAt: Date
  },
  userAgent: String,
  ipAddress: String,
  startedAt: Date,
  lastMessageAt: Date
}
```

#### 4. Agents Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String,
  password: String (bcrypt hash),
  adminId: ObjectId, // Parent admin reference
  assignedConversations: [ObjectId], // Assigned chat IDs
  isActive: Boolean,
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### 5. ScrapeHistory Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  website: String,
  status: String, // 'pending', 'running', 'completed', 'failed'
  pagesScraped: Number,
  startedAt: Date,
  completedAt: Date,
  errors: [String],
  metadata: {
    depth: Number,
    maxPages: Number,
    usePlaywright: Boolean
  }
}
```

#### 6. Scraped Data Collection (Per Tenant)
```javascript
{
  _id: ObjectId,
  url: String (unique),
  title: String,
  content: String, // Extracted text
  meta_description: String,
  content_type: String,
  extraction_method: String, // 'static' or 'playwright'
  page_depth: Number,
  response_status: Number,
  content_length: Number,
  word_count: Number,
  domain: String,
  content_hash: String, // MD5 hash for change detection
  scraped_at: Date,
  extracted_at: Date
}
```

#### 7. URL Tracking Collection (Per Tenant)
```javascript
{
  _id: ObjectId,
  url: String (unique),
  content_hash: String,
  last_checked: Date,
  last_modified: Date,
  status: String, // 'active', 'deleted', 'error'
  check_count: Number,
  is_indexed: Boolean // Present in vector store
}
```

### ChromaDB Collections

#### Scraped Content Collection (Per Tenant)
```python
{
  "id": "unique_document_id",
  "embedding": [768 floats], # Sentence transformer embeddings
  "metadata": {
    "url": str,
    "title": str,
    "content_type": str,
    "domain": str,
    "scraped_at": str,
    "chunk_index": int, # For multi-chunk documents
    "total_chunks": int
  },
  "document": str # Text content
}
```

---

## 🔌 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| POST | `/api/auth/register` | Register new user | `{name, email, username, password}` | `{message, user, token}` |
| POST | `/api/auth/login` | User login | `{username, password}` | `{message, user, token}` |
| POST | `/api/auth/request-reset` | Request password reset | `{email}` | `{message}` |
| POST | `/api/auth/reset-password` | Reset password | `{token, password}` | `{message}` |

### User Management Endpoints

| Method | Endpoint | Description | Auth Required | Admin Only |
|--------|----------|-------------|---------------|------------|
| GET | `/api/user/profile` | Get user profile | ✅ | ❌ |
| PUT | `/api/user/profile` | Update profile | ✅ | ❌ |
| DELETE | `/api/user/account` | Delete account | ✅ | ❌ |
| GET | `/api/users` | List all users | ✅ | ✅ |
| POST | `/api/users` | Create sub-user | ✅ | ✅ |
| PUT | `/api/users/:id` | Update user | ✅ | ✅ |
| DELETE | `/api/users/:id` | Delete user | ✅ | ✅ |

### Bot Management Endpoints

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| POST | `/api/bot/create` | Create new bot | `{name}` | `{message, bot, token}` |
| GET | `/api/bot` | List user's bots | - | `{bots: []}` |
| GET | `/api/bot/:id` | Get bot details | - | `{bot}` |
| PUT | `/api/bot/:id` | Update bot | `{name, isActive}` | `{message, bot}` |
| DELETE | `/api/bot/:id` | Delete bot | - | `{message}` |
| GET | `/api/bot/:id/status` | Check bot readiness | - | `{isReady, status}` |

### Scraping Endpoints

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| POST | `/api/scrape/start` | Start scrape job | `{website, depth, maxPages, enableScheduler}` | `{message, jobId}` |
| GET | `/api/scrape/history` | Get scrape logs | - | `{history: []}` |
| GET | `/api/scrape/history/:id` | Get specific scrape | - | `{scrape}` |
| POST | `/api/scrape/scheduler/start` | Enable scheduler | `{botId, interval}` | `{message, pid}` |
| POST | `/api/scrape/scheduler/stop` | Disable scheduler | `{botId}` | `{message}` |
| GET | `/api/scrape/scheduler/status` | Check scheduler | `{botId}` | `{status, config}` |

### Chat Endpoints

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| POST | `/bot/chat` | Send chat message | `{query, sessionId, resourceId, databaseUri, vectorStorePath}` | `{response, sources, leadCaptured}` |
| GET | `/api/chat/conversations` | List conversations | - | `{conversations: []}` |
| GET | `/api/chat/conversations/:id/messages` | Get messages | - | `{messages: []}` |
| POST | `/api/chat/conversations/:id/export` | Export conversation | - | `{data, format}` |
| DELETE | `/api/chat/conversations/:id` | Delete conversation | - | `{message}` |

### Agent Endpoints

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| POST | `/api/agents` | Create agent | `{name, email, password}` | `{message, agent}` |
| GET | `/api/agents` | List agents | - | `{agents: []}` |
| GET | `/api/agents/:id` | Get agent details | - | `{agent}` |
| PUT | `/api/agents/:id` | Update agent | `{name, email, isActive}` | `{message, agent}` |
| DELETE | `/api/agents/:id` | Delete agent | - | `{message}` |
| POST | `/api/agents/login` | Agent login | `{email, password}` | `{message, agent, token}` |
| GET | `/api/agents/chats` | Get assigned chats | - | `{conversations: []}` |

### Health & Monitoring Endpoints

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/bot/health` | Bot service health | `{status, uptime, memory}` |
| GET | `/api/health` | Admin backend health | `{status, database, services}` |
| GET | `/bot/stats` | Bot statistics | `{totalQueries, avgResponseTime}` |

---

## 🌍 Environment Variables

### Required Variables (.env file at project root)

```bash
# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/rag_admin
# Main database connection string for admin backend

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
# Secret key for signing JWT tokens (must be strong in production)

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key-from-google-ai-studio
# API key for Google Gemini text generation

# Service Communication
FASTAPI_SHARED_SECRET=your-shared-secret-between-express-and-fastapi
# Shared secret for secure communication between admin backend and bot service

# URLs
FASTAPI_BOT_URL=http://localhost:8000
# Bot service URL (change to domain in production)

CORS_ORIGIN=*
# Allowed origins for CORS (use specific domain in production, e.g., https://yourdomain.com)

# Feature Flags
ENABLE_WIDGET=true
# Enable embeddable chat widget

# Email Configuration (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=noreply@yourdomain.com
# SMTP settings for password reset emails

# Server Configuration
NODE_ENV=development
# Environment: 'development' or 'production'

PORT=5000
# Admin backend port

BOT_PORT=8000
# Bot service port

# Security
BCRYPT_SALT_ROUNDS=10
# Bcrypt hashing rounds (higher = more secure but slower)

# Rate Limiting
RATE_LIMIT_WINDOW=15
# Rate limit window in minutes

RATE_LIMIT_MAX_REQUESTS=100
# Maximum requests per window

# Data Storage
RAG_DATA_ROOT=/var/lib/rag-data
# Root directory for all tenant data (vector stores, etc.)
# In production: /var/lib/rag-data
# In development: ./data

# Scraping Configuration
DEFAULT_SCRAPE_DEPTH=3
# Default maximum depth for web scraping

DEFAULT_MAX_PAGES=100
# Default maximum pages to scrape per job

SCRAPE_TIMEOUT=3600
# Scrape job timeout in seconds (1 hour)

# Vector Store Configuration
EMBEDDING_MODEL=all-MiniLM-L6-v2
# Sentence transformer model for embeddings

CHROMA_COLLECTION_NAME=scraped_content
# Default ChromaDB collection name

# Bot Configuration
MAX_CONTEXT_CHUNKS=5
# Maximum chunks to use in RAG context

RERANK_TOP_K=3
# Number of results after reranking

# Logging
LOG_LEVEL=info
# Logging level: 'debug', 'info', 'warn', 'error'

# Session Configuration
SESSION_TIMEOUT=3600
# Session timeout in seconds
```

### Production Recommendations:

```bash
# Production Settings
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
JWT_SECRET=<generate with: openssl rand -base64 32>
FASTAPI_SHARED_SECRET=<generate with: openssl rand -base64 32>
ENABLE_WIDGET=true
BCRYPT_SALT_ROUNDS=12
LOG_LEVEL=warn
```

---

## 🏢 Multi-Tenancy Architecture

### Tenant Isolation Strategy

Each user (tenant) operates in complete isolation with:

1. **Unique Resource ID** (`resourceId`)
   - Generated on user registration
   - Format: `user_<timestamp>_<randomString>`
   - Used to identify all tenant resources

2. **Dedicated Database**
   - Separate MongoDB database per tenant
   - Format: `rag_<resourceId>`
   - Contains: scraped data, conversations, leads

3. **Isolated Vector Store**
   - Separate ChromaDB path per tenant
   - Format: `/var/lib/rag-data/vector_stores/<resourceId>`
   - Contains: embeddings, document chunks

4. **Unique API Token**
   - Generated per bot
   - Used for bot API authentication
   - Cannot access other tenant's data

### Tenant Provisioning Flow:

```
User Registration
       ↓
Generate resourceId
       ↓
Create MongoDB Database (rag_<resourceId>)
       ↓
Create Vector Store Directory (<resourceId>/)
       ↓
Generate API Token
       ↓
Store tenant config in User document
       ↓
Return success
```

### Request Routing:

```
Incoming Request
       ↓
Extract Bot Token / User JWT
       ↓
Resolve resourceId from token
       ↓
Load tenant context:
  - databaseUri
  - vectorStorePath
       ↓
Initialize tenant-specific:
  - MongoDB client
  - ChromaDB client
       ↓
Process request with tenant data
       ↓
Return response
```

### Data Isolation Guarantees:

✅ **Database Level**: Each tenant has separate MongoDB database
✅ **Vector Store Level**: Each tenant has separate ChromaDB directory
✅ **API Level**: Tokens are scoped to specific tenant
✅ **Middleware Level**: `resolveTenant` middleware enforces isolation
✅ **Query Level**: All database queries filtered by resourceId

---

## 🚀 Getting Started

### Development Setup

1. **Clone Repository**
```bash
git clone https://github.com/excellis-it/excellis_chatbot.git
cd excellis_chatbot
```

2. **Install Dependencies**
```bash
# Backend
cd admin-backend
npm install

# Frontend
cd ../admin-frontend
npm install

# Python dependencies
cd ..
pip install -r requirements.txt
```

3. **Configure Environment**
```bash
# Create .env file in project root
cp .env.example .env
# Edit .env with your configuration
```

4. **Start MongoDB**
```bash
# Local MongoDB
mongod

# Or use MongoDB Atlas connection string
```

5. **Start Services**
```bash
# Terminal 1 - Admin Backend
cd admin-backend
npm run dev

# Terminal 2 - Bot Service
cd BOT
python app_20.py

# Terminal 3 - Frontend
cd admin-frontend
npm start
```

6. **Access Application**
- Frontend: http://localhost:3000
- Admin API: http://localhost:5000
- Bot API: http://localhost:8000

---

## 📝 Common Operations

### Create a New Bot

1. Register/Login to admin panel
2. Navigate to "Bots" page
3. Click "Create Bot"
4. Enter bot name
5. Copy API token (save securely)
6. Start scraping your website

### Scrape a Website

1. Select bot
2. Click "Scrape Website"
3. Enter website URL
4. Set crawl depth and max pages
5. (Optional) Enable auto-updates
6. Click "Start Scrape"
7. Monitor progress in scrape history

### Embed Chat Widget

1. Get bot API token
2. Use `WidgetInstaller` component to generate embed code
3. Copy script tag:
```html
<script src="https://yourdomain.com/ragChatWidget.js"></script>
<script>
  RAGChatWidget.init({
    botToken: 'your-bot-api-token',
    resourceId: 'your-resource-id'
  });
</script>
```
4. Paste into your website's HTML

### Enable Automatic Updates

1. Select bot
2. Open scrape modal
3. Check "Enable Automatic Updates"
4. Start scrape
5. Scheduler runs every 2 hours
6. To stop: Click "Stop Scheduler"

---

## 🔍 Troubleshooting

### Bot not responding?

- Check bot service is running: `GET /bot/health`
- Verify ChromaDB has data: Check vector store directory
- Ensure bot is marked as "ready": Check `isReady` field

### Scraping failed?

- Check website robots.txt
- Increase download delay in Scrapy settings
- Enable Playwright for JavaScript-heavy sites
- Check logs in ScrapeHistory collection

### Authentication errors?

- Verify JWT_SECRET matches across services
- Check token expiration
- Ensure CORS_ORIGIN allows frontend domain

### Database connection issues?

- Verify MongoDB is running
- Check MONGO_URI connection string
- Ensure network connectivity
- Check MongoDB logs

---

## 🎯 **QUICK REFERENCE GUIDE**

### 📋 **Python Functions Cheat Sheet**

#### **BOT (`app_20.py`)**

| Function | What It Does | When To Use |
|----------|--------------|-------------|
| `get_tenant_context()` | Validates tenant ID and loads settings | Every bot request (security) |
| `LeadValidator.validate_email()` | Checks if email is valid | Before saving contact info |
| `LeadValidator.validate_phone()` | Checks if phone is valid | Before saving contact info |
| `LeadValidator.validate_name()` | Checks if name is real | Before saving contact info |
| `ContactInformationExtractor.extract_emails()` | Finds emails in text | Detecting user contact info |
| `ContactInformationExtractor.extract_phones()` | Finds phone numbers | Detecting user contact info |
| `TenantRAGChatbot.__init__()` | Sets up bot with AI models | Creating new bot instance |
| `semantic_search()` | Finds relevant content chunks | Every user question |
| `rerank_results()` | Sorts results by relevance | After semantic search |
| `generate_response()` | Creates AI answer with Gemini | Generating chatbot response |
| `extract_contact_info()` | Detects email/phone in message | Every user message |
| `store_lead()` | Saves lead to database | When contact info found |
| `reload_vector_store()` | Refreshes knowledge from disk | After scraping new content |
| `init_mongodb_connection()` | Connects to database | Bot startup |
| `save_lead_to_database()` | Saves lead data | Lead capture |
| `get_all_leads()` | Gets all saved leads | Admin viewing leads |

#### **SCRAPER (`spider.py`)**

| Function | What It Does | When To Use |
|----------|--------------|-------------|
| `FixedUniversalSpider.__init__()` | Sets up crawler with settings | Starting new scrape |
| `start_requests()` | Begins crawling | Spider startup |
| `parse_sitemap()` | Reads sitemap.xml | Finding all pages |
| `parse_any()` | Routes page to correct parser | Every page visited |
| `parse()` | Extracts content from HTML | Regular web pages |
| `parse_playwright()` | Handles JavaScript sites | React/Angular/Vue sites |
| `_aggressive_text_cleaning()` | Removes junk from text | Cleaning scraped content |
| `_is_boilerplate_text()` | Detects navigation/footer text | Filtering low-value content |
| `_extract_follow_links()` | Finds links to visit | Discovering new pages |
| `extract_metadata()` | Gets title, description, etc. | Every scraped page |
| `_build_item()` | Creates data object | Saving scraped data |

#### **UPDATER (`updater.py`)**

| Function | What It Does | When To Use |
|----------|--------------|-------------|
| `build_url_tracking_collection()` | Gets tracking DB name | Updater initialization |
| `ContentChangeDetectorSpider.__init__()` | Sets up change detection | Starting updater |
| `get_tracked_urls()` | Gets all known URLs | Beginning update cycle |
| `scrape_url()` | Re-scrapes a page | Checking for changes |
| `detect_change()` | Compares old vs new hash | Every tracked URL |
| `update_vector_store()` | Updates ChromaDB embeddings | When content changes |
| `update_tracking()` | Updates URL tracking DB | After processing URL |
| `delete_stale_documents()` | Removes deleted pages | Finding 404 errors |

---

### 🔧 **Common Code Patterns**

#### **Starting the Bot**
```python
# In terminal
cd BOT
python app_20.py

# Or with auto-restart
python run_bot_with_autorestart.py
```

#### **Starting a Scrape**
```python
# Via API (from admin panel)
POST /api/scrape/start
{
  "website": "https://example.com",
  "depth": 5,
  "enableScheduler": false
}

# Manual Python
cd Scraping2
python run_tenant_spider.py --domain example.com --start-url https://example.com
```

#### **Enabling Auto-Updates**
```python
# Via API
POST /api/scrape/scheduler/start
{
  "botId": "bot_123",
  "interval": 7200  # 2 hours
}

# Manual Python
cd UPDATER
python run_tenant_scheduler.py --resource-id user_123
```

#### **Testing the Bot**
```bash
# Health check
curl http://localhost:8000/health

# Test query
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are your hours?",
    "sessionId": "test123",
    "resourceId": "user_456",
    "botToken": "your-bot-token"
  }'
```

---

### 🐛 **Debugging Tips**

#### **Bot Not Responding?**
```python
# Check 1: Is vector store loaded?
doc_count = bot.collection.count()
print(f"Documents in store: {doc_count}")  # Should be > 0

# Check 2: Is MongoDB connected?
bot.mongo_client.admin.command('ping')  # Should not error

# Check 3: Is Gemini API working?
response = genai.generate_content("Test")
print(response.text)  # Should return text
```

#### **Scraper Not Finding Pages?**
```python
# Check 1: Does sitemap exist?
import requests
response = requests.get("https://example.com/sitemap.xml")
print(response.status_code)  # Should be 200

# Check 2: Is domain correct?
print(spider.allowed_domains)  # Should match website

# Check 3: Are pages being skipped?
print(f"Discovered: {len(spider.discovered_urls)}")
print(f"Processed: {spider.urls_processed}")
```

#### **Updater Not Detecting Changes?**
```python
# Check 1: Are URLs being tracked?
tracked = list(url_tracking.find())
print(f"Tracked URLs: {len(tracked)}")

# Check 2: Is hash changing?
old_hash = url_tracking.find_one({"url": url})["content_hash"]
new_content = scrape_url(url)
new_hash = md5(new_content)
print(f"Old: {old_hash}, New: {new_hash}, Changed: {old_hash != new_hash}")

# Check 3: Is vector store updating?
before_count = collection.count()
update_vector_store(url, new_content)
after_count = collection.count()
print(f"Before: {before_count}, After: {after_count}")
```

---

### 📊 **Performance Tuning**

#### **Bot Service**
```python
# Increase search results
semantic_search(query, top_k=20)  # Default: 10

# More reranking candidates
rerank_results(query, docs, top_n=5)  # Default: 3

# Adjust response length
genai.configure(max_output_tokens=500)  # Default: varies
```

#### **Scraper**
```python
# Faster scraping (in settings.py)
CONCURRENT_REQUESTS = 16  # Default: 8 (higher = faster but more load)
DOWNLOAD_DELAY = 1  # Default: 2 seconds (lower = faster but less polite)

# Depth limit
max_depth = 3  # Default: 999 (lower = faster but less complete)
```

#### **Updater**
```python
# Batch processing (in config.py)
BATCH_SIZE = 100  # Default: 50 (higher = faster)

# Update interval
UPDATE_INTERVAL = 3600  # Default: 7200 (1 hour instead of 2)
```

---

### 🔐 **Security Checklist**

- [ ] Changed `JWT_SECRET` from default
- [ ] Changed `FASTAPI_SHARED_SECRET` from default
- [ ] Enabled HTTPS in production
- [ ] Set `CORS_ORIGIN` to specific domain (not `*`)
- [ ] MongoDB uses authentication
- [ ] Bot tokens are kept secret
- [ ] Rate limiting is enabled
- [ ] Input validation on all endpoints
- [ ] File uploads are disabled or restricted
- [ ] Error messages don't reveal system info

---

### 📈 **Monitoring Commands**

```bash
# Check bot service status
systemctl status rag-bot

# View bot logs
tail -f /var/log/rag-bot.log

# Check database connections
mongo --eval "db.adminCommand('ping')"

# Monitor Python processes
ps aux | grep python

# Check disk space (vector stores can be large!)
df -h

# View system resources
htop

# Check web server
systemctl status nginx

# View nginx logs
tail -f /var/log/nginx/error.log
```

---

### 🎓 **Learning Path for Beginners**

#### **Week 1: Understanding the Basics**
- [ ] Read "Bot Service" section
- [ ] Understand `semantic_search()`
- [ ] Test bot with sample queries
- [ ] Study lead extraction regex

#### **Week 2: Web Scraping**
- [ ] Read "Web Scraper" section  
- [ ] Run spider on a test website
- [ ] Modify text cleaning rules
- [ ] Understand sitemap parsing

#### **Week 3: Updates & Maintenance**
- [ ] Read "Updater Service" section
- [ ] Enable scheduler for a bot
- [ ] Monitor change detection
- [ ] Study hash comparison logic

#### **Week 4: Integration**
- [ ] Understand data flow between components
- [ ] Trace a query from user to response
- [ ] Debug issues systematically
- [ ] Optimize performance

---

## 📚 Additional Resources

- **API Documentation**: See Swagger UI at `/api/docs` (if enabled)
- **Deployment Guide**: See [SIMPLE_DEPLOYMENT_GUIDE.md](SIMPLE_DEPLOYMENT_GUIDE.md)
- **Tenant Architecture**: See [admin-backend/docs/tenant-architecture.md](admin-backend/docs/tenant-architecture.md)
- **Scrapy Documentation**: https://docs.scrapy.org
- **FastAPI Documentation**: https://fastapi.tiangolo.com
- **ChromaDB Documentation**: https://docs.trychroma.com

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## 📄 License

This project is proprietary software owned by Excellis IT. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

---

## 📞 Support

For support, email: support@excellisit.com

---

**Last Updated**: January 16, 2026
**Version**: 1.0.0
**Maintainer**: Excellis IT Development Team
