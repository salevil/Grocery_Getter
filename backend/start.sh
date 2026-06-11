#!/bin/bash
# Start script — runs from the backend/ directory
# Sets PYTHONPATH so 'from backend.xxx import' works
export PYTHONPATH="${PYTHONPATH}:$(dirname $(pwd))"

echo "Running Alembic migrations..."
python -m alembic upgrade head
if [ $? -ne 0 ]; then
  echo "Migration failed, aborting startup"
  exit 1
fi
echo "Migrations complete."

exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
