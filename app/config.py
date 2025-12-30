"""Configuration management for the JobDiary API."""

from pydantic_settings import BaseSettings
from typing import Optional


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
    
    # App metadata
    app_name: str = "JobDiary API"
    app_version: str = "1.0.0"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()

