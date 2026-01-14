# Enhanced RAG Chatbot with MongoDB Lead Storage and Contact Information Extraction - MONGODB VERSION

import chromadb
from sentence_transformers import SentenceTransformer, CrossEncoder
import google.generativeai as genai
from typing import Any, List, Dict, Tuple, Optional
import asyncio
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Depends, BackgroundTasks
from pydantic import BaseModel
from contextlib import asynccontextmanager
import uvicorn
import datetime
import hmac
import uuid
import re
import numpy as np
from fastapi.middleware.cors import CORSMiddleware

# MongoDB imports are optional; gracefully degrade when unavailable.
try:
    from pymongo import MongoClient  # type: ignore
    from pymongo.uri_parser import parse_uri  # type: ignore
    from pymongo.errors import DuplicateKeyError, ServerSelectionTimeoutError  # type: ignore
    import pymongo  # type: ignore
    PYMONGO_AVAILABLE = True
except ImportError:
    MongoClient = None  # type: ignore
    parse_uri = None

    class DuplicateKeyError(Exception):
        """Fallback duplicate key error when pymongo is missing."""

    class ServerSelectionTimeoutError(Exception):
        """Fallback server timeout error when pymongo is missing."""

    class _PyMongoFallback:
        DESCENDING = -1

    pymongo = _PyMongoFallback()  # type: ignore
    PYMONGO_AVAILABLE = False

# Load environment variables from .env file in R2 root
# load_dotenv() automatically searches parent directories
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

FASTAPI_SHARED_SECRET = os.getenv("FASTAPI_SHARED_SECRET")
ENFORCE_SERVICE_SECRET = bool(
    FASTAPI_SHARED_SECRET and FASTAPI_SHARED_SECRET.strip().lower() not in {"", "change-me"}
)


def get_tenant_context(
    resource_id: str,
    database_uri: str = None,
    vector_store_path: str = None
) -> Dict[str, str]:
    """
    Validate and return tenant-specific context for RAG chatbot.
    
    Args:
        resource_id: The tenant's resource identifier
        database_uri: Optional database URI (passed through if provided)
        vector_store_path: Optional vector store path (passed through if provided)
    
    Returns:
        Dictionary containing validated tenant context
    """
    # Validate resource_id
    if not resource_id or not resource_id.strip():
        raise ValueError("resource_id is required and cannot be empty")
    
    # Return validated context - pass through provided values
    return {
        "resource_id": resource_id.strip(),
        "database_uri": database_uri.strip() if database_uri else None,
        "vector_store_path": vector_store_path.strip() if vector_store_path else None
    }


class LeadValidator:
    """Validate user-provided lead information (name, email, phone)"""
    
    @staticmethod
    def validate_name(name: str) -> Tuple[bool, str]:
        """
        Validate name using Python built-in string methods only (NO regex).
        Returns: (is_valid, error_message)
        """
        if not name:
            return False, "Name cannot be empty."
        
        name = name.strip()
        
        # Check minimum length
        if len(name) < 2:
            return False, "Name must be at least 2 characters long."
        
        # Check maximum length
        if len(name) > 100:
            return False, "Name is too long (maximum 100 characters)."
        
        # Check if name contains at least one letter
        has_letter = any(char.isalpha() for char in name)
        if not has_letter:
            return False, "Name must contain at least one letter."
        
        # Check for excessive numbers (more than 30% of characters)
        digit_count = sum(1 for char in name if char.isdigit())
        if len(name) > 0 and (digit_count / len(name)) > 0.3:
            return False, "Name contains too many numbers. Please provide a valid name."
        
        
        for char in name:
            if not (char.isalpha() or char in " '-."):
                return False, f"Name contains invalid character: '{char}'. Only letters, spaces, hyphens, apostrophes, and periods are allowed."
        
        # Check for excessive special characters
        special_count = sum(1 for char in name if char in "'-.")
        if special_count > len(name) // 2:
            return False, "Name contains too many special characters."
        
        return True, ""
    
    @staticmethod
    def validate_email(email: str) -> Tuple[bool, str]:
        """
        Validate email using regex.
        Returns: (is_valid, error_message)
        """
        if not email:
            return False, "Email cannot be empty."
        
        email = email.strip().lower()
        
        # Check length
        if len(email) < 5:
            return False, "Email is too short."
        
        if len(email) > 254:
            return False, "Email is too long (maximum 254 characters)."
        
        # Comprehensive email regex pattern
        email_pattern = r'^[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$'
        
        if not re.match(email_pattern, email):
            return False, "Invalid email format. Please provide a valid email address (e.g., user@example.com)."
        
        # Additional checks
        if email.count('@') != 1:
            return False, "Email must contain exactly one @ symbol."
        
        local_part, domain_part = email.split('@')
        
        # Validate local part (before @)
        if not local_part or len(local_part) > 64:
            return False, "Invalid email format (local part issue)."
        
        if local_part.startswith('.') or local_part.endswith('.'):
            return False, "Email cannot start or end with a period."
        
        if '..' in local_part:
            return False, "Email cannot contain consecutive periods."
        
        # Validate domain part (after @)
        if not domain_part or len(domain_part) < 3:
            return False, "Invalid email domain."
        
        if domain_part.startswith('.') or domain_part.endswith('.') or domain_part.startswith('-') or domain_part.endswith('-'):
            return False, "Invalid email domain format."
        
        # Check for consecutive periods in domain
        if '..' in domain_part:
            return False, "Email domain cannot contain consecutive periods."
        
        # Check if domain has at least one dot
        if '.' not in domain_part:
            return False, "Email domain must contain at least one period."
        
        return True, ""
    
    @staticmethod
    def validate_phone(phone: str) -> Tuple[bool, str]:
        """
        Validate phone number using regex.
        Returns: (is_valid, error_message)
        """
        if not phone:
            return False, "Phone number cannot be empty."
        
        phone = phone.strip()
        
        # Check length
        if len(phone) < 7:
            return False, "Phone number is too short (minimum 7 characters)."
        
        if len(phone) > 20:
            return False, "Phone number is too long (maximum 20 characters)."
        
        # Phone number patterns (various formats)
        phone_patterns = [
            r'^\+?1?\s*\(?[0-9]{3}\)?\s*[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$',  # US/Canada: +1 (123) 456-7890
            r'^\+?[0-9]{1,4}\s*\(?[0-9]{2,4}\)?\s*[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}$',  # International
            r'^[0-9]{10}$',  # Simple 10-digit: 1234567890
            r'^[0-9]{3}[-.\s][0-9]{3}[-.\s][0-9]{4}$',  # 123-456-7890
            r'^\([0-9]{3}\)\s*[0-9]{3}[-.\s]?[0-9]{4}$',  # (123) 456-7890
            r'^\+[0-9]{1,3}\s*[0-9]{9,12}$',  # International: +12 123456789
        ]
        
        is_valid = any(re.match(pattern, phone) for pattern in phone_patterns)
        
        if not is_valid:
            return False, "Invalid phone number format. Please provide a valid phone number (e.g., +1-234-567-8900 or (123) 456-7890)."
        
        # Check if phone has enough digits (minimum 10)
        digit_count = sum(1 for char in phone if char.isdigit())
        if digit_count < 10:
            return False, "Phone number must contain at least 10 digits."
        
        return True, ""


class ContactInformationExtractor:
    """Extract contact information from text content with improved email detection"""

    def __init__(self):
        # Improved email patterns - more comprehensive
        self.email_patterns = [
            r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b',
            r'\b[a-zA-Z0-9._%-]+\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,}\b',
            r'\b[a-zA-Z0-9]+[._-]*[a-zA-Z0-9]*@[a-zA-Z0-9]+[.-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}\b',
            r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
            r'(?i)(?:email|mail|e-mail)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
        ]

        # Enhanced phone patterns
        self.phone_patterns = [
            r'\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}',
            r'\+?[0-9]{1,4}[-.\s]?\(?[0-9]{3,4}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4,5}',
            r'\b(?:phone|tel|mobile|cell|contact)\s*:?\s*[\+]?[^\n]{7,60}\b',
            r'\b[0-9]{3}[-.\s][0-9]{3}[-.\s][0-9]{4}\b',
            r'\([0-9]{3}\)\s*[0-9]{3}[-.\s]?[0-9]{4}',
            r'(?i)(?:phone|tel|mobile|call)\s*:?\s*([\+]?[0-9\s\-\(\)\.]{7,20})',
        ]

        # Contact keywords for detection
        self.contact_keywords = [
            'contact', 'reach', 'email', 'phone', 'call', 'write', 'get in touch',
            'customer service', 'support', 'help desk', 'sales', 'inquiry',
            'office', 'headquarters', 'location', 'address', 'visit', 'how to contact',
            'contact us', 'contact information', 'contact details', 'get hold of',
            'email address', 'phone number', 'contact via email', 'send email'
        ]

    def extract_emails(self, text: str) -> List[str]:
        """Extract email addresses from text with improved patterns"""
        emails = set()
        for pattern in self.email_patterns:
            try:
                matches = re.findall(pattern, text, re.IGNORECASE)
                for match in matches:
                    if isinstance(match, tuple):
                        match = match[0] if match[0] else match[1] if len(match) > 1 else ""
                    email = re.sub(r'\s+', '', str(match).lower())
                    email = email.strip('.,;:!?()[]{}"\'')
                    if '@' in email and '.' in email.split('@')[1] and len(email) > 5:
                        parts = email.split('@')
                        if len(parts) == 2 and len(parts[0]) > 0 and len(parts[1]) > 2:
                            emails.add(email)
            except Exception as e:
                print(f"❌ Error in email pattern {pattern}: {e}")
                continue
        return list(emails)

    def extract_phones(self, text: str) -> List[str]:
        """Extract phone numbers from text with improved patterns"""
        phones = set()
        for pattern in self.phone_patterns:
            try:
                matches = re.findall(pattern, text, re.IGNORECASE)
                for match in matches:
                    if isinstance(match, tuple):
                        match = match[0] if match[0] else match[1] if len(match) > 1 else ""
                    phone_clean = re.sub(r'[^\d\+]', '', str(match))
                    if len(phone_clean) >= 10:
                        phones.add(str(match).strip())
            except Exception as e:
                print(f"❌ Error in phone pattern {pattern}: {e}")
                continue
        return list(phones)

    def extract_all_contact_info(self, text: str) -> Dict[str, List[str]]:
        """Extract all types of contact information"""
        if not text or not text.strip():
            return {'emails': [], 'phones': [], 'addresses': []}
        return {
            'emails': self.extract_emails(text),
            'phones': self.extract_phones(text),
            'addresses': []
        }

    def extract_contact_info(self, text: str) -> Dict:
        """Extract contact information and determine if contact info is present"""
        if not text or not text.strip():
            return {'has_contact': False, 'emails': [], 'phones': [], 'addresses': []}

        all_info = self.extract_all_contact_info(text)
        has_contact = bool(all_info['emails'] or all_info['phones'] or all_info['addresses'])

        return {
            'has_contact': has_contact,
            'emails': all_info['emails'],
            'phones': all_info['phones'],
            'addresses': all_info['addresses']
        }

    def is_contact_query(self, question: str) -> bool:
        """Check if the question is asking for contact information"""
        question_lower = question.lower()
        return any(keyword in question_lower for keyword in self.contact_keywords)

    def format_contact_response(self, contact_info: Dict[str, List[str]], question: str) -> str:
        """Format contact information with better logic"""
        response_parts = []
        question_lower = question.lower()

        asking_for_email = any(word in question_lower for word in ['email', 'e-mail', 'mail'])
        asking_for_phone = any(word in question_lower for word in ['phone', 'call', 'ring', 'telephone', 'mobile'])

        if asking_for_email and contact_info['emails']:
            response_parts.append(f"📧 **Email**: {', '.join(contact_info['emails'])}")
        elif asking_for_phone and contact_info['phones']:
            response_parts.append(f"📞 **Phone**: {', '.join(contact_info['phones'])}")
        else:
            if contact_info['emails']:
                response_parts.append(f"📧 **Email**: {', '.join(contact_info['emails'])}")
            if contact_info['phones']:
                response_parts.append(f"📞 **Phone**: {', '.join(contact_info['phones'])}")
            if contact_info['addresses']:
                response_parts.append(f"📍 **Address**: {', '.join(contact_info['addresses'])}")

        if response_parts:
            return f"Here's the contact information I found:\n\n" + "\n\n".join(response_parts)
        else:
            if asking_for_email:
                return "I couldn't find any email addresses in the available content. Try asking for general contact information or check for a contact page."
            elif asking_for_phone:
                return "I couldn't find any phone numbers in the available content. Try asking for general contact information or check for a contact page."
            else:
                return "I couldn't find specific contact information in the available content. You might want to look for a contact page."


