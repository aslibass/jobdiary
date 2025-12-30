#!/bin/bash

# Database Migration Script
# Standalone script to run Alembic migrations

set -e  # Exit on error

echo "📦 Running database migrations..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    exit 1
fi

# Run migrations
alembic upgrade head

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed successfully"
else
    echo "❌ Migration failed"
    exit 1
fi

