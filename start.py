"""
Render startup script — runs as Python so errors can't be swallowed.
"""
import os
import sys
import subprocess
import traceback

print("=== Grocery Getter startup ===", flush=True)
print(f"Python: {sys.version}", flush=True)
print(f"CWD: {os.getcwd()}", flush=True)
print(f"DATABASE_URL set: {'YES' if os.environ.get('DATABASE_URL') else 'NO'}", flush=True)
print(f"SECRET_KEY set: {'YES' if os.environ.get('SECRET_KEY') else 'NO'}", flush=True)

# Add cwd to path so 'from backend.xxx import' works
sys.path.insert(0, os.getcwd())
print(f"sys.path[0]: {sys.path[0]}", flush=True)

print("=== Running Alembic migrations ===", flush=True)
try:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=os.path.join(os.getcwd(), "backend"),
        check=True,
    )
    print("Migrations complete.", flush=True)
except subprocess.CalledProcessError as e:
    print(f"Migration failed with exit code {e.returncode} — aborting startup.", flush=True)
    sys.exit(1)

print("=== Importing app ===", flush=True)
try:
    from backend.main import app
    print("Import OK", flush=True)
except Exception:
    print("IMPORT FAILED:", flush=True)
    traceback.print_exc()
    sys.exit(1)

print("=== Starting uvicorn ===", flush=True)
import uvicorn
port = int(os.environ.get("PORT", 8000))
uvicorn.run(app, host="0.0.0.0", port=port)
