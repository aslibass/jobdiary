"""SQLAlchemy database models."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from app.db import Base


class Job(Base):
    """Job model representing a tradie job."""
    
    __tablename__ = "jobs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False, index=True)
    name = Column(Text, nullable=False)
    address = Column(Text, nullable=True)
    client_name = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="in_progress", index=True)
    job_state = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    __table_args__ = (
        Index("idx_jobs_user_updated", "user_id", "updated_at", postgresql_ops={"updated_at": "DESC"}),
    )


class Entry(Base):
    """Voice diary entry model for a job."""
    
    __tablename__ = "entries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    entry_ts = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    transcript = Column(Text, nullable=False)
    extracted = Column(JSONB, nullable=False, default=dict)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    __table_args__ = (
        Index("idx_entries_job_ts", "job_id", "entry_ts", postgresql_ops={"entry_ts": "DESC"}),
        Index("idx_entries_extracted_gin", "extracted", postgresql_using="gin"),
        # Optional trigram index for full-text search (requires pg_trgm extension)
        # Index("idx_entries_transcript_trgm", "transcript", postgresql_using="gin", postgresql_ops={"transcript": "gin_trgm_ops"}),
    )

