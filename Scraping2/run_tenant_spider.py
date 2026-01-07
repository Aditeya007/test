"""Utility entrypoint to run the FixedUniversalSpider for a specific tenant.

This script is designed for programmatic usage (e.g. from the admin backend) so
we can provision tenant-scoped vector stores without requiring interactive
input.
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from urllib.parse import urlparse

import nltk
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

from Scraping2.spiders.spider import FixedUniversalSpider


def _ensure_nltk_models() -> None:
    import nltk
    try:
        nltk.download("punkt", quiet=True)
        nltk.download("punkt_tab", quiet=True)
    except Exception as exc:
        logging.warning("NLTK download failed: %s", exc)

def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the universal scraper for a tenant")
    parser.add_argument("--start-url", required=True, help="Seed URL to begin crawling")
    parser.add_argument("--domain", help="Allowed domain. If omitted it's derived from the start URL")
    parser.add_argument("--resource-id", required=True, help="Tenant resource identifier")
    parser.add_argument("--user-id", help="MongoDB user id that owns this scrape")
    parser.add_argument("--vector-store-path", required=True, help="Directory where the tenant's Chroma DB lives")
    parser.add_argument("--collection-name", default="scraped_content", help="ChromaDB collection name")
    parser.add_argument("--embedding-model-name", help="SentenceTransformer model for embeddings")
    parser.add_argument("--max-depth", type=int, default=999, help="Maximum crawl depth")
    parser.add_argument("--max-links-per-page", type=int, default=1000, help="Maximum outgoing links followed per page")
    parser.add_argument("--sitemap-url", help="Optional explicit sitemap URL")
    parser.add_argument("--respect-robots", dest="respect_robots", action="store_true", help="Respect robots.txt during crawl")
    parser.add_argument("--no-respect-robots", dest="respect_robots", action="store_false", help="Ignore robots.txt during crawl")
    parser.set_defaults(respect_robots=None)
    parser.add_argument(
        "--aggressive-discovery",
        dest="aggressive_discovery",
        action="store_true",
        help="Enable aggressive discovery (default)"
    )
    parser.add_argument(
        "--no-aggressive-discovery",
        dest="aggressive_discovery",
        action="store_false",
        help="Disable aggressive discovery"
    )
    parser.set_defaults(aggressive_discovery=True)
    parser.add_argument("--job-id", help="Optional job identifier propagated from the caller")
    parser.add_argument("--log-level", default="INFO", help="Python logging level")
    parser.add_argument("--stats-output", help="Optional path to write crawl stats as JSON")
    return parser.parse_args(argv)


def _validate_and_normalise_args(args: argparse.Namespace) -> None:
    if not args.start_url.lower().startswith(("http://", "https://")):
        raise ValueError("start-url must begin with http:// or https://")

    if not args.domain:
        parsed = urlparse(args.start_url)
        if not parsed.netloc:
            raise ValueError("Unable to derive domain from start-url")
        args.domain = parsed.netloc

    vector_path = os.path.abspath(args.vector_store_path)
    os.makedirs(vector_path, exist_ok=True)
    args.vector_store_path = vector_path


def _configure_logging(level: str) -> None:
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def _notify_bot_reload(args: argparse.Namespace) -> bool:
    """Notify the bot to reload its vector store after scraping completes.
    
    Returns True if the bot was successfully notified, False otherwise.
    """
    import urllib.request
    import urllib.error
    
    bot_base_url = os.environ.get("BOT_URL", "http://localhost:8000")
    # Try both environment variable names for the service secret
    service_secret = os.environ.get("FASTAPI_SHARED_SECRET") or os.environ.get("SERVICE_SECRET", "default_service_secret")
    
    # Build the reload URL with query parameters
    try:
        params = urllib.parse.urlencode({
            "resource_id": args.resource_id,
            "vector_store_path": args.vector_store_path,
        })
    except:
        import urllib.parse
        params = urllib.parse.urlencode({
            "resource_id": args.resource_id,
            "vector_store_path": args.vector_store_path,
        })
    
    reload_url = f"{bot_base_url}/reload_vectors?{params}"
    
    logging.info("🔄 Notifying bot to reload vector store...")
    logging.info("   URL: %s", reload_url)
    
    try:
        request = urllib.request.Request(
            reload_url,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Service-Secret": service_secret
            }
        )
        
        with urllib.request.urlopen(request, timeout=30) as response:
            response_data = response.read().decode('utf-8')
            try:
                result = json.loads(response_data)
                doc_count = result.get('document_count', 'unknown')
                logging.info("✅ Bot reloaded successfully! Document count: %s", doc_count)
                logging.info("🤖 BOT IS NOW READY TO USE with updated knowledge base!")
                return True
            except json.JSONDecodeError:
                logging.info("✅ Bot reload response: %s", response_data[:200])
                return True
                
    except urllib.error.HTTPError as e:
        logging.warning("⚠️ Bot reload HTTP error %d: %s", e.code, e.reason)
        # Try the mark-data-updated endpoint as fallback
        return _mark_data_updated_fallback(args, bot_base_url, service_secret)
    except urllib.error.URLError as e:
        logging.warning("⚠️ Could not reach bot at %s: %s", bot_base_url, e.reason)
        logging.warning("   Bot may not be running. Data will be loaded on next bot startup.")
        return False
    except Exception as e:
        logging.warning("⚠️ Failed to notify bot: %s", e)
        return False


def _mark_data_updated_fallback(args: argparse.Namespace, bot_base_url: str, service_secret: str) -> bool:
    """Fallback: Mark data as updated so next request will reload."""
    import urllib.request
    import urllib.error
    
    try:
        params = urllib.parse.urlencode({
            "resource_id": args.resource_id,
            "vector_store_path": args.vector_store_path,
        })
    except:
        import urllib.parse
        params = urllib.parse.urlencode({
            "resource_id": args.resource_id,
            "vector_store_path": args.vector_store_path,
        })
    
    mark_url = f"{bot_base_url}/mark-data-updated?{params}"
    
    try:
        request = urllib.request.Request(
            mark_url,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Service-Secret": service_secret
            }
        )
        
        with urllib.request.urlopen(request, timeout=10) as response:
            logging.info("✅ Marked data as updated (lazy reload on next request)")
            return True
    except Exception as e:
        logging.warning("⚠️ Fallback also failed: %s", e)
        return False


def _notify_scrape_complete(args: argparse.Namespace, success: bool, stats: dict, bot_notified: bool) -> None:
    """Notify the admin backend that the scrape has completed."""
    import urllib.request
    import urllib.error
    
    backend_url = os.environ.get("ADMIN_BACKEND_URL", "http://localhost:5000")
    service_secret = os.environ.get("SERVICE_SECRET", "default_service_secret")
    
    notify_url = f"{backend_url}/api/scrape/scheduler/scrape-complete"
    
    # Extract document count from stats if available
    document_count = None
    if stats:
        # Try common stat keys for document count
        document_count = (
            stats.get('item_scraped_count') or 
            stats.get('item_count') or 
            stats.get('response_received_count')
        )
    
    payload = json.dumps({
        "resourceId": args.resource_id,
        "success": success and bot_notified,  # Only mark as success if bot was also notified
        "message": "Manual scrape completed successfully" if success else "Manual scrape completed with errors",
        "documentCount": document_count,
        "jobId": args.job_id,
        "botReady": bot_notified
    }).encode('utf-8')
    
    logging.info("📬 Notifying admin backend of scrape completion...")
    
    try:
        request = urllib.request.Request(
            notify_url,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Service-Secret": service_secret
            }
        )
        
        with urllib.request.urlopen(request, timeout=10) as response:
            response_data = response.read().decode('utf-8')
            logging.info("✅ Admin backend notified of scrape completion")
            logging.info("   Response: %s", response_data[:200])
    except urllib.error.HTTPError as e:
        logging.warning("⚠️ Backend notification HTTP error %d: %s", e.code, e.reason)
    except urllib.error.URLError as e:
        logging.warning("⚠️ Could not reach admin backend at %s: %s", backend_url, e.reason)
    except Exception as e:
        logging.warning("⚠️ Failed to notify admin backend: %s", e)


def _notify_bot_scrape_complete(bot_id: str) -> bool:
    """Notify the admin backend that this bot's scrape is complete.
    
    This is the new bot-specific completion endpoint.
    Args:
        bot_id: The bot's resource identifier (botId)
    
    Returns:
        True if notification was successful, False otherwise
    """
    import urllib.request
    import urllib.error
    
    backend_url = os.environ.get("ADMIN_BACKEND_URL", "http://localhost:5000")
    service_secret = os.environ.get("SERVICE_SECRET", "default_service_secret")
    
    notify_url = f"{backend_url}/api/bot/{bot_id}/scrape/complete"
    
    logging.info("🔔 Notifying bot scrape completion endpoint...")
    logging.info("   URL: %s", notify_url)
    
    try:
        request = urllib.request.Request(
            notify_url,
            data=b'{}',  # Empty JSON body
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Service-Secret": service_secret
            }
        )
        
        with urllib.request.urlopen(request, timeout=10) as response:
            response_data = response.read().decode('utf-8')
            try:
                result = json.loads(response_data)
                logging.info("✅ Bot scrape completion notified successfully!")
                logging.info("   Response: %s", result)
                return True
            except json.JSONDecodeError:
                logging.info("✅ Bot scrape completion response: %s", response_data[:200])
                return True
                
    except urllib.error.HTTPError as e:
        logging.warning("⚠️ Bot scrape completion HTTP error %d: %s", e.code, e.reason)
        try:
            error_body = e.read().decode('utf-8')
            logging.warning("   Error details: %s", error_body[:200])
        except:
            pass
        return False
    except urllib.error.URLError as e:
        logging.warning("⚠️ Could not reach backend at %s: %s", backend_url, e.reason)
        return False
    except Exception as e:
        logging.warning("⚠️ Failed to notify bot scrape completion: %s", e)
        return False



def main(argv: list[str]) -> int:
    args = _parse_args(argv)

    try:
        _validate_and_normalise_args(args)
    except ValueError as exc:
        print(json.dumps({
            "status": "failed",
            "error": str(exc),
            "timestamp": datetime.utcnow().isoformat()
        }))
        return 2

    _configure_logging(args.log_level)
    _ensure_nltk_models()

    settings = get_project_settings()
    settings.set('ROBOTSTXT_OBEY', bool(args.respect_robots))
    settings.set('CHROMA_DB_PATH', args.vector_store_path)
    settings.set('CHROMA_COLLECTION_NAME', args.collection_name)
    if args.embedding_model_name:
        settings.set('CHROMA_EMBEDDING_MODEL', args.embedding_model_name)

    process = CrawlerProcess(settings)

    logging.info(
        "Starting tenant scrape",
        extra={
            'resource_id': args.resource_id,
            'start_url': args.start_url,
            'vector_store_path': args.vector_store_path,
            'job_id': args.job_id
        }
    )

    crawler = process.create_crawler(FixedUniversalSpider)
    process.crawl(
        crawler,
        domain=args.domain,
        start_url=args.start_url,
        max_depth=args.max_depth,
        sitemap_url=args.sitemap_url,
        max_links_per_page=args.max_links_per_page,
        respect_robots=bool(args.respect_robots),
        aggressive_discovery=bool(args.aggressive_discovery),
        resource_id=args.resource_id,
        tenant_user_id=args.user_id,
        vector_store_path=args.vector_store_path,
        collection_name=args.collection_name,
        embedding_model_name=args.embedding_model_name,
        scrape_job_id=args.job_id,
    )

    scrape_success = False
    stats = {}
    
    try:
        process.start()
        scrape_success = True
        logging.info("✅ Scraping completed successfully!")
    except KeyboardInterrupt:  # pragma: no cover
        logging.warning("Scrape interrupted by user")
        return 130
    except Exception as exc:
        logging.exception("Scrape failed: %s", exc)
        scrape_success = False

    stats = crawler.stats.get_stats() if crawler.stats else {}
    
    # Notify the bot to reload its vector store
    bot_notified = False
    if scrape_success:
        logging.info("📡 Notifying bot to reload vector store...")
        bot_notified = _notify_bot_reload(args)
        if bot_notified:
            logging.info("✅ Bot successfully notified and reloaded!")
        else:
            logging.warning("⚠️ Bot notification failed - bot may need manual restart")
    
    # Notify bot-specific scrape completion endpoint
    # This is the primary notification that updates the bot's scrape status
    if scrape_success:
        bot_completion_notified = _notify_bot_scrape_complete(args.resource_id)
        if not bot_completion_notified:
            logging.warning("⚠️ Failed to notify bot scrape completion - status may not update in dashboard")
    
    summary = {
        "status": "completed" if scrape_success else "failed",
        "resource_id": args.resource_id,
        "user_id": args.user_id,
        "job_id": args.job_id,
        "start_url": args.start_url,
        "vector_store_path": args.vector_store_path,
        "collection_name": args.collection_name,
        "bot_notified": bot_notified,
        "stats": stats,
        "timestamp": datetime.utcnow().isoformat()
    }

    # Notify admin backend of completion (with bot notification status)
    _notify_scrape_complete(args, scrape_success, stats, bot_notified)

    if args.stats_output:
        try:
            with open(args.stats_output, "w", encoding="utf-8") as handle:
                json.dump(summary, handle, default=str, indent=2)
        except OSError as exc:
            logging.warning("Unable to write stats output %s: %s", args.stats_output, exc)

    print(json.dumps(summary, default=str))
    
    # Exit with success if scrape completed (even if bot notification failed)
    # The bot will auto-reload on next request thanks to the fallback
    return 0 if scrape_success else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
