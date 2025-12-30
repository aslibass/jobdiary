"""Configuration management for the JobDiary API."""

from pydantic_settings import BaseSettings
from typing import Optional
from urllib.parse import urlparse


def normalize_api_url(raw: Optional[str]) -> Optional[str]:
    """
    Normalize API base URL for OpenAPI `servers`.

    - Accepts values like:
      - https://example.com
      - https://example.com/
      - https://example.com/openapi.json   (path is stripped)
      - example.com                        (assumes https://)
    - Returns scheme://host (no path/query/fragment), or None if invalid.
    """
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None

    if "://" not in raw:
        raw = f"https://{raw}"

    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        return None

    return f"{parsed.scheme}://{parsed.netloc}"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    database_url: str
    
    # Security
    api_key: str
    
    # Environment
    env: str = "dev"
    
    # CORS
    cors_origins: str = "*"
    
    # API URL for OpenAPI servers (optional, defaults to relative)
    api_url: Optional[str] = None
    
    # App metadata
    app_name: str = "JobDiary API"
    app_version: str = "1.0.0"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()

