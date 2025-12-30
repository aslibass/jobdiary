"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional, Any, Dict
from uuid import UUID
from pydantic import BaseModel, Field


# Job Schemas
class JobCreate(BaseModel):
    """Schema for creating a new job."""
    user_id: str = Field(..., description="User identifier")
    name: str = Field(..., description="Job name")
    address: Optional[str] = Field(None, description="Job address")
    client_name: Optional[str] = Field(None, description="Client name")


class JobUpdate(BaseModel):
    """Schema for updating a job."""
    status: Optional[str] = Field(None, description="Job status: quoted, in_progress, complete, on_hold")
    name: Optional[str] = Field(None, description="Job name")
    address: Optional[str] = Field(None, description="Job address")
    client_name: Optional[str] = Field(None, description="Client name")


class JobResponse(BaseModel):
    """Schema for job response."""
    id: UUID
    user_id: str
    name: str
    address: Optional[str]
    client_name: Optional[str]
    status: str
    job_state: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Entry Schemas
class EntryCreate(BaseModel):
    """Schema for creating a new entry."""
    user_id: str = Field(..., description="User identifier")
    job_id: UUID = Field(..., description="Job ID")
    transcript: str = Field(..., description="Voice transcript text")
    extracted: Optional[Dict[str, Any]] = Field(None, description="Structured extraction data")
    summary: Optional[str] = Field(None, description="Entry summary")
    entry_ts: Optional[datetime] = Field(None, description="Entry timestamp (defaults to now)")


class EntryResponse(BaseModel):
    """Schema for entry response."""
    id: UUID
    job_id: UUID
    user_id: str
    entry_ts: datetime
    transcript: str
    extracted: Dict[str, Any]
    summary: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class EntryListResponse(BaseModel):
    """Schema for entry list response (simplified)."""
    id: UUID
    entry_ts: datetime
    summary: Optional[str]
    extracted: Dict[str, Any]
    
    class Config:
        from_attributes = True


# Job State Update Schema
class JobStateUpdate(BaseModel):
    """Schema for updating job state."""
    patch: Dict[str, Any] = Field(..., description="Object to merge into job_state (shallow merge)")
    reason: Optional[str] = Field(None, description="Reason for state update")


class JobStateUpdateResponse(BaseModel):
    """Schema for job state update response."""
    ok: bool
    updated_at: datetime


# Search Schema
class EntrySearch(BaseModel):
    """Schema for entry search request."""
    user_id: str = Field(..., description="User identifier")
    job_id: UUID = Field(..., description="Job ID")
    query: str = Field(..., description="Search query text")
    limit: int = Field(10, ge=1, le=100, description="Maximum number of results")


class EntrySearchResponse(BaseModel):
    """Schema for entry search response."""
    id: UUID
    entry_ts: datetime
    summary: Optional[str]
    
    class Config:
        from_attributes = True


# Debrief Schema (bonus)
class DebriefCreate(BaseModel):
    """Schema for debrief endpoint."""
    user_id: str = Field(..., description="User identifier")
    job_name_or_id: str = Field(..., description="Job name or UUID")
    transcript: str = Field(..., description="Voice transcript text")


class DebriefResponse(BaseModel):
    """Schema for debrief response."""
    job: JobResponse
    entry: EntryResponse

