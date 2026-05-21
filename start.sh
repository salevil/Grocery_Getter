#!/bin/bash
# Render/Railway start script
# Ensures the repo root is on PYTHONPATH so 'from backend.xxx import' works
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
