"""Tenant-aware wrapper around updater.run_updater.

This script mirrors `Scraping2/run_tenant_spider.py` but targets the incremental
updater. It ensures each tenant writes to its own vector store, tracks job
metadata, and emits JSON output suitable for background processing.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from urllib.parse import urlparse

import nltk

# Ensure parent directory (project root) is on path for imports
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from UPDATER.updater import run_updater, build_url_tracking_collection  # noqa: E402


def _ensure_nltk_models() -> None:
    """Ensure sentence tokenizers are available for the chunking pipeline."""
    for package in ("punkt",):
        try:
            nltk.data.find(f"tokenizers/{package}")
        except LookupError:
            try:
                nltk.download(package, quiet=True)
            except Exception as exc:  # pragma: no cover
                logging.warning("Failed to download NLTK package %s: %s", package, exc)


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the incremental updater for a tenant")
    parser.add_argument("--start-url", required=True, help="Seed URL that defines the crawl scope")
    parser.add_argument("--domain", help="Allowed domain (default derived from start-url)")
    parser.add_argument("--resource-id", required=True, help="Tenant resource identifier")
    parser.add_argument("--user-id", help="Tenant user identifier")
    parser.add_argument("--vector-store-path", required=True, help="Tenant-specific ChromaDB directory")
    parser.add_argument("--collection-name", default="scraped_content", help="ChromaDB collection name")
    parser.add_argument("--embedding-model-name", help="SentenceTransformer model override")
    parser.add_argument("--mongo-uri", help="MongoDB connection override for change tracking")
    parser.add_argument("--max-depth", type=int, default=999, help="Maximum crawl depth")
    parser.add_argument("--max-links-per-page", type=int, default=1000, help="Outgoing link cap per page")
    parser.add_argument("--sitemap-url", help="Optional sitemap URL to prime discovery")
    parser.add_argument("--respect-robots", dest="respect_robots", action="store_true", help="Respect robots.txt during crawl")
    parser.add_argument("--no-respect-robots", dest="respect_robots", action="store_false", help="Ignore robots.txt during crawl")
    parser.add_argument("--aggressive-discovery", dest="aggressive_discovery", action="store_true", help="Enable aggressive link discovery (default)")
    parser.add_argument("--no-aggressive-discovery", dest="aggressive_discovery", action="store_false", help="Disable aggressive link discovery")
    parser.set_defaults(aggressive_discovery=True)
    parser.set_defaults(respect_robots=None)
    parser.add_argument("--job-id", help="Optional job identifier for tracking")
    parser.add_argument("--log-level", default="INFO", help="Python logging level (default INFO)")
    parser.add_argument("--stats-output", help="Optional path to write JSON stats summary")
    return parser.parse_args(argv)


def _normalise_args(args: argparse.Namespace) -> None:
    if not args.start_url.lower().startswith(("http://", "https://")):
        raise ValueError("start-url must include http:// or https://")

    if not args.domain:
        parsed = urlparse(args.start_url)
        if not parsed.netloc:
            raise ValueError("Unable to derive domain from start-url")
        args.domain = parsed.netloc

    args.vector_store_path = os.path.abspath(args.vector_store_path)
    os.makedirs(args.vector_store_path, exist_ok=True)


def _configure_logging(level: str) -> None:
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def _notify_scrape_complete(args: argparse.Namespace, success: bool, stats: dict) -> None:
    """Notify the admin backend that the update has completed."""
    import urllib.request
    import urllib.error
    
    backend_url = os.environ.get("ADMIN_BACKEND_URL", "http://localhost:5000")
    service_secret = os.environ.get("SERVICE_SECRET", "default_service_secret")
    
    notify_url = f"{backend_url}/api/scrape/scheduler/scrape-complete"
    
    # Extract document count from stats if available
    document_count = None
    if stats:
        # Check for URLs added/updated/deleted
        document_count = (
            stats.get('urls_added', 0) + 
            stats.get('urls_updated', 0)
        )
    
    payload = json.dumps({
        "resourceId": args.resource_id,
        "success": success,
        "message": "Scheduled update completed successfully" if success else "Scheduled update completed with errors",
        "documentCount": document_count if document_count > 0 else None,
        "jobId": args.job_id
    }).encode('utf-8')
    
    logging.info("📬 Notifying admin backend of update completion...")
    
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
            logging.info("✅ Admin backend notified of update completion")
            logging.info("   Response: %s", response_data[:200])
    except urllib.error.HTTPError as e:
        logging.warning("⚠️ Backend notification HTTP error %d: %s", e.code, e.reason)
    except urllib.error.URLError as e:
        logging.warning("⚠️ Could not reach admin backend at %s: %s", backend_url, e.reason)
    except Exception as e:
        logging.warning("⚠️ Failed to notify admin backend: %s", e)


def main(argv: list[str]) -> int:
    try:
        args = _parse_args(argv)
        _normalise_args(args)
    except ValueError as exc:
        print(json.dumps({
            "status": "failed",
            "error": str(exc),
            "timestamp": datetime.utcnow().isoformat()
        }))
        return 2

    _configure_logging(args.log_level)
    _ensure_nltk_models()

    logging.info(
        "Starting tenant updater",
        extra={
            'resource_id': args.resource_id,
            'start_url': args.start_url,
            'vector_store_path': args.vector_store_path,
            'job_id': args.job_id
        }
    )

    update_success = False
    stats = {}
    
    try:
        stats = run_updater(
            domain=args.domain,
            start_url=args.start_url,
            mongo_uri=args.mongo_uri,
            max_depth=args.max_depth,
            sitemap_url=args.sitemap_url,
            resource_id=args.resource_id,
            tenant_user_id=args.user_id,
            vector_store_path=args.vector_store_path,
            collection_name=args.collection_name,
            embedding_model_name=args.embedding_model_name,
            job_id=args.job_id,
            respect_robots=args.respect_robots,
            aggressive_discovery=args.aggressive_discovery,
            max_links_per_page=args.max_links_per_page,
        )
        update_success = True
    except KeyboardInterrupt:  # pragma: no cover
        logging.warning("Updater interrupted by user")
        return 130
    except Exception as exc:
        logging.exception("Updater failed: %s", exc)
        update_success = False

    summary = {
        "status": "completed" if update_success else "failed",
        "resource_id": args.resource_id,
        "user_id": args.user_id,
        "job_id": args.job_id,
        "start_url": args.start_url,
        "domain": args.domain,
        "vector_store_path": args.vector_store_path,
        "collection_name": args.collection_name,
        "url_tracking_collection": build_url_tracking_collection(args.resource_id, args.user_id),
        "stats": stats or {},
        "timestamp": datetime.utcnow().isoformat()
    }

    # Notify admin backend of completion
    _notify_scrape_complete(args, update_success, stats)

    if args.stats_output:
        try:
            with open(args.stats_output, "w", encoding="utf-8") as handle:
                json.dump(summary, handle, default=str, indent=2)
        except OSError as exc:
            logging.warning("Unable to write stats output %s: %s", args.stats_output, exc)

    print(json.dumps(summary, default=str))
    return 0 if update_success else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
