"""CRUD operations for jobs and entries."""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from app.models import Job, Entry


# Job CRUD
def create_job(db: Session, user_id: str, name: str, address: Optional[str] = None, 
               client_name: Optional[str] = None) -> Job:
    """Create a new job."""
    job = Job(
        user_id=user_id,
        name=name,
        address=address,
        client_name=client_name,
        status="in_progress",
        job_state={}
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job(db: Session, job_id: UUID, user_id: str) -> Optional[Job]:
    """Get a job by ID, ensuring it belongs to the user."""
    return db.query(Job).filter(Job.id == job_id, Job.user_id == user_id).first()


def list_jobs(db: Session, user_id: str, limit: int = 20) -> List[Job]:
    """List jobs for a user, ordered by most recently updated."""
    return db.query(Job).filter(
        Job.user_id == user_id
    ).order_by(desc(Job.updated_at)).limit(limit).all()


def update_job(db: Session, job_id: UUID, user_id: str, 
               status: Optional[str] = None, name: Optional[str] = None,
               address: Optional[str] = None, client_name: Optional[str] = None) -> Optional[Job]:
    """Update a job, ensuring it belongs to the user."""
    job = get_job(db, job_id, user_id)
    if not job:
        return None
    
    if status is not None:
        job.status = status
    if name is not None:
        job.name = name
    if address is not None:
        job.address = address
    if client_name is not None:
        job.client_name = client_name
    
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job


def update_job_state(db: Session, job_id: UUID, user_id: str, patch: Dict[str, Any]) -> Optional[Job]:
    """Update job state by merging patch (shallow merge)."""
    job = get_job(db, job_id, user_id)
    if not job:
        return None
    
    # Shallow merge
    current_state = job.job_state or {}
    current_state.update(patch)
    job.job_state = current_state
    job.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(job)
    return job


def get_job_by_name(db: Session, user_id: str, name: str) -> Optional[Job]:
    """Get a job by name for a user (for debrief endpoint)."""
    return db.query(Job).filter(Job.user_id == user_id, Job.name == name).first()


# Entry CRUD
def create_entry(db: Session, user_id: str, job_id: UUID, transcript: str,
                 extracted: Optional[Dict[str, Any]] = None, summary: Optional[str] = None,
                 entry_ts: Optional[datetime] = None) -> Entry:
    """Create a new entry."""
    # Verify job belongs to user
    job = get_job(db, job_id, user_id)
    if not job:
        raise ValueError(f"Job {job_id} not found for user {user_id}")
    
    entry = Entry(
        job_id=job_id,
        user_id=user_id,
        transcript=transcript,
        extracted=extracted or {},
        summary=summary,
        entry_ts=entry_ts or datetime.now(timezone.utc)
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_entries(db: Session, user_id: str, job_id: UUID, limit: int = 20) -> List[Entry]:
    """List entries for a job, ordered by newest first."""
    # Verify job belongs to user
    job = get_job(db, job_id, user_id)
    if not job:
        return []
    
    return db.query(Entry).filter(
        Entry.job_id == job_id,
        Entry.user_id == user_id
    ).order_by(desc(Entry.entry_ts)).limit(limit).all()


def search_entries(db: Session, user_id: str, job_id: UUID, query: str, limit: int = 10) -> List[Entry]:
    """
    Search entries by transcript and summary.
    Uses ILIKE for case-insensitive pattern matching.
    """
    # Verify job belongs to user
    job = get_job(db, job_id, user_id)
    if not job:
        return []
    
    search_pattern = f"%{query}%"
    return db.query(Entry).filter(
        Entry.job_id == job_id,
        Entry.user_id == user_id,
        or_(
            Entry.transcript.ilike(search_pattern),
            Entry.summary.ilike(search_pattern)
        )
    ).order_by(desc(Entry.entry_ts)).limit(limit).all()