# Tenant-aware chatbot manager placeholder
chatbot_manager = None


async def require_service_secret(request: Request):
    """Ensure inter-service calls provide the configured shared secret."""
    if not ENFORCE_SERVICE_SECRET:
        return

    if not FASTAPI_SHARED_SECRET:
        return

    provided_secret = request.headers.get("x-service-secret")
    if not provided_secret:
        raise HTTPException(status_code=401, detail="Missing service authentication")

    if not hmac.compare_digest(provided_secret.strip(), FASTAPI_SHARED_SECRET.strip()):
        raise HTTPException(status_code=401, detail="Invalid service authentication")

# Pydantic models for API request/response
class QuestionRequest(BaseModel):
    query: str
    session_id: Optional[str] = "default"
    user_id: Optional[str] = None
    resource_id: Optional[str] = None
    database_uri: Optional[str] = None
    vector_store_path: Optional[str] = None

class AnswerResponse(BaseModel):
    answer: str
    session_id: str
    sources: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None

class HealthResponse(BaseModel):
    status: str
    chatbot_ready: bool
    message: str
    daily_requests_used: int

class ContactInfoResponse(BaseModel):
    emails: List[str]
    phones: List[str]
    addresses: List[str]
    formatted_response: str

class SemanticIntelligentRAG:
    def __init__(
        self,
        chroma_db_path: str,
        collection_name: str = "scraped_content",
        mongo_uri: Optional[str] = None,
        resource_id: Optional[str] = None
    ):
        # Validate and ensure vector store path exists
        if not chroma_db_path or not chroma_db_path.strip():
            raise ValueError("chroma_db_path (vector_store_path) is required and cannot be empty")
        
        resolved_path = os.path.abspath(chroma_db_path)
        os.makedirs(resolved_path, exist_ok=True)
        
        self.vector_store_path = resolved_path
        self.resource_id = resource_id
        
        # Structured logging for tenant initialization
        print(f"\n{'='*80}")
        print(f"🚀 Initializing RAG Bot for Tenant")
        print(f"{'='*80}")
        print(f"📌 Resource ID: {resource_id or 'NOT SET'}")
        print(f"📁 Vector Store Path: {resolved_path}")
        print(f"💾 Collection Name: {collection_name}")
        print(f"🔗 MongoDB URI: {mongo_uri[:50] + '...' if mongo_uri and len(mongo_uri) > 50 else mongo_uri or 'NOT SET'}")
        print(f"{'='*80}\n")

        # Initialize ChromaDB client for this tenant
        print(f"🔄 Creating ChromaDB PersistentClient at: {resolved_path}")
        self.chroma_client = chromadb.PersistentClient(path=resolved_path)
        self.name_collection_states = {}
        self.collection = self.chroma_client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        print(f"✅ ChromaDB collection '{collection_name}' loaded/created")

        # Get total documents count
        try:
            total_docs = self.collection.count()
            print(f"📊 Total documents in collection: {total_docs}")
            if total_docs == 0:
                print(f"⚠️  WARNING: Collection is empty! No data has been scraped yet.")
        except Exception as e:
            print(f"❌ Could not get document count: {e}")

        # Initialize embedding model
        print("🔄 Loading semantic embedding model...")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        print("✅ Semantic model loaded: all-MiniLM-L6-v2")

        # Initialize cross-encoder reranker
        print("🔄 Loading cross-encoder reranker...")
        self.reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        print("✅ Cross-encoder reranker loaded")

        # Initialize Contact Information Extractor
        print("🔄 Initializing contact information extractor...")
        self.contact_extractor = ContactInformationExtractor()
        print("✅ Contact information extractor loaded")

        # Configuration constants
        self.max_retrieval = 100
        self.max_passages = 10

        # Initialize Gemini API client
        print("🔄 Initializing Gemini API client...")
        try:
            api_key = os.getenv('GOOGLE_API_KEY')
            if not api_key:
                raise ValueError("GOOGLE_API_KEY not found in environment variables")
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
            print("✅ Gemini API client initialized successfully!")
        except Exception as e:
            print(f"❌ Error initializing Gemini API: {e}")
            raise

        # Usage tracking
        self.daily_requests = 0
        self.last_reset = datetime.date.today()

        # Conversation context memory
        self.conversation_contexts = {}

        # Step-by-step lead generation system
        self.lead_collection_states = {}

        # Track last sources surfaced per session for downstream clients
        self.last_sources_by_session = {}

        # Mongo configuration per tenant
        self.mongo_client = None
        self.leads_collection = None
        self.mongo_enabled = PYMONGO_AVAILABLE and MongoClient is not None

        if self.mongo_enabled:
            self.mongo_uri = mongo_uri or os.getenv("MONGODB_URI", "mongodb://localhost:27017")
            self.mongo_database_name = None

            try:
                if parse_uri:
                    parsed_uri = parse_uri(self.mongo_uri)
                    self.mongo_database_name = parsed_uri.get("database")
            except Exception as uri_err:
                print(f"⚠️ Unable to parse MongoDB URI for tenant {self.resource_id}: {uri_err}")

            if not self.mongo_database_name:
                self.mongo_database_name = os.getenv("MONGODB_DATABASE", "rag_chatbot")

            try:
                self.init_mongodb_connection()
                print("✅ MongoDB leads database initialized successfully!")
            except Exception as e:
                print(f"❌ MongoDB initialization failed: {e}")
                self.mongo_client = None
                self.leads_collection = None
        else:
            self.mongo_uri = None
            self.mongo_database_name = None
            print("ℹ️ pymongo not installed; lead storage features are disabled")
    def start_name_collection(self, session_id: str):
        """Start the name collection process for new sessions"""
        self.name_collection_states[session_id] = {
            'waiting_for_name': True,
            'name_collected': False,
            'started_at': datetime.datetime.now()
        }

    def process_name_collection(self, session_id: str, user_input: str) -> Tuple[bool, str]:
        if session_id not in self.name_collection_states:
            return False, "Name collection not initialized."

        name = user_input.strip()
        
        # Validate name using LeadValidator
        is_valid, error_message = LeadValidator.validate_name(name)
        if not is_valid:
            return False, f"❌ {error_message} Please provide a valid name."

        # Store name in session context
        if session_id not in self.conversation_contexts:
            self.conversation_contexts[session_id] = {}
        self.conversation_contexts[session_id]["username"] = name

        # IMMEDIATELY save name-only lead to MongoDB
        if self.leads_collection is not None:
            try:
                lead_document = {
                    "name": name,
                    "phone": "",  # Empty initially
                    "email": "",  # Empty initially
                    "original_question": "Name collection",
                    "session_id": session_id,
                    "created_at": datetime.datetime.utcnow(),
                    "source": "name_collection",
                    "status": "partial",
                    "last_contact": datetime.datetime.utcnow()
                }
                result = self.leads_collection.insert_one(lead_document)
                print(f"Name-only lead saved immediately with ID: {result.inserted_id}")
            except Exception as e:
                print(f"Error saving name-only lead: {e}")

        # Mark collection complete
        self.name_collection_states[session_id]["name_collected"] = True
        self.name_collection_states[session_id]["waiting_for_name"] = False

        return True, f"Hey there {name}! What would you like to know about?"


    def get_user_name(self, session_id: str) -> Optional[str]:
        """Get stored user name for session"""
        context = self.conversation_contexts.get(session_id, {})
        return context.get('username')

    def should_ask_for_name(self, session_id: str) -> bool:
        """Determine if we should ask for the user's name"""
        # Check if we already have a name for this session
        if self.conversation_contexts.get(session_id, {}).get("username"):
            return False

        # Check if we're already in name collection process
        if session_id in self.name_collection_states:
            if self.name_collection_states[session_id].get("name_collected"):
                return False
            if self.name_collection_states[session_id].get("waiting_for_name"):
                return False

        # Ask for name if this is a new session or early in conversation
        return True


    def reload_vector_store(self, collection_name: str = "scraped_content"):
        """
        NUCLEAR OPTION: Completely reload the vector store by forcing ChromaDB to re-read from disk.
        This is necessary because ChromaDB aggressively caches collection data in memory.
        """
        try:
            print(f" NUCLEAR RELOAD: Forcing ChromaDB to re-read from disk for resource: {self.resource_id}")
            
            # Step 1: Close old client completely
            try:
                if hasattr(self.chroma_client, 'close'):
                    self.chroma_client.close()
                    print("  ✓ Old ChromaDB client closed")
            except Exception as e:
                print(f"  ⚠️  Error closing old client: {e}")
            
            # Step 2: Force Python to release references
            self.chroma_client = None
            self.collection = None
            
            # Step 3: Small delay to ensure file handles are released
            import time
            time.sleep(0.2)
            
            # Step 4: Create completely fresh ChromaDB client (this forces re-reading from disk)
            print(f"  🔄 Creating fresh ChromaDB client from: {self.vector_store_path}")
            self.chroma_client = chromadb.PersistentClient(path=self.vector_store_path)
            
            # Step 5: Get the collection (this will read fresh data from disk)
            print(f"  🔄 Loading collection: {collection_name}")
            self.collection = self.chroma_client.get_or_create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            
            # Step 6: Verify the fresh document count
            doc_count = self.collection.count()
            print(f"✅ NUCLEAR RELOAD COMPLETE! Fresh document count: {doc_count}")
            
            return doc_count
        except Exception as e:
            print(f"❌ NUCLEAR RELOAD FAILED: {e}")
            import traceback
            traceback.print_exc()
            raise

    def init_mongodb_connection(self):
        """Initialize MongoDB connection and setup leads collection"""
        if not self.mongo_enabled or MongoClient is None:
            raise RuntimeError("MongoDB support unavailable; install pymongo to enable lead storage")

        mongo_uri = self.mongo_uri or os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        database_name = self.mongo_database_name or os.getenv("MONGODB_DATABASE", "rag_chatbot")

        try:
            print(f"🔄 Connecting to MongoDB at {mongo_uri} for tenant {self.resource_id}...")
            print(f"🎯 Target database: {database_name}")
            self.mongo_client = MongoClient(
                mongo_uri,
                maxPoolSize=50,
                minPoolSize=10,
                maxIdleTimeMS=45000,
                waitQueueTimeoutMS=5000,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=10000,
                socketTimeoutMS=20000,
                retryWrites=True,
                retryReads=True,
                connect=False
            )

            # Test connection
            self.mongo_client.admin.command('ping')
            print("✅ MongoDB connection successful!")
            print(f"📊 Pool config: maxPoolSize=50, minPoolSize=10")

            # Get database and collection
            self.mongo_db = self.mongo_client[database_name]
            self.mongo_database_name = database_name
            self.leads_collection = self.mongo_db['leads']

            # Drop old problematic indexes if they exist
            try:
                self.leads_collection.drop_index("chatbot_session_email_idx")
                print("✅ Dropped old session_email index")
            except Exception as e:
                print(f"ℹ️ No old index to drop: {e}")

            # Drop the unique email index to allow duplicate emails
            try:
                self.leads_collection.drop_index("email_1")
                print("✅ Dropped unique email_1 index - duplicate emails now allowed")
            except Exception as e:
                print(f"ℹ️ email_1 index not found or already dropped: {e}")

            # Create indexes for better performance with unique names for chatbot
            try:
                self.leads_collection.create_index([("session_id", 1)], unique=True, name="chatbot_session_idx")
                self.leads_collection.create_index("created_at", name="chatbot_created_at_idx")
            except Exception as index_error:
                print(f"⚠️ Index creation warning: {index_error}")
                # Continue anyway as indexes might already exist

            print(f"✅ MongoDB database '{database_name}' and 'leads' collection ready!")
            print(f"📊 Current leads count: {self.leads_collection.count_documents({})}")

        except ServerSelectionTimeoutError:
            print("❌ Could not connect to MongoDB server. Make sure MongoDB is running.")
            raise
        except Exception as e:
            print(f"❌ MongoDB setup error: {e}")
            print(f"🔍 MongoDB URI used: {mongo_uri}")
            print(f"🔍 Database name used: {database_name}")
            print(f"❌ MongoDB initialization failed: {e}")
            raise

    def close_mongodb_connection(self):
        """Properly close MongoDB connection pool"""
        if self.mongo_client is not None:
            try:
                self.mongo_client.close()
                print("✅ MongoDB connection pool closed successfully")
            except Exception as e:
                print(f"⚠️ Error closing MongoDB connection: {e}")

    def save_lead_to_database(self, leaddata: Dict):
        """Save lead data to MongoDB"""
        if not self.mongo_enabled or self.leads_collection is None:
            print("ℹ️ Lead storage skipped because MongoDB is not available")
            return

        print(f"🔍 DATABASE DEBUG - About to save leaddata: {leaddata}")

        try:
            # Prepare document for MongoDB
            lead_document = {
                "name": leaddata["name"],
                "phone": leaddata["phone"], 
                "email": leaddata["email"],
                "original_question": leaddata["original_question"],
                "session_id": leaddata.get("session_id"),
                "created_at": datetime.datetime.utcnow(),
                "source": "pricing_inquiry",
                "status": "new",
                "last_contact": datetime.datetime.utcnow()
            }

            # Insert the document
            result = self.leads_collection.insert_one(lead_document)
            print(f"✅ Lead saved to MongoDB with ID: {result.inserted_id}")

        except DuplicateKeyError:
            print(f"⚠️ Lead with email {leaddata['email']} already exists")
            # Update existing lead instead
            self.leads_collection.update_one(
                {"email": leaddata["email"]},
                {
                    "$set": {
                        "name": leaddata["name"],
                        "phone": leaddata["phone"],
                        "original_question": leaddata["original_question"],
                        "session_id": leaddata.get("session_id"),
                        "last_contact": datetime.datetime.utcnow(),
                        "status": "updated"
                    }
                }
            )
            print(f"✅ Existing lead updated for email: {leaddata['email']}")
        except Exception as e:
            print(f"❌ Error saving lead to MongoDB: {e}")

    def get_all_leads(self) -> List[Dict]:
        """Get all leads from MongoDB"""
        if not self.mongo_enabled or self.leads_collection is None:
            return []

        try:
            leads = list(self.leads_collection.find().sort("created_at", pymongo.DESCENDING))
            # Convert ObjectId to string for JSON serialization
            for lead in leads:
                lead['_id'] = str(lead['_id'])
            return leads
        except Exception as e:
            print(f"❌ Error fetching leads from MongoDB: {e}")
            return []

    def get_leads_count(self) -> int:
        """Get total count of leads in MongoDB"""
        if not self.mongo_enabled or self.leads_collection is None:
            return 0

        try:
            return self.leads_collection.count_documents({})
        except Exception as e:
            print(f"❌ Error getting leads count from MongoDB: {e}")
            return 0

    def process_lead_data_step_by_step(self, session_id: str, response: str) -> Tuple[bool, str]:
        """Process lead collection step by step with validation"""
        if session_id not in self.lead_collection_states:
            return False, "Lead collection not initialized for this session."

        state = self.lead_collection_states[session_id]
        current_step = state['current_step']

        if current_step == 'name':
            name = response.strip()
            # Validate name
            is_valid, error_message = LeadValidator.validate_name(name)
            if not is_valid:
                return False, f"❌ {error_message} Please try again."
            
            state['name'] = name
            state['current_step'] = 'phone'
            return False, "Great! Now, could you please provide your phone number?"

        elif current_step == 'phone':
            phone = response.strip()
            # Validate phone
            is_valid, error_message = LeadValidator.validate_phone(phone)
            if not is_valid:
                return False, f"❌ {error_message} Please try again."
            
            state['phone'] = phone
            state['current_step'] = 'email'
            return False, "Perfect! Finally, what's your email address?"

        elif current_step == "email":
            email = response.strip()
            # Validate email
            is_valid, error_message = LeadValidator.validate_email(email)
            if not is_valid:
                return False, f"❌ {error_message} Please try again."
            
            state["email"] = email
            try:
                # Try to update existing lead by session_id first
                if not self.mongo_enabled or self.leads_collection is None:
                    print("ℹ️ MongoDB unavailable; lead collection will be skipped")
                    del self.lead_collection_states[session_id]
                    if session_id not in self.conversation_contexts:
                        self.conversation_contexts[session_id] = {}
                    self.conversation_contexts[session_id]['lead_collected'] = True
                    return True, "Thank you! We'll follow up soon."

                existing_lead = self.leads_collection.find_one({"session_id": session_id})

                if existing_lead:
                    # Update existing record with phone and email
                    update_data = {
                        "$set": {
                            "phone": state["phone"],
                            "email": state["email"],
                            "original_question": state["original_question"],
                            "status": "complete",
                            "last_contact": datetime.datetime.utcnow()
                        }
                    }
                    self.leads_collection.update_one({"_id": existing_lead["_id"]}, update_data)
                    print(f"Lead updated for session {session_id}")
                else:
                    # Fallback: create new complete record
                    lead_document = {
                        "name": state["name"],
                        "phone": state["phone"],
                        "email": state["email"],
                        "original_question": state["original_question"],
                        "session_id": session_id,
                        "created_at": datetime.datetime.utcnow(),
                        "source": "pricing_inquiry",
                        "status": "complete",
                        "last_contact": datetime.datetime.utcnow()
                    }
                    result = self.leads_collection.insert_one(lead_document)
                    print(f"New complete lead saved with ID: {result.inserted_id}")

                # Set lead_collected flag to prevent re-triggering lead collection
                if session_id not in self.conversation_contexts:
                    self.conversation_contexts[session_id] = {}
                self.conversation_contexts[session_id]['lead_collected'] = True

                del self.lead_collection_states[session_id]
                return True, f"Thank you {state['name']}! Your information has been saved. We'll follow up soon regarding your pricing inquiry."
            except Exception as e:
                print(f"LEAD ERROR - Database save failed: {e}")
                # Set lead_collected flag even on error to prevent retrying
                if session_id not in self.conversation_contexts:
                    self.conversation_contexts[session_id] = {}
                self.conversation_contexts[session_id]['lead_collected'] = True
                return True, "Thank you! We'll follow up soon."


        return False, "Please try again."

    def get_conversation_context(self, session_id: str):
        context = self.conversation_contexts.get(session_id)
        if context:
            time_diff = datetime.datetime.now() - context['timestamp']
            if time_diff.total_seconds() < 600:
                return context
            del self.conversation_contexts[session_id]
        return None

    def store_conversation_context(self, session_id: str, question: str, docs: List[str], intent: str):
        self.conversation_contexts[session_id] = {
            "last_question": question,
            "last_docs": docs,
            "last_intent": intent,
            "timestamp": datetime.datetime.now()
        }

    def start_lead_collection(self, session_id: str, original_question: str):
        username = self.get_user_name(session_id)

        # Since name is already collected and saved, always start with phone
        self.lead_collection_states[session_id] = {
            "original_question": original_question,
            "current_step": "phone",  # Always start with phone now
            "name": username or "",
            "phone": "",
            "email": "",
            "started_at": datetime.datetime.now()
        }




    def get_lead_collection_request(self, session_id: str) -> str:
        if session_id in self.lead_collection_states:
            state = self.lead_collection_states[session_id]
            user_name = state.get('name', '')

            if state['current_step'] == 'phone':
                return f"I'd be happy to help with pricing{f', {user_name}' if user_name else ''}! Could you please provide your phone number?"
            elif state['current_step'] == 'email':
                return f"Perfect{f' {user_name}' if user_name else ''}! Finally, what's your email address?"
            else:
                return "I'd be happy to help with pricing! What's your name?"

        return "Error: Lead collection not initialized."


    def analyze_question_semantically(self, question: str) -> Dict:
        words = question.split()
        entity_mentions = [word for word in words if len(word) > 2 and word[0].isupper()]

        return {
            'intent': 'general_inquiry',
            'intent_confidence': 0.5,
            'key_concepts': question.split(),
            'question_embedding': self.embedding_model.encode(question),
            'original_question': question
        }

    def comprehensive_semantic_retrieval(self, question_analysis: Dict) -> Tuple[List[str], List[float]]:
        try:
            docs = []
            distances = []

            # Strategy 1: Primary embedding-based search
            results = self.collection.query(
                query_embeddings=[question_analysis['question_embedding'].tolist()],
                n_results=50
            )

            if results['documents'] and results['documents'][0]:
                docs.extend(results['documents'][0])
                distances.extend(results['distances'][0])

            # Strategy 2: Text-based search using individual words from the question
            question_words = [word.lower().strip() for word in question_analysis['original_question'].split() if len(word) > 2]

            for word in question_words:
                try:
                    word_results = self.collection.query(
                        query_texts=[word],
                        n_results=25
                    )
                    if word_results['documents'] and word_results['documents'][0]:
                        docs.extend(word_results['documents'][0])
                        distances.extend([0.7] * len(word_results['documents'][0]))
                except Exception as e:
                    print(f"Word search error for '{word}': {e}")
                    continue

            # Strategy 3: Context-aware expanded search
            original_question = question_analysis['original_question'].lower()
            expanded_searches = []

            # Dynamically generate related terms based on question content
            if any(word in original_question for word in ['founded', 'establish', 'start', 'began', 'create']):
                expanded_searches.extend(['founded', 'established', 'started', 'began', 'created', 'inception', 'formation'])

            if any(word in original_question for word in ['year', 'when', 'date', 'time']):
                # Search for common years in business contexts
                current_year = datetime.date.today().year
                year_range = list(range(current_year - 20, current_year + 1))
                expanded_searches.extend([str(year) for year in year_range])

            if any(word in original_question for word in ['company', 'business', 'organization']):
                expanded_searches.extend(['company', 'business', 'organization', 'corporation', 'firm'])

            if any(word in original_question for word in ['head', 'ceo', 'leader', 'manager', 'director']):
                expanded_searches.extend(['CEO', 'head', 'director', 'manager', 'leader', 'president', 'founder'])

            # Add the question's key concepts
            expanded_searches.extend(question_analysis['key_concepts'])

            # Search with expanded terms
            for term in expanded_searches:
                if len(str(term)) > 1:  # Skip very short terms
                    try:
                        term_results = self.collection.query(
                            query_texts=[str(term)],
                            n_results=20
                        )
                        if term_results['documents'] and term_results['documents'][0]:
                            docs.extend(term_results['documents'][0])
                            distances.extend([0.8] * len(term_results['documents'][0]))
                    except Exception as e:
                        print(f"Expanded search error for '{term}': {e}")
                        continue

            # Strategy 4: Fuzzy/partial matching with question variations
            question_variations = [
                question_analysis['original_question'],
                question_analysis['original_question'].replace('was', '').replace('is', '').strip(),
                ' '.join(question_words),  # Just the key words
            ]

            for variation in question_variations:
                if variation and len(variation) > 3:
                    try:
                        var_results = self.collection.query(
                            query_texts=[variation],
                            n_results=40
                        )
                        if var_results['documents'] and var_results['documents'][0]:
                            docs.extend(var_results['documents'][0])
                            distances.extend([0.9] * len(var_results['documents'][0]))
                    except Exception as e:
                        print(f"Variation search error for '{variation}': {e}")
                        continue

            # Remove duplicates while preserving order and combining distances
            unique_docs = []
            unique_distances = []
            seen = set()

            for doc, dist in zip(docs, distances):
                if doc and doc.strip() and doc not in seen:
                    unique_docs.append(doc)
                    unique_distances.append(dist)
                    seen.add(doc)

            print(f"🔍 Retrieved {len(unique_docs)} unique documents for: '{question_analysis['original_question']}'")

            return unique_docs[:80], unique_distances[:80]  # Return more documents for better coverage

        except Exception as e:
            print(f"❌ Error in comprehensive semantic retrieval: {e}")
            return [], []

    def smart_rerank_candidates(self, question: str, docs: List[str], topn: Optional[int] = None) -> List[str]:
        """Hybrid reranking: CrossEncoder semantic scoring + keyword match boosting"""
        if not docs:
            return []

        # Extract meaningful keywords from question (ignore short words)
        keywords = [word.lower() for word in question.split() if len(word) > 3]

        # Batch CrossEncoder predictions for all documents at once
        semantic_scores = self.reranker.predict([(question, doc) for doc in docs])

        # Score each document
        doc_scores = []
        for doc, semantic_score in zip(docs, semantic_scores):
            # Calculate keyword match bonus
            doc_lower = doc.lower()
            keyword_matches = sum(1 for keyword in keywords if keyword in doc_lower)
            keyword_bonus = keyword_matches * 0.3  # Boost score by 0.3 per matched keyword

            # Combine scores: semantic + keyword boost
            final_score = semantic_score + keyword_bonus
            doc_scores.append((doc, final_score))

        # Sort documents by combined score (highest first)
        doc_scores.sort(key=lambda x: x[1], reverse=True)

        # Return top K documents
        k = topn or self.max_passages
        return [doc for doc, score in doc_scores[:k]]

    def detect_pricing_inquiry(self, question: str, intent: str) -> bool:
        pricing_keywords = ['price', 'cost', 'pricing', 'quote', 'rates', 'how much']
        return any(keyword in question.lower() for keyword in pricing_keywords)

    def synthesize_comprehensive_answer(self, question_analysis: Dict, docs: List[str], is_follow_up: bool = False) -> str:
        # If no docs available, return early
        if not docs:
            return "I couldn't find relevant information to answer your question."

        try:
            # Use top 12 documents for better context
            combined_context = "\n".join(docs[:12])

            # Strong instruction: NEVER include URLs or source links unless the user explicitly
            # asked for page locations / links. When the user asks for links, only use URLs
            # present in the provided metadata and do NOT invent or hallucinate URLs.
            # When links are required, format each as:
            # Page title
            # https://page-url
            # Otherwise, do NOT include any source or URL information in your answer.

            prompt = f"""You are a helpful assistant that answers questions accurately using the provided context.

CONTEXT:
{combined_context}

INSTRUCTIONS:
1. Read ALL context passages carefully, even if formatting appears unclear.
2. Extract relevant information from the context to answer the question.
3. Combine information from multiple passages when needed to form complete answers.
4. Provide clear, factual answers in 2-3 sentences.
5. IMPORTANT: Do NOT include any source attributions, page titles, URLs, or links unless the user explicitly asked for page locations or links (for example: "where is this", "which page", "source", "link", "URL", "where did you get this", "about page", or similar).
6. If the user explicitly asked for links, ONLY provide links and titles that appear in the provided context metadata — DO NOT invent URLs or sources.
7. When providing links, format each entry exactly as:
   Page title
   https://page-url
8. If you were not explicitly asked for links, do NOT include any URLs, source lines, or link-like text in your reply.

QUESTION: {question_analysis['original_question']}

ANSWER (be concise and factual):"""

            # Use low temperature for consistency
            generation_config = genai.types.GenerationConfig(
                temperature=0.3,
                top_p=0.8,
                top_k=50
            )

            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )

            answer = response.text.strip() if response and response.text else "I found some information but couldn't generate a proper response."

            # Ensure we do not leak URLs when question did not explicitly request them.
            # Higher-level code calls this method without an explicit include_urls flag;
            # rely on the prompt and additionally strip any accidental URLs to be safe.
            try:
                q = question_analysis.get('original_question', '')
                if not self.is_location_query(q):
                    # Remove explicit URLs from the generated answer as a safety net
                    import re
                    cleaned = re.sub(r'https?://\S+', '', answer)
                    # Also remove obvious 'Source:' or 'Sources:' lines
                    cleaned = '\n'.join([ln for ln in cleaned.splitlines() if not ln.strip().lower().startswith(('source:', 'sources:'))])
                    cleaned = cleaned.strip()
                    if cleaned:
                        answer = cleaned
                    else:
                        # Fallback to original answer if cleaning removed too much
                        answer = answer
            except Exception:
                pass

            print(f"✅ Generated answer (length: {len(answer)} characters)")
            return answer

        except Exception as e:
            print(f"❌ Error in answer synthesis: {e}")
            return "I found relevant information but encountered an error while generating the response."



    def extract_contact_from_docs(self, docs: List[str]) -> Dict[str, List[str]]:
        """Extract contact information from retrieved documents with detailed logging"""
        all_contact_info = {'emails': [], 'phones': [], 'addresses': []}
        print(f"🔍 Analyzing {len(docs)} documents for contact information...")

        for i, doc in enumerate(docs):
            if doc and doc.strip():
                contact_info = self.contact_extractor.extract_all_contact_info(doc)
                if contact_info['emails'] or contact_info['phones']:
                    print(f"📄 Doc {i+1}: Found {len(contact_info['emails'])} emails, {len(contact_info['phones'])} phones")
                all_contact_info['emails'].extend(contact_info['emails'])
                all_contact_info['phones'].extend(contact_info['phones'])

        # Remove duplicates while preserving order
        all_contact_info['emails'] = list(dict.fromkeys(all_contact_info['emails']))
        all_contact_info['phones'] = list(dict.fromkeys(all_contact_info['phones']))
        print(f"📊 Total extracted: {len(all_contact_info['emails'])} unique emails, {len(all_contact_info['phones'])} unique phones")
        return all_contact_info

    def handle_contact_query(self, question: str, docs: List[str]) -> str:
        """Handle contact information queries with enhanced logic"""
        print(f"🔍 Processing contact query: '{question}'")
        contact_info = self.extract_contact_from_docs(docs)

        question_lower = question.lower()
        asking_for_email = any(word in question_lower for word in ['email', 'e-mail', 'mail'])
        asking_for_phone = any(word in question_lower for word in ['phone', 'call', 'ring', 'telephone', 'mobile'])

        print(f"📋 User asking for - Email: {asking_for_email}, Phone: {asking_for_phone}")
        print(f"📋 Available - Emails: {len(contact_info['emails'])}, Phones: {len(contact_info['phones'])}")

        if any(contact_info.values()):
            response = self.contact_extractor.format_contact_response(contact_info, question)
            print(f"✅ Returning contact info response: {response[:100]}...")
            return response

        print("🔄 No contact info in initial results, trying focused search...")
        contact_docs = self.search_for_contact_specific_content(question)
        if contact_docs:
            print(f"🔍 Found {len(contact_docs)} contact-specific documents")
            contact_info = self.extract_contact_from_docs(contact_docs)
            if any(contact_info.values()):
                response = self.contact_extractor.format_contact_response(contact_info, question)
                print(f"✅ Returning focused search result: {response[:100]}...")
                return response

        if asking_for_email:
            return "I couldn't find any email addresses in the available content. You might want to check the contact page or look for customer service information."
        elif asking_for_phone:
            return "I couldn't find any phone numbers in the available content. You might want to check the contact page or look for customer service information."
        else:
            return "I couldn't find specific contact information in the available content. You might want to look for a contact page or try asking about customer service, support, or office locations."

    def search_for_contact_specific_content(self, question: str) -> List[str]:
        """Search specifically for contact-related content with enhanced terms"""
        question_lower = question.lower()
        if 'email' in question_lower:
            contact_search_terms = [
                "email", "e-mail", "contact email", "email address", "send email",
                "contact us", "customer service", "support email"
            ]
        elif any(word in question_lower for word in ['phone', 'call', 'telephone', 'mobile']):
            contact_search_terms = [
                "phone", "telephone", "call", "mobile", "phone number", "contact number",
                "customer service", "support phone", "call us"
            ]
        else:
            contact_search_terms = [
                "contact information", "contact us", "customer service", "support",
                "phone number", "email address", "office location", "headquarters",
                "get in touch", "reach us", "customer care", "help desk", "contact details"
            ]

        print(f"🔍 Searching with terms: {contact_search_terms[:3]}...")
        contact_docs = []
        for term in contact_search_terms:
            try:
                results = self.collection.query(query_texts=[term], n_results=40)
                if results['documents'] and results['documents'][0]:
                    contact_docs.extend(results['documents'][0])
            except Exception as e:
                print(f"❌ Error searching for term '{term}': {e}")
                continue

        unique_docs = []
        seen = set()
        for doc in contact_docs:
            if doc and doc.strip() and doc not in seen:
                unique_docs.append(doc)
                seen.add(doc)

        print(f"📄 Found {len(unique_docs)} unique contact documents")
        return unique_docs[:25]

    def is_follow_up_question(self, question: str) -> bool:
        """Enhanced follow-up detection with better no handling"""
        question_lower = question.lower().strip()
        simple_responses = ["yes", "yeah", "yep", "sure", "ok", "okay"]
        if question_lower in simple_responses:
            return True
        negative_responses = ["no", "nope", "nah", "not really", "no thanks", "that's enough"]
        if question_lower in negative_responses:
            return "negative"
        continuation_patterns = ["tell me more", "more details", "elaborate", "go ahead", "continue"]
        has_continuation_pattern = any(pattern in question_lower for pattern in continuation_patterns)
        return has_continuation_pattern

    def _store_source_snippets(
        self,
        session_id: str,
        documents: List[str],
        limit: int = 5,
        max_length: int = 240
    ) -> None:
        snippets: List[str] = []
        for doc in documents:
            if len(snippets) >= limit:
                break
            if not doc:
                continue
            snippet = doc.strip()
            if len(snippet) > max_length:
                snippet = snippet[:max_length].rstrip() + "..."
            snippets.append(snippet)
        self.last_sources_by_session[session_id] = snippets

    def get_recent_sources(self, session_id: str, limit: int = 3) -> List[str]:
        stored = self.last_sources_by_session.get(session_id, [])
        return stored[:limit]

    def is_location_query(self, question: str) -> bool:
        """Return True if the user's question explicitly asks for page locations/links."""
        if not question or not isinstance(question, str):
            return False
        q = question.lower()
        triggers = [
            "where is this",
            "which page",
            "source",
            "link",
            "url",
            "where did you get this",
            "about page",
            "where can i find",
            "what page",
            "page located",
        ]
        for t in triggers:
            if t in q:
                return True
        # Also check for short explicit tokens
        words = q.split()
        for w in ["source", "link", "url"]:
            if w in words:
                return True
        return False

    def _format_links(self, metadatas: List[dict]) -> str:
        """Format a list of metadata dicts into 'Page title\nhttps://page-url' blocks.

        Uses metadata fields preferentially: 'page_title', 'title', 'domain'.
        Falls back to raw URL if no title is present.
        """
        if not metadatas:
            return ""
        seen = set()
        lines = []
        for md in metadatas:
            if not md or not isinstance(md, dict):
                continue
            url = md.get('url') or md.get('filePath') or md.get('webpage') or md.get('source')
            if not url:
                continue
            if url in seen:
                continue
            seen.add(url)
            title = md.get('page_title') or md.get('title') or md.get('page') or md.get('domain') or url
            title = title.strip() if isinstance(title, str) else str(title)
            lines.append(f"{title}\n{url}")
        return "\n\n".join(lines)

    def chat(self, question: str, session_id: str = "default") -> str:
        print(f"\n{'='*90}")
        print(f"CHAT: {question[:50]}... | Session: {session_id}")
        print(f"{'='*90}")

        # Clear previously stored sources for this session before processing a new question
        self.last_sources_by_session.pop(session_id, None)

        try:
            # Fast-path: If user explicitly asks for a page location/link, run a short,
            # deterministic URL-level rerank and return a single page (title + URL).
            if self.is_location_query(question):
                try:
                    print("🔍 Location query detected — running URL-level rerank (fast path)...")
                    # Query Chroma for up to 50 candidate chunks
                    try:
                        results_quick = self.collection.query(query_texts=[question], n_results=50)
                    except Exception:
                        qa = self.analyze_question_semantically(question)
                        results_quick = self.collection.query(query_embeddings=[qa['question_embedding'].tolist()], n_results=50)

                    docs = results_quick.get('documents', [[]])[0]
                    metadatas = results_quick.get('metadatas', [[]])[0]

                    # Group by URL and score each URL based on chunk content and URL patterns
                    url_scores = {}
                    for doc, md in zip(docs, metadatas):
                        if not md or not isinstance(md, dict):
                            continue
                        url = md.get('url') or md.get('filePath') or md.get('webpage') or md.get('source')
                        if not url:
                            continue
                        url = url.strip()
                        entry = url_scores.get(url)
                        if entry is None:
                            title = md.get('page_title') or md.get('title') or md.get('page') or md.get('domain') or url
                            entry = {'score': 0, 'title': title, 'url': url}
                            url_scores[url] = entry

                        # Prepare text to check for positive signals
                        check_text_parts = []
                        if isinstance(doc, str):
                            check_text_parts.append(doc.lower())
                        if md.get('page_title'):
                            check_text_parts.append(str(md.get('page_title')).lower())
                        if md.get('title'):
                            check_text_parts.append(str(md.get('title')).lower())
                        check_text = " ".join(check_text_parts)

                        # Positive signals
                        for term in ["about", "who we are", "company", "our story", "mission"]:
                            if term in check_text:
                                entry['score'] += 2

                        # Negative signals based on URL path
                        low_url = url.lower()
                        if '/blog' in low_url:
                            entry['score'] -= 5
                        if '/category' in low_url:
                            entry['score'] -= 5
                        if '/tag' in low_url:
                            entry['score'] -= 5

                    if url_scores:
                        # Deterministic selection: highest score, tie-breaker by URL string
                        best_url, best_entry = sorted(url_scores.items(), key=lambda kv: (-kv[1]['score'], kv[0]))[0]
                        formatted = f"{best_entry.get('title')}\n{best_entry.get('url')}"
                        print(f"✅ Location fast-path selected: {best_entry.get('url')} (score={best_entry.get('score')})")
                        return formatted
                    else:
                        print("⚠️ Location fast-path found no URL candidates; falling back to normal flow")
                except Exception as e:
                    print(f"⚠️ Location rerank failed: {e}; falling back to normal flow")

            # ============================================================================
            # PRIORITY 1: Name collection (separate flow)
            # ============================================================================
            if session_id in self.name_collection_states:
                if self.name_collection_states[session_id].get("waiting_for_name"):
                    success, response = self.process_name_collection(session_id, question)
                    return response

            # ============================================================================
            # PRIORITY 2: Lead collection HARD GATE - Must happen BEFORE everything else
            # ============================================================================
            if session_id in self.lead_collection_states:
                is_complete, response = self.process_lead_data_step_by_step(session_id, question)
                return response

            # ============================================================================
            # PRIORITY 3: Normal flow - contact extraction, pricing detection, RAG
            # ============================================================================

            # Extract contact info from question
            print("🔍 DEBUG - Extracting contact info...")
            contact_info = self.contact_extractor.extract_contact_info(question)
            print(f"🔍 DEBUG - Contact info extracted: {contact_info}")

            if contact_info['has_contact']:
                # Check if we have a phone number
                if contact_info['phones']:
                    phone = contact_info['phones'][0]
                    
                    # VALIDATE phone using LeadValidator
                    is_valid, error_message = LeadValidator.validate_phone(phone)
                    if not is_valid:
                        return f"❌ {error_message} Please try again."
                    
                    # Get original pricing question
                    original_pricing_q = self.conversation_contexts.get(session_id, {}).get('original_pricing_question', question)

                    # Update existing partial lead instead of creating new one
                    if self.leads_collection is not None:
                        try:
                            result = self.leads_collection.update_one(
                                {"session_id": session_id, "status": "partial"},
                                {"$set": {
                                    "phone": phone,
                                    "original_question": original_pricing_q,
                                    "status": "phone_collected",
                                    "last_contact": datetime.datetime.utcnow()
                                }}
                            )
                            print(f"Phone update result: {result.modified_count} documents modified")
                        except Exception as e:
                            print(f"Error updating lead with phone: {e}")

                    # Store phone in session for future updates
                    if session_id not in self.conversation_contexts:
                        self.conversation_contexts[session_id] = {}
                    self.conversation_contexts[session_id]["phone"] = phone
                    return "Great! I've saved your phone number. Could you please provide your email address?"

                # Check if we have an email
                elif contact_info['emails']:
                    email = contact_info['emails'][0]
                    
                    # VALIDATE email using LeadValidator
                    is_valid, error_message = LeadValidator.validate_email(email)
                    if not is_valid:
                        return f"❌ {error_message} Please try again."
                    
                    # Get original pricing question
                    original_pricing_q = self.conversation_contexts.get(session_id, {}).get('original_pricing_question', question)

                    # Update existing lead with email instead of creating new one
                    if self.leads_collection is not None:
                        try:
                            result = self.leads_collection.update_one(
                                {"session_id": session_id},
                                {"$set": {
                                    "email": email,
                                    "original_question": original_pricing_q,
                                    "status": "complete",
                                    "last_contact": datetime.datetime.utcnow()
                                }}
                            )
                            print(f"Email update result: {result.modified_count} documents modified")
                        except Exception as e:
                            print(f"Error updating lead with email: {e}")

                    # Set lead_collected flag immediately after email is saved
                    self.conversation_contexts[session_id]['lead_collected'] = True
                    # Store email in session
                    self.conversation_contexts[session_id]["email"] = email
                    return "Perfect! I've saved your email address. We will contact you soon regarding your queries"

            # Check if we should ask for name
            if not self.conversation_contexts.get(session_id, {}).get("username"):
                if self.should_ask_for_name(session_id):
                    self.name_collection_states[session_id] = {
                        "waiting_for_name": True,
                        "name_collected": False,
                        "question_count": 0
                    }
                    return "Before we continue, may I have your name please?"

            # Analyze question semantically ONCE and reuse throughout
            print("🔍 DEBUG - Analyzing question semantically...")
            question_analysis = self.analyze_question_semantically(question)
            print(f"🔍 DEBUG - Question analysis completed")

            # Check for pricing inquiry and start lead collection if needed
            if self.detect_pricing_inquiry(question, question_analysis.get('intent', '')):
                # Store the original pricing question
                if 'original_pricing_question' not in self.conversation_contexts.get(session_id, {}):
                    if session_id not in self.conversation_contexts:
                        self.conversation_contexts[session_id] = {}
                    self.conversation_contexts[session_id]['original_pricing_question'] = question
                
                # Check if lead is already collected for this session
                if self.conversation_contexts.get(session_id, {}).get('lead_collected', False):
                    print("🔍 DEBUG - Lead already collected for this session, proceeding with normal RAG response")
                    # Skip lead collection, continue to multi-pass retrieval section
                    pass
                else:
                    # Start new lead collection for pricing inquiry
                    self.start_lead_collection(session_id, question)
                    return self.get_lead_collection_request(session_id)

            # ============================================================================
            # IMPROVED RETRIEVAL: Multi-pass aggregation for consistency
            # ============================================================================

            # Normalize query by removing trailing punctuation for better retrieval
            normalized_query = question_analysis['original_question'].rstrip('?.!,;')

            all_docs = []
            seen_docs = set()

            # Pass 1: Primary semantic search with embeddings
            print("🔍 Pass 1: Semantic embedding search...")
            docs1, dist1 = self.comprehensive_semantic_retrieval(question_analysis)
            for doc in docs1[:50]:
                if doc not in seen_docs:
                    all_docs.append(doc)
                    seen_docs.add(doc)

            # Pass 2: Direct text query (different retrieval path)
            print("🔍 Pass 2: Direct text query...")
            try:
                results2 = self.collection.query(
                    query_texts=[normalized_query],
                    n_results=50
                )
                if results2['documents'] and results2['documents'][0]:
                    for doc in results2['documents'][0]:
                        if doc not in seen_docs:
                            all_docs.append(doc)
                            seen_docs.add(doc)
            except Exception as e:
                print(f"⚠️ Pass 2 failed: {e}")

            # Pass 3: Entity-based search
            print("🔍 Pass 3: Entity-based search...")
            entities = question_analysis.get('entity_mentions', [])
            if entities:
                entity_query = ' '.join(entities[:5])
                try:
                    results3 = self.collection.query(
                        query_texts=[entity_query],
                        n_results=30
                    )
                    if results3['documents'] and results3['documents'][0]:
                        for doc in results3['documents'][0]:
                            if doc not in seen_docs:
                                all_docs.append(doc)
                                seen_docs.add(doc)
                except Exception as e:
                    print(f"⚠️ Pass 3 failed: {e}")

            print(f"✅ Retrieved {len(all_docs)} unique documents from all passes")

            # Rerank the aggregated results
            print("🎯 Reranking aggregated documents...")
            reranked_docs = self.smart_rerank_candidates(normalized_query, all_docs, topn=40) 
            
            # Backend-only RAG observability: log top chunks sent to LLM
            print(f"\n{'='*80}")
            print(f"RAG RETRIEVAL — TOP CHUNKS USED FOR ANSWER")
            print(f"{'='*80}")
            for i, doc in enumerate(reranked_docs[:2]):  # Only top 1-2 chunks
                chunk_preview = doc[:400].replace('\n', ' ').replace('\r', '')
                print(f"Chunk {i+1}: {len(doc)} chars | {chunk_preview}...")
            print(f"{'='*80}\n")

            # Generate answer with improved configuration
            print("🔍 DEBUG - Synthesizing comprehensive answer...")
            answer = self.synthesize_comprehensive_answer(
                question_analysis,
                reranked_docs,
                is_follow_up=False
            )
            print(f"🔍 DEBUG - Answer generated successfully")

            # Store source snippets for downstream consumers
            self._store_source_snippets(session_id, reranked_docs)

            # Track conversation
            if session_id not in self.conversation_contexts:
                self.conversation_contexts[session_id] = {}

            self.conversation_contexts[session_id]["last_question"] = question
            self.conversation_contexts[session_id]["last_answer"] = answer

            if session_id in self.name_collection_states:
                self.name_collection_states[session_id]["question_count"] = \
                    self.name_collection_states[session_id].get("question_count", 0) + 1

            print(f"COMPREHENSIVE RESPONSE: {answer[:60]}...")
            print(f"{'='*90}\n")

            return answer

        except Exception as e:
            print(f"❌ ERROR in chat method: {str(e)}")
            print(f"❌ ERROR type: {type(e).__name__}")
            import traceback
            print(f"❌ Full traceback:")
            traceback.print_exc()
            return f"I apologize, but I encountered an error while processing your question: {str(e)}"


