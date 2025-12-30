# JobDiary API

A FastAPI-based conversational job diary API for tradies. This service stores end-of-day voice diary entries per job and maintains a current job state snapshot. Designed to work with OpenAI Custom GPTs via Actions.

## Features

- 🏗️ **Job Management**: Create, update, and track tradie jobs
- 📝 **Voice Diary Entries**: Store and search through voice transcripts
- 🔍 **Full-Text Search**: Search entries by transcript and summary
- 📊 **Job State Snapshots**: Maintain structured current state for each job
- 🔐 **API Key Authentication**: Secure access via X-API-Key header
- 🌐 **Railway Ready**: Designed for easy deployment on Railway with Postgres
- 📚 **OpenAPI Schema**: Full OpenAPI documentation for GPT Actions integration

## Tech Stack

- **FastAPI** - Modern, fast web framework
- **SQLAlchemy 2.0** - SQL toolkit and ORM
- **PostgreSQL** - Database with JSONB support
- **Alembic** - Database migration tool
- **Pydantic v2** - Data validation
- **Uvicorn** - ASGI server

## Project Structure

```
/
  app/
    __init__.py       # Package initialization
    main.py           # FastAPI application and routes
    config.py         # Configuration management
    db.py             # Database connection
    models.py         # SQLAlchemy models
    schemas.py        # Pydantic schemas
    auth.py           # Authentication middleware
    crud.py           # Database operations
    search.py         # Search functionality
  migrations/         # Alembic migrations
  scripts/
    curl_examples.md  # API testing examples
  requirements.txt    # Python dependencies
  Procfile            # Railway deployment config
  railway.json        # Railway configuration
  alembic.ini         # Alembic configuration
  README.md           # This file
```

## Quick Start

### Prerequisites

- Python 3.9+
- PostgreSQL database
- pip

### Local Development

1. **Clone the repository** (if applicable)

2. **Create a virtual environment**

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**

   Create a `.env` file in the root directory:

   ```env
   # Use DATABASE_URL for local Postgres.
   # If you want to connect from your laptop to Railway Postgres, Railway often provides DATABASE_PUBLIC_URL.
   DATABASE_URL=postgresql://user:password@localhost:5432/jobdiary
   API_KEY=your-secret-api-key-123
   ENV=dev
   CORS_ORIGINS=*
   ```

5. **Run database migrations**

   ```bash
   alembic upgrade head
   ```

   If this is the first time, create the initial migration:

   ```bash
   alembic revision --autogenerate -m "Initial schema"
   alembic upgrade head
   ```

   **Or use the migration script:**
   ```bash
   # Linux/Mac
   bash scripts/migrate.sh
   
   # Windows
   scripts\migrate.bat
   ```

6. **Start the development server**

   **Option 1: Use the startup script (recommended)**
   ```bash
   # Linux/Mac
   bash start.sh
   # or make it executable: chmod +x start.sh && ./start.sh
   
   # Windows
   start.bat
   ```
   
   The startup script will:
   - Check environment variables
   - Run database migrations automatically
   - Start the Uvicorn server
   
   **Option 2: Manual start**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

7. **Access the API**

   - API: http://localhost:8000
   - Interactive docs (Swagger): http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc
   - OpenAPI JSON: http://localhost:8000/openapi.json

## Railway Deployment

### Prerequisites

- Railway account
- Railway CLI (optional)

### Steps

