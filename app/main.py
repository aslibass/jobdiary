"""Main FastAPI application."""

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db, Base, engine
from app.models import Job, Entry
from app.schemas import (
    JobCreate, JobUpdate, JobResponse,
    EntryCreate, EntryResponse, EntryListResponse,
    JobStateUpdate, JobStateUpdateResponse,
    EntrySearch, EntrySearchResponse,
    DebriefCreate, DebriefResponse
)
from app.auth import verify_api_key
from app.crud import (
    create_job, get_job, list_jobs, update_job, update_job_state, get_job_by_name,
    create_entry, list_entries, search_entries
)

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="A conversational job diary API for tradies",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(",") if "," in settings.cors_origins else [settings.cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependency for protected routes
def get_current_user(api_key: str = Depends(verify_api_key)) -> str:
    """Dependency that returns after verifying API key."""
    return "authenticated"


@app.on_event("startup")
async def startup_event():
    """Initialize database tables on startup."""
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint (no auth required)."""
    return {
        "ok": True,
        "ts": datetime.now(timezone.utc).isoformat(),
        "version": settings.app_version
    }


# Job endpoints
@app.post("/jobs", response_model=JobResponse, status_code=status.HTTP_201_CREATED, tags=["Jobs"])
async def create_job_endpoint(
    job_data: JobCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """Create a new job."""
    job = create_job(
        db=db,
        user_id=job_data.user_id,
        name=job_data.name,
        address=job_data.address,
        client_name=job_data.client_name
    )
    return job


@app.get("/jobs", response_model=List[JobResponse], tags=["Jobs"])
async def list_jobs_endpoint(
    user_id: str = Query(..., description="User identifier"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """List jobs for a user, ordered by most recently updated."""
    jobs = list_jobs(db=db, user_id=user_id, limit=limit)
    return jobs


@app.get("/jobs/{job_id}", response_model=JobResponse, tags=["Jobs"])
async def get_job_endpoint(
    job_id: UUID,
    user_id: str = Query(..., description="User identifier"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """Get a job by ID."""
    job = get_job(db=db, job_id=job_id, user_id=user_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    return job


@app.patch("/jobs/{job_id}", response_model=JobResponse, tags=["Jobs"])
async def update_job_endpoint(
    job_id: UUID,
    job_data: JobUpdate,
    user_id: str = Query(..., description="User identifier"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """Update a job."""
    job = update_job(
        db=db,
        job_id=job_id,
        user_id=user_id,
        status=job_data.status,
        name=job_data.name,
        address=job_data.address,
        client_name=job_data.client_name
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    return job


@app.post("/jobs/{job_id}/state", response_model=JobStateUpdateResponse, tags=["Jobs"])
async def update_job_state_endpoint(
    job_id: UUID,
    state_data: JobStateUpdate,
    user_id: str = Query(..., description="User identifier"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """Update job state by merging patch."""
    job = update_job_state(
        db=db,
        job_id=job_id,
        user_id=user_id,
        patch=state_data.patch
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    return JobStateUpdateResponse(ok=True, updated_at=job.updated_at)


# Entry endpoints
@app.post("/entries", response_model=EntryResponse, status_code=status.HTTP_201_CREATED, tags=["Entries"])
async def create_entry_endpoint(
    entry_data: EntryCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """Create a new entry."""
    try:
        entry = create_entry(
            db=db,
            user_id=entry_data.user_id,
            job_id=entry_data.job_id,
            transcript=entry_data.transcript,
            extracted=entry_data.extracted,
            summary=entry_data.summary,
            entry_ts=entry_data.entry_ts
        )
        return entry
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@app.get("/entries", response_model=List[EntryListResponse], tags=["Entries"])
async def list_entries_endpoint(
    user_id: str = Query(..., description="User identifier"),
    job_id: UUID = Query(..., description="Job ID"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """List entries for a job, ordered by newest first."""
    entries = list_entries(db=db, user_id=user_id, job_id=job_id, limit=limit)
    return entries


# Search endpoint
@app.post("/entries/search", response_model=List[EntrySearchResponse], tags=["Search"])
async def search_entries_endpoint(
    search_data: EntrySearch,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """Search entries by transcript and summary."""
    entries = search_entries(
        db=db,
        user_id=search_data.user_id,
        job_id=search_data.job_id,
        query=search_data.query,
        limit=search_data.limit
    )
    return entries


# Debrief endpoint (bonus)
@app.post("/debrief", response_model=DebriefResponse, status_code=status.HTTP_201_CREATED, tags=["Debrief"])
async def debrief_endpoint(
    debrief_data: DebriefCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user)
):
    """
    Create or update a job debrief.
    If job_name_or_id is a UUID, use it. Otherwise, look up or create job by name.
    """
    # Try to parse as UUID
    job = None
    try:
        job_id = UUID(debrief_data.job_name_or_id)
        job = get_job(db=db, job_id=job_id, user_id=debrief_data.user_id)
    except ValueError:
        # Not a UUID, treat as name
        job = get_job_by_name(db=db, user_id=debrief_data.user_id, name=debrief_data.job_name_or_id)
        if not job:
            # Create new job
            job = create_job(
                db=db,
                user_id=debrief_data.user_id,
                name=debrief_data.job_name_or_id
            )
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found and could not be created"
        )
    
    # Create entry
    try:
        entry = create_entry(
            db=db,
            user_id=debrief_data.user_id,
            job_id=job.id,
            transcript=debrief_data.transcript,
            extracted={},
            summary=None
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Update job state with heuristic
    state_patch = {
        "last_debrief_ts": datetime.now(timezone.utc).isoformat(),
        "last_summary": debrief_data.transcript[:200] if len(debrief_data.transcript) > 200 else debrief_data.transcript
    }
    
    # If extracted contains next_actions, add it
    # For now, we'll just update the state
    job = update_job_state(db=db, job_id=job.id, user_id=debrief_data.user_id, patch=state_patch)
    
    return DebriefResponse(job=job, entry=entry)

