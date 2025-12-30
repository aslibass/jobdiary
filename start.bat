@echo off
REM JobDiary API Startup Script for Windows
REM This script runs database migrations and starts the FastAPI server

echo 🚀 Starting JobDiary API...

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo ❌ Error: DATABASE_URL environment variable is not set
    exit /b 1
)

REM Check if API_KEY is set (warning only)
if "%API_KEY%"=="" (
    echo ⚠️  Warning: API_KEY environment variable is not set
)

REM Run database migrations
echo 📦 Running database migrations...
alembic upgrade head

if errorlevel 1 (
    echo ❌ Migration failed. Exiting.
    exit /b 1
)

echo ✅ Migrations completed successfully

REM Start the server
echo 🌐 Starting Uvicorn server...

REM Use PORT from environment if set, otherwise default to 8000
if "%PORT%"=="" set PORT=8000
if "%HOST%"=="" set HOST=0.0.0.0

REM Check if we're in development mode
if "%ENV%"=="dev" (
    echo 🔧 Running in development mode (reload enabled)
    uvicorn app.main:app --host %HOST% --port %PORT% --reload
) else (
    echo 🏭 Running in production mode
    uvicorn app.main:app --host %HOST% --port %PORT%
)