class TenantChatbotManager:
    def __init__(self, collection_name: str = "scraped_content"):
        self.collection_name = collection_name
        self._instances: Dict[str, SemanticIntelligentRAG] = {}
        self._last_reload: Dict[str, datetime.datetime] = {}  # Track last reload time
        self._needs_reload: Dict[str, bool] = {}  # "Dirty flag" - marks when data updated
        self._lock = asyncio.Lock()

    @staticmethod
    def _prepare_vector_store_path(vector_store_path: str) -> str:
        resolved = os.path.abspath(vector_store_path)
        os.makedirs(resolved, exist_ok=True)
        return resolved

    async def get_chatbot(
        self,
        *,
        vector_store_path: Optional[str],
        database_uri: Optional[str],
        resource_id: Optional[str],
        force_reload: bool = False
    ) -> SemanticIntelligentRAG:
        # CRITICAL: Validate all required tenant context parameters
        if not vector_store_path or not vector_store_path.strip():
            raise ValueError(
                "vector_store_path is required for tenant isolation and cannot be empty"
            )
        
        if not database_uri or not database_uri.strip():
            raise ValueError(
                "database_uri is required for tenant isolation and cannot be empty"
            )
        
        if not resource_id or not resource_id.strip():
            raise ValueError(
                "resource_id is required to identify the tenant and cannot be empty"
            )
        
        # Use validated tenant context
        tenant_ctx = get_tenant_context(
            resource_id=resource_id,
            database_uri=database_uri,
            vector_store_path=vector_store_path
        )
        
        resolved_path = tenant_ctx["vector_store_path"]
        resolved_db_uri = tenant_ctx["database_uri"]
        resolved_resource_id = tenant_ctx["resource_id"]
        
        cache_key = f"{resolved_path}::{resolved_db_uri}"
        
        print(f"\\n{'='*80}")
        print(f"📦 TenantChatbotManager: get_chatbot()")
        print(f"{'='*80}")
        print(f"🔑 Cache Key: {cache_key[:100]}...")
        print(f"🔄 Force Reload: {force_reload}")
        print(f"{'='*80}\\n")

        # If force_reload is True, COMPLETELY DESTROY the old instance
        if force_reload:
            async with self._lock:
                if cache_key in self._instances:
                    print(f" Force destroying chatbot instance for {resource_id or resolved_path}")
                    old_instance = self._instances[cache_key]
                    
                    # Close MongoDB
                    if old_instance.mongo_client:
                        old_instance.close_mongodb_connection()
                    
                    # Close ChromaDB properly
                    try:
                        if hasattr(old_instance.chroma_client, 'close'):
                            old_instance.chroma_client.close()
                        old_instance.chroma_client = None
                        old_instance.collection = None
                    except Exception as e:
                        print(f"⚠️  Error closing ChromaDB: {e}")
                    
                    # Remove from cache
                    del self._instances[cache_key]
                    if cache_key in self._last_reload:
                        del self._last_reload[cache_key]
                    
                    print(f"✅ Old instance completely destroyed")

        instance = self._instances.get(cache_key)
        if instance and not force_reload:
            # Check if this tenant's data was recently updated (dirty flag)
            needs_reload = self._needs_reload.get(cache_key, False)
            
            print(f"🔍 Checking dirty flag for {cache_key}")
            print(f"   Instance exists: {instance is not None}")
            print(f"   Needs reload: {needs_reload}")
            print(f"   All dirty flags: {self._needs_reload}")
            
            if needs_reload:
                # Data was updated! Force nuclear reload immediately
                print(f"🔥🔥🔥 DATA UPDATE DETECTED! Auto-reloading for {resource_id or resolved_path}")
                try:
                    doc_count = instance.reload_vector_store(self.collection_name)
                    self._last_reload[cache_key] = datetime.datetime.now()
                    self._needs_reload[cache_key] = False  # Clear dirty flag
                    print(f"✅✅✅ AUTO-RELOAD COMPLETE! Documents: {doc_count}")
                except Exception as e:
                    print(f"⚠️  Failed to auto-reload: {e}")
            else:
                print(f"ℹ️  No reload needed - dirty flag not set")
            
            return instance

        async with self._lock:
            # Double check after acquiring lock
            instance = self._instances.get(cache_key)
            if instance and not force_reload:
                return instance

            # Create completely fresh instance
            print(f"🆕 Creating BRAND NEW chatbot instance for {resolved_resource_id}")
            bot_instance = SemanticIntelligentRAG(
                chroma_db_path=resolved_path,
                collection_name=self.collection_name,
                mongo_uri=resolved_db_uri,
                resource_id=resolved_resource_id
            )
            
            doc_count = bot_instance.collection.count()
            print(f"✅ Fresh bot instance initialized with {doc_count} documents")
            
            self._instances[cache_key] = bot_instance
            self._last_reload[cache_key] = datetime.datetime.now()
            return bot_instance

    async def invalidate_tenant(
        self,
        *,
        vector_store_path: str,
        database_uri: Optional[str] = None,
        resource_id: Optional[str] = None
    ) -> bool:
        """Completely destroy cached chatbot instance for a tenant to force clean reload on next request"""
        resolved_path = self._prepare_vector_store_path(vector_store_path)
        resolved_db_uri = database_uri or os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        cache_key = f"{resolved_path}::{resolved_db_uri}"

        async with self._lock:
            if cache_key in self._instances:
                print(f" DESTROYING cached chatbot instance: {cache_key}")
                instance = self._instances[cache_key]
                
                # Close MongoDB connection
                if instance.mongo_client:
                    instance.close_mongodb_connection()
                
                # Close ChromaDB client properly
                try:
                    if hasattr(instance.chroma_client, 'close'):
                        instance.chroma_client.close()
                    # Force cleanup
                    instance.chroma_client = None
                    instance.collection = None
                except Exception as e:
                    print(f"⚠️  Error closing ChromaDB client: {e}")
                
                # Remove from cache completely
                del self._instances[cache_key]
                
                # Also clear reload tracking
                if cache_key in self._last_reload:
                    del self._last_reload[cache_key]
                if cache_key in self._needs_reload:
                    del self._needs_reload[cache_key]
                
                print(f"✅ Chatbot instance completely destroyed and removed from cache")
                return True
            else:
                print(f"ℹ️  No cached instance found for {cache_key}")
                # Even if not cached, set dirty flag for when it gets created
                self._needs_reload[cache_key] = True
                print(f"🚩 Set dirty flag for {cache_key} - will reload on next request")
                return False

    async def close_all(self):
        async with self._lock:
            for instance in self._instances.values():
                if instance.mongo_client:
                    instance.close_mongodb_connection()
            self._instances.clear()


