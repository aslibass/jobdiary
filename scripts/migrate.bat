@echo off
REM Database Migration Script for Windows
REM Standalone script to run Alembic migrations

echo 📦 Running database migrations...

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo ❌ Error: DATABASE_URL environment variable is not set
    exit /b 1
)

REM Run migrations
alembic upgrade head

if errorlevel 1 (
    echo ❌ Migration failed
    exit /b 1
) else (
    echo ✅ Migrations completed successfully
)

