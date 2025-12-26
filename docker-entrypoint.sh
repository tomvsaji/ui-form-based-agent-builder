#!/usr/bin/env bash
set -e

BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
export NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-http://localhost:${BACKEND_PORT}}

# Start backend
uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT} &
BACKEND_PID=$!

cd /app/frontend
npx next start -H 0.0.0.0 -p ${FRONTEND_PORT}

wait ${BACKEND_PID}
