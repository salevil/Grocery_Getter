#!/bin/bash
# Railway start script — runs from the backend/ directory
# Sets PYTHONPATH to the parent so 'from backend.xxx import' works
export PYTHONPATH="${PYTHONPATH}:$(dirname $(pwd))"
exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
