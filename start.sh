#!/bin/bash
set -e
echo "=== Starting Grocery Getter Backend ==="
echo "Python: $(python --version)"
echo "Working dir: $(pwd)"
echo "PYTHONPATH: ${PYTHONPATH}"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "SECRET_KEY set: $([ -n "$SECRET_KEY" ] && echo YES || echo NO)"

export PYTHONPATH="${PYTHONPATH}:$(pwd)"

echo "=== Testing import ==="
python -c "from backend.main import app; print('Import OK')"

echo "=== Starting uvicorn ==="
exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
