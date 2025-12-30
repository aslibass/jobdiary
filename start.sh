#!/bin/bash

# JobDiary API Startup Script
# This script runs database migrations and starts the FastAPI server

set -e  # Exit on error

echo "🚀 Starting JobDiary API..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    exit 1
fi

# Check if API_KEY is set (warning only, not fatal)
if [ -z "$API_KEY" ]; then
    echo "⚠️  Warning: API_KEY environment variable is not set"
fi

# Run database migrations
echo "📦 Running database migrations..."
alembic upgrade head

if [ $? -ne 0 ]; then
    echo "❌ Migration failed. Exiting."
    exit 1
fi

echo "✅ Migrations completed successfully"

# Start the server
echo "🌐 Starting Uvicorn server..."

# Use PORT from environment if set (for Railway/Heroku), otherwise default to 8000
PORT=${PORT:-8000}
HOST=${HOST:-0.0.0.0}

# Check if we're in development mode
if [ "$ENV" = "dev" ] || [ -z "$ENV" ]; then
    echo "🔧 Running in development mode (reload enabled)"
    uvicorn app.main:app --host "$HOST" --port "$PORT" --reload
else
    echo "🏭 Running in production mode"
    uvicorn app.main:app --host "$HOST" --port "$PORT"
fi

