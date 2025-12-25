# updater_tracking_pipeline.py
# Custom Scrapy Pipeline for MongoDB url_tracking updates
# This pipeline runs AFTER ChromaDBPipeline to update MongoDB with content hashes

import scrapy
import hashlib
import logging
from datetime import datetime
from pymongo import MongoClient
from scrapy.exceptions import DropItem

# Import configuration
try:
    from config import (
        MONGO_URI, 
        MONGO_DATABASE, 
        MONGO_COLLECTION_URL_TRACKING
    )
except ImportError:
    # Fallback defaults if config.py doesn't exist
    MONGO_URI = "mongodb://localhost:27017/"
    MONGO_DATABASE = "fresh_update"
    MONGO_COLLECTION_URL_TRACKING = "url_tracking"

logger = logging.getLogger(__name__)


class MongoDBTrackingPipeline:
    """
    Pipeline to update MongoDB url_tracking collection after successful ChromaDB storage.
    Priority: 400 (runs AFTER ChromaDBPipeline at 300)
    
    Purpose:
    - Update MongoDB with content_hash to prevent infinite re-processing
    - Track last_checked and last_modified timestamps
    - Use upsert to handle both new and existing URLs
    """
    
    def __init__(self):
        self.mongo_client = None
        self.db = None
        self.url_tracking = None
        self.updates_count = 0
        self.errors_count = 0
        
    def open_spider(self, spider):
        """
        Initialize MongoDB connection when spider starts.
        REQUIRES explicit tenant-scoped MongoDB URI - no fallbacks.
        """
        try:
            collection_name = getattr(
                spider,
                'url_tracking_collection_name',
                MONGO_COLLECTION_URL_TRACKING
            )
            
            # Get tenant-specific MongoDB URI
            tenant_mongo_uri = getattr(spider, 'mongo_uri', None)
            
            # CRITICAL: Require explicit MongoDB URI for tenant isolation
            if not tenant_mongo_uri or not tenant_mongo_uri.strip():
                logger.error(
                    "❌ mongo_uri is REQUIRED for tenant isolation. "
                    "Cannot proceed without tenant-specific database URI."
                )
                raise ValueError(
                    "mongo_uri must be provided via spider argument for tenant isolation"
                )
            
            # Validate MongoDB URI format
            if not tenant_mongo_uri.startswith(("mongodb://", "mongodb+srv://")):
                raise ValueError(f"Invalid MongoDB URI format: {tenant_mongo_uri}")
            
            tenant_resource_id = getattr(spider, 'resource_id', None)
            
            # Structured logging for tenant context
            logger.info(f"\\n{'='*80}")
            logger.info(f"🚀 MongoDBTrackingPipeline: Initializing for Tenant")
            logger.info(f"{'='*80}")
            logger.info(f"📌 Resource ID: {tenant_resource_id or 'NOT SET'}")
            logger.info(f"🔗 MongoDB URI: {tenant_mongo_uri[:50]}..." if len(tenant_mongo_uri) > 50 else f"🔗 MongoDB URI: {tenant_mongo_uri}")
            logger.info(f"📦 Collection: {collection_name}")
            logger.info(f"{'='*80}\\n")

            # Try to use spider's existing MongoDB connection if available
            if hasattr(spider, 'url_tracking') and spider.url_tracking is not None:
                self.url_tracking = spider.url_tracking
                logger.info(
                    "✅ Using spider's existing url_tracking collection (%s)",
                    collection_name
                )
            else:
                # Create our own MongoDB connection with tenant URI
                logger.info(f"🔄 Creating MongoDB connection...")
                self.mongo_client = MongoClient(tenant_mongo_uri)
                
                # Parse database name from URI or use default
                from pymongo.uri_parser import parse_uri
                parsed_uri = parse_uri(tenant_mongo_uri)
                database_name = parsed_uri.get("database") or MONGO_DATABASE
                
                logger.info(f"📊 Database: {database_name}")
                self.db = self.mongo_client[database_name]
                self.url_tracking = self.db[collection_name]
                
                # Ensure index on url field
                self.url_tracking.create_index("url", unique=True)
                logger.info(f"✅ MongoDB connection established successfully")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize MongoDB connection: {e}")
            raise
    
    def close_spider(self, spider):
        """
        Clean up MongoDB connection when spider closes.
        Only close if we created our own connection.
        """
        logger.info(f"\n{'='*60}")
        logger.info(f"📊 MongoDBTrackingPipeline:")
        logger.info(f"   Status: DISABLED (tracking handled by spider)")
        logger.info(f"{'='*60}\n")
        
        # Only close the client if we created it (not using spider's)
        if self.mongo_client is not None:
            self.mongo_client.close()
            logger.info("✅ MongoDBTrackingPipeline: MongoDB connection closed")
    
    def process_item(self, item, spider):
        """
        Pipeline disabled - MongoDB tracking now handled by spider's parse() method.
        
        The spider updates MongoDB ONCE per URL with the full-page content hash,
        preventing hash mismatches caused by multiple items per URL.
        
        This pipeline now just passes items through without modification.
        """
        # Just pass through - MongoDB already updated by spider
        # No need to update here (would cause incorrect hash storage)
        return item
