"""
Auto-restart wrapper for app_20.py
This script runs the bot and automatically restarts it when it exits (e.g., after scrapes complete)
"""
import subprocess
import sys
import time
import os
from pathlib import Path

# Get the directory containing this script
SCRIPT_DIR = Path(__file__).parent
BOT_SCRIPT = SCRIPT_DIR / "BOT" / "app_20.py"

print("=" * 80)
print("🔄 BOT AUTO-RESTART WRAPPER")
print("=" * 80)
print(f"Bot script: {BOT_SCRIPT}")
print("This will automatically restart the bot when it exits.")
print("Press Ctrl+C to stop completely.")
print("=" * 80)

# Log environment variables for debugging
rag_data_root = os.getenv("RAG_DATA_ROOT")
if rag_data_root:
    print(f"✅ RAG_DATA_ROOT detected: {rag_data_root}")
else:
    print("⚠️  RAG_DATA_ROOT not set - will use default: /var/lib/rag-data")

print("=" * 80)
print()

restart_count = 0

# Copy parent environment to ensure ALL environment variables are inherited
# This includes systemd variables like RAG_DATA_ROOT, Docker env vars, etc.
env = os.environ.copy()
# Set marker to indicate auto-restart mode (prevents uvicorn reload conflicts)
env["BOT_AUTO_RESTART"] = "1"

print("🔍 Environment check before starting bot:")
print(f"   RAG_DATA_ROOT: {env.get('RAG_DATA_ROOT', 'NOT SET (will use default)')}")
print(f"   MONGODB_URI: {env.get('MONGODB_URI', 'NOT SET')[:50] + '...' if env.get('MONGODB_URI') and len(env.get('MONGODB_URI', '')) > 50 else env.get('MONGODB_URI', 'NOT SET')}")
print(f"   GOOGLE_API_KEY: {'SET ✓' if env.get('GOOGLE_API_KEY') else 'NOT SET ✗'}")
print(f"   BOT_AUTO_RESTART: {env.get('BOT_AUTO_RESTART')}")
print()

while True:
    try:
        restart_count += 1
        if restart_count > 1:
            print(f"\n{'=' * 80}")
            print(f"🔄 RESTARTING BOT (restart #{restart_count})")
            print(f"{'=' * 80}\n")
            time.sleep(2)  # Brief pause between restarts
        
        # Run the bot script with auto-restart env var
        # Use the same Python interpreter that's running this script
        process = subprocess.run(
            [sys.executable, str(BOT_SCRIPT)],
            cwd=str(SCRIPT_DIR),
            env=env
        )
        
        # If we get here, the bot exited
        exit_code = process.returncode
        
        if exit_code == 0:
            # Clean exit (Ctrl+C) - don't restart
            print("\n✅ Bot exited cleanly (exit code 0). Stopping auto-restart.")
            break
        else:
            # Any non-zero exit means restart (code 1 = requested, others = crash)
            print(f"\n🔄 Bot exited with code {exit_code}. Restarting...")
            if exit_code != 1:
                # If it wasn't a requested restart, wait a bit
                print("   (Waiting 3 seconds before restart...)")
                time.sleep(3)
            continue
            
    except KeyboardInterrupt:
        print("\n\n🛑 Ctrl+C detected. Stopping bot and auto-restart wrapper.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error running bot: {e}")
        print("Retrying in 10 seconds...")
        time.sleep(10)