async def get_tenant_chatbot_or_error(
    *,
    vector_store_path: Optional[str],
    database_uri: Optional[str],
    resource_id: Optional[str],
    user_id: Optional[str] = None
) -> SemanticIntelligentRAG:
    global chatbot_manager

    if chatbot_manager is None:
        raise HTTPException(status_code=503, detail="Chat manager not initialized")

    # CRITICAL: No fallbacks - require explicit tenant context
    if not vector_store_path or not vector_store_path.strip():
        raise HTTPException(
            status_code=400,
            detail="vector_store_path is required. Tenant context must be provided explicitly."
        )

    if not database_uri or not database_uri.strip():
        raise HTTPException(
            status_code=400,
            detail="database_uri is required. Tenant context must be provided explicitly."
        )
    
    if not resource_id and not user_id:
        raise HTTPException(
            status_code=400,
            detail="resource_id or user_id is required to identify the tenant."
        )
    
    resolved_vector_path = vector_store_path.strip()
    resolved_database_uri = database_uri.strip()
    tenant_identifier = resource_id or user_id

    try:
        return await chatbot_manager.get_chatbot(
            vector_store_path=resolved_vector_path,
            database_uri=resolved_database_uri,
            resource_id=tenant_identifier
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load tenant chatbot: {exc}") from exc


@asynccontextmanager
async def lifespan(app: FastAPI):
    global chatbot_manager
    print("🚀 Initializing tenant chatbot manager...")
    chatbot_manager = TenantChatbotManager()
    app.state.tenant_manager = chatbot_manager

    if not ENFORCE_SERVICE_SECRET:
        if FASTAPI_SHARED_SECRET:
            print("⚠️  FASTAPI_SHARED_SECRET is using a placeholder value; requests are not being authenticated.")
        else:
            print("⚠️  FASTAPI_SHARED_SECRET is not set; configure it for secure inter-service communication.")
    else:
        print("🔐 Service-to-service authentication enforced for bot endpoints.")

    yield

    print("🛑 Shutting down...")
    if chatbot_manager:
        await chatbot_manager.close_all()
        chatbot_manager = None

app = FastAPI(
    title="RAG Chatbot with MongoDB Contact Extraction",
    description="RAG chatbot with MongoDB lead storage and contact information extraction",
    version="18.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "🔮 RAG Chatbot with MongoDB Contact Extraction", "status": "Ready!"}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    is_ready = chatbot_manager is not None
    return HealthResponse(
        status="healthy" if is_ready else "unhealthy",
        chatbot_ready=is_ready,
        message="RAG ready" if is_ready else "Failed",
        daily_requests_used=0
    )

async def _handle_chat_request(request: QuestionRequest) -> AnswerResponse:
    print(f"🔍 DEBUG - Received session_id: '{request.session_id}'")
    print(f"🔍 DEBUG - Query: '{request.query}'")
    query_text = (request.query or "").strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Query text is required")

    incoming_session = (request.session_id or "").strip()
    if not incoming_session or incoming_session.lower() == "default":
        base_identifier = request.resource_id or request.user_id or "session"
        sanitized_base = re.sub(r"[^a-zA-Z0-9_-]", "", base_identifier) or "session"
        session_identifier = f"{sanitized_base}_{uuid.uuid4().hex[:8]}"
    else:
        session_identifier = incoming_session

    chatbot_instance = await get_tenant_chatbot_or_error(
        vector_store_path=request.vector_store_path,
        database_uri=request.database_uri,
        resource_id=request.resource_id,
        user_id=request.user_id
    )
    try:
        answer = chatbot_instance.chat(query_text, session_identifier)

        # Intentionally do not return source snippets in the API response.
        # The assistant should only return the main answer block.
        metadata = {}
        if request.resource_id:
            metadata["resource_id"] = request.resource_id
        if request.user_id:
            metadata["user_id"] = request.user_id

        return AnswerResponse(
            answer=answer,
            session_id=session_identifier,
            metadata=metadata or None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.post("/chat", response_model=AnswerResponse, dependencies=[Depends(require_service_secret)])
async def chat_endpoint(request: QuestionRequest):
    return await _handle_chat_request(request)


@app.post("/api/bots/{resource_id}/chat", response_model=AnswerResponse, dependencies=[Depends(require_service_secret)])
async def chat_endpoint_with_resource(resource_id: str, request: QuestionRequest):
    if not request.resource_id:
        request.resource_id = resource_id
    return await _handle_chat_request(request)

@app.get("/contact-info", response_model=ContactInfoResponse, dependencies=[Depends(require_service_secret)])
async def get_contact_info(
    resource_id: Optional[str] = Query(None),
    vector_store_path: Optional[str] = Query(None),
    database_uri: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    chatbot_instance = await get_tenant_chatbot_or_error(
        vector_store_path=vector_store_path,
        database_uri=database_uri,
        resource_id=resource_id,
        user_id=user_id
    )
    try:
        contact_docs = chatbot_instance.search_for_contact_specific_content("contact information")
        contact_info = chatbot_instance.extract_contact_from_docs(contact_docs)
        formatted_response = chatbot_instance.contact_extractor.format_contact_response(contact_info, "contact information")
        return ContactInfoResponse(
            emails=contact_info['emails'],
            phones=contact_info['phones'],
            addresses=contact_info['addresses'],
            formatted_response=formatted_response
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/leads", dependencies=[Depends(require_service_secret)])
async def get_all_leads(
    resource_id: Optional[str] = Query(None),
    vector_store_path: Optional[str] = Query(None),
    database_uri: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    """Get all leads from MongoDB"""
    chatbot_instance = await get_tenant_chatbot_or_error(
        vector_store_path=vector_store_path,
        database_uri=database_uri,
        resource_id=resource_id,
        user_id=user_id
    )
    try:
        leads = chatbot_instance.get_all_leads()
        return {"leads": leads, "count": len(leads)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/leads/count", dependencies=[Depends(require_service_secret)])
async def get_leads_count(
    resource_id: Optional[str] = Query(None),
    vector_store_path: Optional[str] = Query(None),
    database_uri: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    """Get total leads count from MongoDB"""
    chatbot_instance = await get_tenant_chatbot_or_error(
        vector_store_path=vector_store_path,
        database_uri=database_uri,
        resource_id=resource_id,
        user_id=user_id
    )
    try:
        count = chatbot_instance.get_leads_count()
        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.post("/refresh-cache", dependencies=[Depends(require_service_secret)])
async def refresh_cache(
    resource_id: Optional[str] = Query(None),
    vector_store_path: Optional[str] = Query(None),
    database_uri: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    force: bool = Query(True, description="Force complete destruction and recreation of chatbot instance")
):
    """
    Refresh the vector store cache for a tenant after scraping/updating data.
    Call this endpoint after adding new documents to ensure the bot uses updated data.
    
    ALWAYS destroys and recreates the entire bot instance to ensure fresh ChromaDB data.
    """
    global chatbot_manager
    
    if not chatbot_manager:
        raise HTTPException(status_code=503, detail="Chat manager not initialized")
    
    resolved_vector_path = vector_store_path or os.getenv("DEFAULT_VECTOR_BASE_PATH")
    if not resolved_vector_path:
        raise HTTPException(status_code=400, detail="vector_store_path is required")
    
    resolved_database_uri = database_uri or os.getenv("MONGODB_URI")
    
    try:
        # ALWAYS force complete destruction and recreation of bot instance
        print(f"🔥 DESTROYING chatbot instance for {resource_id or user_id} to force fresh ChromaDB load")
        
        success = await chatbot_manager.invalidate_tenant(
            vector_store_path=resolved_vector_path,
            database_uri=resolved_database_uri,
            resource_id=resource_id or user_id
        )
        
        # Small delay to ensure cleanup completes
        await asyncio.sleep(0.5)
        
        # Now create a completely fresh instance with force_reload=True
        print(f"🆕 Creating FRESH chatbot instance for {resource_id or user_id}")
        chatbot_instance = await chatbot_manager.get_chatbot(
            vector_store_path=resolved_vector_path,
            database_uri=resolved_database_uri,
            resource_id=resource_id or user_id,
            force_reload=True
        )
        
        doc_count = chatbot_instance.collection.count()
        print(f"✅ Fresh bot instance created with {doc_count} documents")
        
        return {
            "status": "success",
            "message": "Chatbot instance completely destroyed and recreated with fresh ChromaDB data",
            "resource_id": resource_id or user_id,
            "document_count": doc_count,
            "destroyed": success
        }
    except Exception as e:
        print(f"❌ Failed to refresh cache: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh cache: {str(e)}")


@app.post("/reload_vectors", dependencies=[Depends(require_service_secret)])
async def reload_vectors(
    background_tasks: BackgroundTasks,
    resource_id: Optional[str] = Query(None),
    vector_store_path: Optional[str] = Query(None),
    database_uri: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    """
    BOT RESTART endpoint: Triggers a clean shutdown to reload all vector stores from disk.
    
    This endpoint initiates a graceful shutdown of the bot process. The run_bot_with_autorestart.py
    wrapper will automatically restart the bot, which will load fresh vector stores from disk.
    
    - Call this after a scrape/update completes to ensure all data is reloaded cleanly
    - Provides a clean restart rather than hot-reloading in-memory data
    - The autorestart wrapper ensures the bot comes back up automatically
    - Returns success immediately, then shuts down after 0.5 seconds
    
    Use this to restart the bot process after scraping!
    """
    tenant_identifier = resource_id or user_id
    
    print(f"🔄 BOT RESTART requested for {tenant_identifier}")
    print(f"   Scheduling clean shutdown in 0.5 seconds...")
    print(f"   Bot will automatically restart via run_bot_with_autorestart.py")
    
    async def delayed_shutdown():
        """Wait briefly to allow response to send, then exit cleanly."""
        await asyncio.sleep(0.5)
        print("🔄 Initiating restart...")
        print("✅ Exiting with code 0 - autorestart wrapper will restart the bot")
        os._exit(0)
    
    # Schedule the shutdown in the background
    background_tasks.add_task(delayed_shutdown)
    
    return {
        "success": True,
        "message": "Bot restart initiated - will reload all vector stores from disk",
        "resource_id": tenant_identifier,
        "action_taken": "restart_scheduled",
        "note": "Bot will restart automatically and load fresh data"
    }


@app.post("/mark-data-updated", dependencies=[Depends(require_service_secret)])
async def mark_data_updated(
    resource_id: Optional[str] = Query(None),
    vector_store_path: Optional[str] = Query(None),
    database_uri: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    """
    LIGHTWEIGHT endpoint: Just marks data as updated without destroying the bot instance.
    Next chat request will auto-reload the vector store.
    
    This is MUCH faster than /refresh-cache and doesn't interrupt ongoing conversations.
    Use this after scraping/updating to ensure the NEXT request picks up new data.
    
    NOTE: For immediate reload, use /reload_vectors instead!
    """
    global chatbot_manager
    
    if not chatbot_manager:
        raise HTTPException(status_code=503, detail="Chat manager not initialized")
    
    resolved_vector_path = vector_store_path or os.getenv("DEFAULT_VECTOR_BASE_PATH")
    if not resolved_vector_path:
        raise HTTPException(status_code=400, detail="vector_store_path is required")
    
    resolved_database_uri = database_uri or os.getenv("MONGODB_URI")
    
    try:
        resolved_path = chatbot_manager._prepare_vector_store_path(resolved_vector_path)
        cache_key = f"{resolved_path}::{resolved_database_uri}"
        
        # Set dirty flag
        chatbot_manager._needs_reload[cache_key] = True
        
        print(f"🚩 DIRTY FLAG SET for {resource_id or user_id}")
        print(f"   Next chat request will auto-reload vector store")
        
        return {
            "status": "success",
            "message": "Data marked as updated. Next chat request will auto-reload.",
            "resource_id": resource_id or user_id,
            "cache_key": cache_key
        }
    except Exception as e:
        print(f"❌ Failed to mark data updated: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to mark data updated: {str(e)}")

# =========================================================================
# HARD RESTART ENDPOINT - ADDED FIX FOR CACHING ISSUES
# =========================================================================
@app.post("/system/restart", dependencies=[Depends(require_service_secret)])
async def system_restart(background_tasks: BackgroundTasks):
    """
    NUCLEAR OPTION: Hard restart the bot worker process.
    This terminates the process with exit code 1.
    Gunicorn/Systemd will automatically respawn a fresh worker.
    This is the only 100% reliable way to clear ChromaDB file locks/caches.
    """
    def kill_process():
        import time
        import os
        print(f"💀 HARD RESTART TRIGGERED: Terminating worker process {os.getpid()}...")
        time.sleep(1)  # Give time for the response to leave
        os._exit(1)    # Force immediate exit

    # Schedule the kill to happen after the response is sent
    background_tasks.add_task(kill_process)
    
    return {
        "status": "restarting", 
        "message": "Bot worker terminating in 1s to force data reload",
        "pid": os.getpid()
    }

if __name__ == "__main__":
    import sys
    
    print("\n" + "="*90)
    print("🚀 STARTING RAG CHATBOT - WITH MONGODB LEAD STORAGE")
    print("="*90)
    print("🔧 MONGODB FEATURES:")
    print("  ✅ MongoDB lead storage instead of SQLite")
    print("  ✅ Automatic duplicate email handling")
    print("  ✅ Indexed collections for better performance")
    print("  ✅ UTC timestamps for all records")
    print("  ✅ Enhanced lead management endpoints")
    print("="*90)
    
    # Detect environment mode
    env_mode = os.getenv("NODE_ENV", "development").lower()
    port = int(os.getenv("FASTAPI_PORT", "8000"))
    
    # Check if running with auto-restart wrapper (disables uvicorn reload to allow proper restart)
    auto_restart_mode = os.getenv("BOT_AUTO_RESTART", "").lower() in ("1", "true", "yes")
    
    if env_mode == "production" or auto_restart_mode:
        mode_label = "PRODUCTION" if env_mode == "production" else "AUTO-RESTART"
        print(f"🌐 RUNNING IN {mode_label} MODE")
        print(f"  - Host: 0.0.0.0")
        print(f"  - Port: {port}")
        print(f"  - Auto-reload: DISABLED (restarts handled externally)")
        if env_mode == "production":
            print(f"  - Recommended: Use Gunicorn - gunicorn app_20:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:{port}")
        print("="*90)
        uvicorn.run("app_20:app", host="0.0.0.0", port=port, reload=False, log_level="info")
    else:
        print("🔧 RUNNING IN DEVELOPMENT MODE")
        print(f"  - Host: 0.0.0.0")
        print(f"  - Port: {port}")
        print(f"  - Auto-reload: ENABLED")
        print("="*90)
        uvicorn.run("app_20:app", host="0.0.0.0", port=port, reload=True)