1. **Create a new Railway project**

   - Go to [Railway](https://railway.app)
   - Create a new project
   - Add a PostgreSQL database

2. **Deploy the application**

   - Connect your repository to Railway
   - Railway will automatically detect the `Procfile` which uses `start.sh`
   - The startup script will automatically run migrations and start the server
   - The app will use the `DATABASE_URL` provided by Railway

3. **Set environment variables**

   In Railway dashboard, add:

   - `API_KEY`: Your secret API key (required)
   - `ENV`: `prod` (optional)
   - `CORS_ORIGINS`: Your allowed origins (optional, defaults to `*`)
   - `API_URL`: Your deployed API URL (optional, for OpenAPI servers field - e.g., `https://your-app.railway.app`)

4. **Migrations**

   **Automatic:** The `start.sh` script (used by the `Procfile`) automatically runs migrations on each deploy, so you don't need to run them manually.
   
   **Manual (if needed):**
   
   ```bash
   # Using Railway CLI
   railway run alembic upgrade head

   # Or via Railway dashboard shell
   # Or use the migration script:
   railway run bash scripts/migrate.sh
   ```

   To create an initial migration (first time only):

   ```bash
   railway run alembic revision --autogenerate -m "Initial schema"
   railway run alembic upgrade head
   ```

5. **Access your deployed API**

   - Your API URL will be provided by Railway
   - Access docs at: `https://your-app.railway.app/docs`
   - OpenAPI schema at: `https://your-app.railway.app/openapi.json`

## API Endpoints

### Health

- `GET /health` - Health check (no auth required)

### Jobs

- `POST /jobs` - Create a new job
- `GET /jobs` - List jobs (query: `user_id`, `limit`)
- `GET /jobs/{job_id}` - Get a job by ID (query: `user_id`)
- `PATCH /jobs/{job_id}` - Update a job (query: `user_id`)
- `POST /jobs/{job_id}/state` - Update job state (query: `user_id`)

### Entries

- `POST /entries` - Create a new entry
- `GET /entries` - List entries (query: `user_id`, `job_id`, `limit`)

### Search

- `POST /entries/search` - Search entries by text

### Debrief (Bonus)

- `POST /debrief` - Create or update job debrief

## Authentication

All endpoints (except `/health`) require the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-secret-api-key-123" ...
```

## Testing

See `scripts/curl_examples.md` for comprehensive cURL examples and testing workflows.

### Quick Test

```bash
export API_KEY="your-secret-api-key-123"
export BASE_URL="http://localhost:8000"

# Health check
curl "${BASE_URL}/health"

# Create a job
curl -X POST "${BASE_URL}/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{"user_id": "user123", "name": "Test Job"}'
```

## Database Schema

### Jobs Table

- `id` (UUID) - Primary key
- `user_id` (String) - User identifier
- `name` (Text) - Job name
- `address` (Text, optional) - Job address
- `client_name` (Text, optional) - Client name
- `status` (String) - Job status (quoted, in_progress, complete, on_hold)
- `job_state` (JSONB) - Current job state snapshot
- `created_at` (Timestamp) - Creation timestamp
- `updated_at` (Timestamp) - Last update timestamp

### Entries Table

- `id` (UUID) - Primary key
- `job_id` (UUID) - Foreign key to jobs
- `user_id` (String) - User identifier
- `entry_ts` (Timestamp) - Entry timestamp
- `transcript` (Text) - Voice transcript
- `extracted` (JSONB) - Structured extraction data
- `summary` (Text, optional) - Entry summary
- `created_at` (Timestamp) - Creation timestamp

## Security

- **API Key Authentication**: All endpoints require valid API key
- **User Isolation**: All queries filter by `user_id` to prevent data leakage
- **Input Validation**: Pydantic schemas validate all inputs
- **UUID Validation**: All UUID parameters are validated

## OpenAPI Schema for GPT Actions

The OpenAPI schema is available at `/openapi.json`. This can be used to configure OpenAI Custom GPT Actions.

**Important:** The OpenAPI schema includes a `servers` field. To set your production URL:

1. Set the `API_URL` environment variable to your deployed API URL:
   ```bash
   API_URL=https://your-app.railway.app
   ```

2. If `API_URL` is not set, the schema will include a placeholder URL that you should update manually in the GPT Actions configuration.

Key points for GPT Actions:
- All endpoints require `X-API-Key` header
- User ID is passed as a query parameter or in the request body
- Responses are JSON with clear schemas
- Field descriptions are included for better GPT understanding

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (or use `DATABASE_PUBLIC_URL`) | - |
| `DATABASE_PUBLIC_URL` | No | Alternate DB URL (useful for local dev connecting to Railway) | - |
| `API_KEY` | Yes | API key for authentication | - |
| `ENV` | No | Environment (dev/prod) | `dev` |
| `CORS_ORIGINS` | No | CORS allowed origins | `*` |

## Development

### Running Migrations

```bash
# Create a new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

### Code Structure

- `app/main.py`: FastAPI app and route handlers
- `app/models.py`: SQLAlchemy database models
- `app/schemas.py`: Pydantic request/response schemas
- `app/crud.py`: Database operations
- `app/auth.py`: Authentication middleware
- `app/config.py`: Configuration management

## License

Copyright (c) 2025 Viren Joseph. All rights reserved.

This project is **proprietary**. See `LICENSE`.

Third-party/open source notices: see `THIRD_PARTY_NOTICES.md`.

## Contributing

This is a production-ready API. When making changes:

1. Update migrations for schema changes
2. Update schemas for API changes
3. Test with curl examples
4. Ensure OpenAPI schema is correct

## Support

For issues or questions, please refer to the API documentation at `/docs` or check `scripts/curl_examples.md` for usage examples.

