"""Per-Tenant Persistent Scheduler Supervisor Script.

This script acts as a supervisor that runs continuously in the background,
executing the run_tenant_updater.py script on a defined schedule (daily/hourly).

Key design decisions:
- Uses subprocess.run to spawn fresh instances to avoid memory leaks
- Handles SIGTERM gracefully for clean shutdown
- Logs all activities for debugging and monitoring
"""

from __future__ import annotations
from dotenv import load_dotenv
load_dotenv()
import argparse
import json
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from urllib.parse import urlparse

# Ensure parent directory (project root) is on path for imports
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    import schedule
except ImportError:
    print(json.dumps({
        "status": "failed",
        "error": "schedule library not installed. Run: pip install schedule",
        "timestamp": datetime.utcnow().isoformat()
    }))
    sys.exit(1)


# Global flag for graceful shutdown
_shutdown_requested = False


def _signal_handler(signum: int, frame) -> None:
    """Handle termination signals gracefully."""
    global _shutdown_requested
    signal_name = signal.Signals(signum).name if hasattr(signal, 'Signals') else str(signum)
    logging.info("Received signal %s, initiating graceful shutdown...", signal_name)
    _shutdown_requested = True


def _parse_args(argv: list[str]) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Persistent scheduler supervisor for tenant updater"
    )
    
    # All arguments from run_tenant_updater.py
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
    parser.add_argument("--respect-robots", dest="respect_robots", action="store_true", 
                        help="Respect robots.txt during crawl")
    parser.add_argument("--no-respect-robots", dest="respect_robots", action="store_false", 
                        help="Ignore robots.txt during crawl")
    parser.add_argument("--aggressive-discovery", dest="aggressive_discovery", action="store_true", 
                        help="Enable aggressive link discovery (default)")
    parser.add_argument("--no-aggressive-discovery", dest="aggressive_discovery", action="store_false", 
                        help="Disable aggressive link discovery")
    parser.set_defaults(aggressive_discovery=True)
    parser.set_defaults(respect_robots=None)
    parser.add_argument("--job-id", help="Optional job identifier prefix for tracking")
    parser.add_argument("--log-level", default="INFO", help="Python logging level (default INFO)")
    
    # NEW: Schedule-specific arguments
    parser.add_argument("--interval-minutes", type=int, default=5,
                        help="Interval in minutes between updates. Default: 5")
    parser.add_argument("--run-immediately", action="store_true",
                        help="Run the updater immediately on startup before starting schedule")
    
    return parser.parse_args(argv)


def _normalise_args(args: argparse.Namespace) -> None:
    """Validate and normalize arguments."""
    if not args.start_url.lower().startswith(("http://", "https://")):
        raise ValueError("start-url must include http:// or https://")

    if not args.domain:
        parsed = urlparse(args.start_url)
        if not parsed.netloc:
            raise ValueError("Unable to derive domain from start-url")
        args.domain = parsed.netloc

    args.vector_store_path = os.path.abspath(args.vector_store_path)
    os.makedirs(args.vector_store_path, exist_ok=True)


