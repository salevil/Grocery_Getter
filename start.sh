#!/bin/bash
echo "=== Starting Grocery Getter Backend ==="
echo "Python: $(python --version)"
echo "Working dir: $(pwd)"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "SECRET_KEY set: $([ -n "$SECRET_KEY" ] && echo YES || echo NO)"

export PYTHONPATH="${PYTHONPATH}:$(pwd)"

echo "=== Testing import (errors will show below) ==="
python -c "from backend.main import app; print('Import OK')" 2>&1
IMPORT_EXIT=$?
echo "Import exit code: $IMPORT_EXIT"

if [ $IMPORT_EXIT -ne 0 ]; then
  echo "=== Import failed, showing full traceback ==="
  python -c "
import traceback
try:
    from backend.main import app
except Exception as e:
    traceback.print_exc()
" 2>&1
  exit 1
fi

echo "=== Starting uvicorn ==="
exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
