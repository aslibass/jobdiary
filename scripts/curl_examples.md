# JobDiary API - cURL Examples

This document provides cURL examples for testing the JobDiary API.

## Prerequisites

Set the following environment variables or replace in commands:
- `API_KEY`: Your API key (e.g., "your-secret-api-key-123")
- `BASE_URL`: Your API base URL (e.g., "http://localhost:8000" or "https://your-app.railway.app")
- `USER_ID`: A user identifier (e.g., "user123")
- `JOB_ID`: A job UUID (will be obtained from create operations)

## Health Check

```bash
# Health check (no auth required)
curl -X GET "${BASE_URL}/health"
```

## Jobs

### Create a Job

```bash
curl -X POST "${BASE_URL}/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "user123",
    "name": "Kitchen Renovation",
    "address": "123 Main St, City",
    "client_name": "John Doe"
  }'
```

### List Jobs

```bash
curl -X GET "${BASE_URL}/jobs?user_id=${USER_ID}&limit=20" \
  -H "X-API-Key: ${API_KEY}"
```

### Get a Job

```bash
curl -X GET "${BASE_URL}/jobs/${JOB_ID}?user_id=${USER_ID}" \
  -H "X-API-Key: ${API_KEY}"
```

### Update a Job

```bash
curl -X PATCH "${BASE_URL}/jobs/${JOB_ID}?user_id=${USER_ID}" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "status": "in_progress",
    "name": "Updated Kitchen Renovation"
  }'
```

### Update Job State

```bash
curl -X POST "${BASE_URL}/jobs/${JOB_ID}/state?user_id=${USER_ID}" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "patch": {
      "weather": "sunny",
      "progress": "50%",
      "materials_ordered": true
    },
    "reason": "End of day update"
  }'
```

## Entries

### Create an Entry

```bash
curl -X POST "${BASE_URL}/entries" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "user123",
    "job_id": "'"${JOB_ID}"'",
    "transcript": "Finished installing cabinets today. All measurements were correct. Need to order handles next week.",
    "summary": "Cabinet installation complete, handles needed",
    "extracted": {
      "tasks_completed": ["cabinet_installation"],
      "next_actions": ["order_handles"],
      "materials_needed": ["handles"]
    }
  }'
```

### List Entries

```bash
curl -X GET "${BASE_URL}/entries?user_id=${USER_ID}&job_id=${JOB_ID}&limit=20" \
  -H "X-API-Key: ${API_KEY}"
```

## Search

### Search Entries

```bash
curl -X POST "${BASE_URL}/entries/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "user123",
    "job_id": "'"${JOB_ID}"'",
    "query": "cabinets",
    "limit": 10
  }'
```

## Debrief (Bonus Endpoint)

### Create Debrief

```bash
# Using job name (will create if doesn't exist)
curl -X POST "${BASE_URL}/debrief" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "user123",
    "job_name_or_id": "Kitchen Renovation",
    "transcript": "Day 3 update: All drywall is up. Starting painting tomorrow morning."
  }'

# Using job ID
curl -X POST "${BASE_URL}/debrief" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "user123",
    "job_name_or_id": "'"${JOB_ID}"'",
    "transcript": "Day 4 update: First coat of paint applied. Looks great!"
  }'
```

## Complete Workflow Example

```bash
# Set variables
export API_KEY="your-secret-api-key-123"
export BASE_URL="http://localhost:8000"
export USER_ID="user123"

# 1. Create a job
JOB_RESPONSE=$(curl -s -X POST "${BASE_URL}/jobs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "'"${USER_ID}"'",
    "name": "Bathroom Remodel",
    "address": "456 Oak Ave",
    "client_name": "Jane Smith"
  }')

# Extract job ID (requires jq or manual extraction)
JOB_ID=$(echo $JOB_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Created job: ${JOB_ID}"

# 2. Create an entry
curl -X POST "${BASE_URL}/entries" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "'"${USER_ID}"'",
    "job_id": "'"${JOB_ID}"'",
    "transcript": "Removed old tiles and fixtures. Floor is ready for new tiles.",
    "summary": "Demolition complete, ready for tiling",
    "extracted": {
      "stage": "demolition_complete",
      "next": "tile_installation"
    }
  }'

# 3. Update job state
curl -X POST "${BASE_URL}/jobs/${JOB_ID}/state?user_id=${USER_ID}" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "patch": {
      "stage": "demolition_complete",
      "ready_for_tiling": true
    }
  }'

# 4. Search entries
curl -X POST "${BASE_URL}/entries/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "user_id": "'"${USER_ID}"'",
    "job_id": "'"${JOB_ID}"'",
    "query": "tiles",
    "limit": 5
  }'

# 5. List all jobs
curl -X GET "${BASE_URL}/jobs?user_id=${USER_ID}" \
  -H "X-API-Key: ${API_KEY}"
```

## Error Examples

### Missing API Key

```bash
curl -X GET "${BASE_URL}/jobs?user_id=${USER_ID}"
# Returns 401 Unauthorized
```

### Invalid API Key

```bash
curl -X GET "${BASE_URL}/jobs?user_id=${USER_ID}" \
  -H "X-API-Key: wrong-key"
# Returns 401 Unauthorized
```

### Missing User ID

```bash
curl -X GET "${BASE_URL}/jobs" \
  -H "X-API-Key: ${API_KEY}"
# Returns 422 Validation Error
```

## OpenAPI Documentation

Access the interactive API documentation:

```bash
# Swagger UI
open "${BASE_URL}/docs"

# ReDoc
open "${BASE_URL}/redoc"

# OpenAPI JSON schema (for GPT Actions)
curl "${BASE_URL}/openapi.json"
```