def _configure_logging(level: str, resource_id: str) -> None:
    """Configure logging with a format that includes resource ID."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format=f"%(asctime)s [%(levelname)s] [scheduler:{resource_id}] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def _build_updater_command(args: argparse.Namespace) -> list[str]:
    """Build the command-line arguments for run_tenant_updater.py."""
    updater_script = os.path.join(ROOT_DIR, "UPDATER", "run_tenant_updater.py")
    
    cmd = [
        sys.executable,
        updater_script,
        "--start-url", args.start_url,
        "--resource-id", args.resource_id,
        "--vector-store-path", args.vector_store_path,
    ]
    
    if args.domain:
        cmd.extend(["--domain", args.domain])
    if args.user_id:
        cmd.extend(["--user-id", args.user_id])
    if args.collection_name:
        cmd.extend(["--collection-name", args.collection_name])
    if args.embedding_model_name:
        cmd.extend(["--embedding-model-name", args.embedding_model_name])
    if args.mongo_uri:
        cmd.extend(["--mongo-uri", args.mongo_uri])
    if args.max_depth is not None:
        cmd.extend(["--max-depth", str(args.max_depth)])
    if args.max_links_per_page is not None:
        cmd.extend(["--max-links-per-page", str(args.max_links_per_page)])
    if args.sitemap_url:
        cmd.extend(["--sitemap-url", args.sitemap_url])
    if args.respect_robots is True:
        cmd.append("--respect-robots")
    elif args.respect_robots is False:
        cmd.append("--no-respect-robots")
    if args.aggressive_discovery is True:
        cmd.append("--aggressive-discovery")
    elif args.aggressive_discovery is False:
        cmd.append("--no-aggressive-discovery")
    if args.log_level:
        cmd.extend(["--log-level", args.log_level])
    
    return cmd


def _trigger_bot_restart(args: argparse.Namespace) -> None:
    """Trigger bot process restart after a successful scrape.
    
    This is MANDATORY - if restart fails, the entire completion flow is aborted.
    Bot must fully restart to reload all vectors from disk.
    
    Raises exception if restart fails.
    """
    import urllib.request
    import urllib.error
    
    bot_base_url = os.environ.get("BOT_URL", "http://localhost:8000")
    service_secret = os.environ.get("FASTAPI_SHARED_SECRET") or os.environ.get("SERVICE_SECRET", "default_service_secret")
    
    restart_url = f"{bot_base_url}/system/restart"
    
    logging.info("🔁 Triggering MANDATORY bot process restart...")
    logging.info("   URL: %s", restart_url)
    
    try:
        request = urllib.request.Request(
            restart_url,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Service-Secret": service_secret
            }
        )
        
        with urllib.request.urlopen(request, timeout=30) as response:
            response_data = response.read().decode('utf-8')
            result = json.loads(response_data)
            logging.info("✅ Bot restart triggered successfully! PID: %s", result.get('pid', 'unknown'))
            logging.info("🔁 Bot process restarting after scheduled scrape")
            logging.info("🤖 BOT WILL BE READY in a few seconds with updated knowledge base!")
                
    except urllib.error.HTTPError as e:
        error_msg = f"Bot restart failed with HTTP {e.code}: {e.reason}"
        logging.error("❌ CRITICAL: %s", error_msg)
        raise RuntimeError(error_msg)
    except urllib.error.URLError as e:
        error_msg = f"Could not reach bot at {bot_base_url}: {e.reason}"
        logging.error("❌ CRITICAL: %s", error_msg)
        raise RuntimeError(error_msg)
    except json.JSONDecodeError as e:
        error_msg = f"Invalid response from bot restart endpoint: {e}"
        logging.error("❌ CRITICAL: %s", error_msg)
        raise RuntimeError(error_msg)
    except Exception as e:
        error_msg = f"Bot restart failed: {e}"
        logging.error("❌ CRITICAL: %s", error_msg)
        raise RuntimeError(error_msg)


def _notify_backend_scrape_complete(args: argparse.Namespace, success: bool) -> None:
    """Notify the admin backend that a scheduled scrape has completed.
    
    This is the SINGLE SOURCE OF TRUTH for scheduled scrape completion.
    Sends complete payload with botReady, trigger, and timestamp.
    """
    import urllib.request
    import urllib.error
    
    backend_url = os.environ.get("ADMIN_BACKEND_URL", "http://localhost:5000")
    service_secret = os.environ.get("SERVICE_SECRET", "default_service_secret")
    
    notify_url = f"{backend_url}/api/scrape/scheduler/scrape-complete"
    
    # Build complete payload as per requirement
    payload = json.dumps({
        "resourceId": args.resource_id,
        "success": success,
        "botReady": success,  # Bot is ready if scrape succeeded and restart triggered
        "trigger": "scheduler",
        "completedAt": datetime.utcnow().isoformat(),
        "message": "Scheduled scrape completed and bot restarted" if success else "Scheduled scrape completed but bot restart may have failed"
    }).encode('utf-8')
    
    logging.info("📬 Notifying admin backend of scheduled scrape completion...")
    
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
            logging.info("✅ Admin backend notified of scheduled scrape completion")
            logging.info("   Response: %s", response_data[:200])
    except urllib.error.HTTPError as e:
        logging.warning("⚠️ Backend notification HTTP error %d: %s", e.code, e.reason)
    except urllib.error.URLError as e:
        logging.warning("⚠️ Could not reach admin backend at %s: %s", backend_url, e.reason)
    except Exception as e:
        logging.warning("⚠️ Failed to notify admin backend: %s", e)


def _mark_data_updated_fallback(args: argparse.Namespace, bot_base_url: str, service_secret: str) -> bool:
    """Fallback: Mark data as updated so next request will reload."""
    import urllib.request
    import urllib.error
    
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


def _run_updater_job(args: argparse.Namespace) -> None:
    """Execute the updater as a subprocess.
    
    This spawns a fresh instance to avoid memory leaks from long-running processes.
    After successful scraping, notifies the bot to reload its vector store.
    """
    job_timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    job_id = f"scheduled_{args.resource_id}_{job_timestamp}"
    
    logging.info("=" * 60)
    logging.info("Starting scheduled updater job: %s", job_id)
    logging.info("=" * 60)
    
    cmd = _build_updater_command(args)
    cmd.extend(["--job-id", job_id])
    
    logging.info("Command: %s", " ".join(cmd))
    
    success = False
    bot_notified = False
    
    try:
        start_time = time.time()
        result = subprocess.run(
            cmd,
            cwd=ROOT_DIR,
            text=True,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        elapsed = time.time() - start_time
        
        if result.returncode == 0:
            logging.info("Updater job completed successfully in %.1f seconds", elapsed)
            
            # MANDATORY: Trigger bot process restart
            # If this fails, DO NOT notify backend - the scrape is considered incomplete
            try:
                _trigger_bot_restart(args)
                # Only notify backend AFTER successful restart trigger
                _notify_backend_scrape_complete(args, success=True)
            except Exception as restart_error:
                logging.error("❌ ABORTING: Bot restart failed - %s", restart_error)
                logging.error("❌ Backend will NOT be notified - scrape cycle incomplete")
                # Do not notify backend - restart is mandatory
            
        else:
            logging.error("Updater job failed with exit code %d", result.returncode)
            logging.error("Scraper did not complete successfully - check logs above")
            _notify_backend_scrape_complete(args, success=False)
                
    except Exception as exc:
        logging.exception("Failed to execute updater subprocess: %s", exc)
        _notify_backend_scrape_complete(args, success=False)


def _setup_schedule(args: argparse.Namespace) -> None:
    """Configure the schedule based on arguments."""
    
    def job_wrapper():
        """Wrapper that checks for shutdown before running."""
        if _shutdown_requested:
            logging.info("Shutdown requested, skipping scheduled job")
            return schedule.CancelJob
        _run_updater_job(args)
    
    # Fixed interval scheduling
    interval = args.interval_minutes
    schedule.every(interval).minutes.do(job_wrapper)
    logging.info("Scheduled updater to run every %d minutes", interval)
    
    # Calculate and log next run time
    next_run = schedule.next_run()
    if next_run:
        logging.info("Next scheduled run: %s", next_run.strftime("%Y-%m-%d %H:%M:%S"))


def main(argv: list[str]) -> int:
    """Main entry point for the scheduler supervisor."""
    global _shutdown_requested
    
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
    except SystemExit as exc:
        return exc.code if exc.code else 0

    # Ensure mongo_uri is populated from environment if not provided via CLI
    args.mongo_uri = (
        args.mongo_uri
        or os.environ.get("MONGO_URI")
        or os.environ.get("MONGODB_URI")
        or os.environ.get("UPDATER_MONGODB_URI")
    )

    _configure_logging(args.log_level, args.resource_id)
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)
    if hasattr(signal, 'SIGBREAK'):  # Windows
        signal.signal(signal.SIGBREAK, _signal_handler)
    
    # Write PID file for reliable process detection
    pid_file_path = os.path.join(args.vector_store_path, "scheduler.pid")
    try:
        with open(pid_file_path, 'w') as f:
            f.write(str(os.getpid()))
        logging.info("PID file written: %s", pid_file_path)
    except Exception as e:
        logging.warning("Could not write PID file: %s", e)
    
    logging.info("=" * 60)
    logging.info("Starting Tenant Scheduler Supervisor")
    logging.info("=" * 60)
    logging.info("Resource ID: %s", args.resource_id)
    logging.info("Start URL: %s", args.start_url)
    logging.info("Interval: %d minutes", args.interval_minutes)
    logging.info("Vector Store: %s", args.vector_store_path)
    logging.info("PID: %d", os.getpid())
    logging.info("=" * 60)
    
    # Output startup JSON for the Node.js backend to capture
    startup_info = {
        "status": "started",
        "pid": os.getpid(),
        "resource_id": args.resource_id,
        "interval_minutes": args.interval_minutes,
        "timestamp": datetime.utcnow().isoformat()
    }
    print(json.dumps(startup_info), flush=True)
    
    # Run immediately if requested
    if args.run_immediately:
        logging.info("Running updater immediately as requested...")
        _run_updater_job(args)
    
    # Setup the schedule
    _setup_schedule(args)
    
    # Main loop - check for pending jobs every 60 seconds
    logging.info("Entering scheduler loop (checking every 60 seconds)...")
    
    try:
        while not _shutdown_requested:
            schedule.run_pending()
            
            # Sleep in small increments to respond quickly to shutdown signals
            for _ in range(60):  # 60 x 1 second = 60 seconds total
                if _shutdown_requested:
                    break
                time.sleep(1)
                
    except KeyboardInterrupt:
        logging.info("Received keyboard interrupt")
    
    # Graceful shutdown
    logging.info("Shutting down scheduler...")
    schedule.clear()
    
    # Remove PID file on clean shutdown
    try:
        if os.path.exists(pid_file_path):
            os.remove(pid_file_path)
            logging.info("PID file removed")
    except Exception as e:
        logging.warning("Could not remove PID file: %s", e)
    
    shutdown_info = {
        "status": "stopped",
        "pid": os.getpid(),
        "resource_id": args.resource_id,
        "timestamp": datetime.utcnow().isoformat()
    }
    print(json.dumps(shutdown_info), flush=True)
    logging.info("Scheduler stopped gracefully")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
