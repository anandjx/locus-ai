"""
Central configuration for LOCUS ADK agent.

Supports:
- Local development (AI Studio)
- Vertex AI Agent Engine (production)
- Backward compatibility with existing sub-agents
"""

import os
from dataclasses import dataclass
from pathlib import Path

import google.auth
import vertexai
from dotenv import load_dotenv

# =============================================================================
# Load environment variables (.env is local-only)
# =============================================================================

env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

# =============================================================================
# Detect execution mode
# =============================================================================

USE_VERTEX_AI = os.environ.get(
    "GOOGLE_GENAI_USE_VERTEXAI", "FALSE"
).upper() == "TRUE"

# =============================================================================
# Dataclass-based configuration (modern)
# =============================================================================

@dataclass
class AgentConfig:
    # Identity
    APP_NAME: str = "locus"
    DEPLOYMENT_NAME: str = os.environ.get("AGENT_NAME", "locus-agent")

    # Models
    FAST_MODEL: str = "gemini-2.5-flash-lite"
    MID_MODEL: str = "gemini-2.5-flash-lite"
    PRO_MODEL: str = "gemini-2.5-pro"
    IMAGE_MODEL: str = "gemini-2.5-flash-image"
    CODE_EXEC_MODEL: str = "gemini-2.5-pro"

    # Retry policy
    RETRY_INITIAL_DELAY: int = 5
    RETRY_ATTEMPTS: int = 5
    RETRY_MAX_DELAY: int = 60

    # Cloud
    GOOGLE_CLOUD_PROJECT: str | None = None
    GOOGLE_CLOUD_LOCATION: str = "us-central1"
    GOOGLE_CLOUD_STAGING_BUCKET: str | None = None

    # Auth
    GOOGLE_API_KEY: str = ""
    MAPS_API_KEY: str = os.environ.get("MAPS_API_KEY", "")

    def __post_init__(self) -> None:
        if USE_VERTEX_AI:
            # Vertex AI mode
            self.GOOGLE_CLOUD_PROJECT = os.environ.get(
                "GOOGLE_CLOUD_PROJECT"
            )

            if not self.GOOGLE_CLOUD_PROJECT:
                try:
                    _, self.GOOGLE_CLOUD_PROJECT = google.auth.default()
                except Exception:
                    pass

            if not self.GOOGLE_CLOUD_PROJECT:
                raise RuntimeError(
                    "GOOGLE_CLOUD_PROJECT must be set for Vertex AI"
                )

            self.GOOGLE_CLOUD_LOCATION = os.environ.get(
                "GOOGLE_CLOUD_LOCATION", self.GOOGLE_CLOUD_LOCATION
            )

            self.GOOGLE_CLOUD_STAGING_BUCKET = os.environ.get(
                "GOOGLE_CLOUD_STAGING_BUCKET"
            )

            if not self.GOOGLE_CLOUD_STAGING_BUCKET:
                raise RuntimeError(
                    "GOOGLE_CLOUD_STAGING_BUCKET is required for Agent Engine"
                )

            vertexai.init(
                project=self.GOOGLE_CLOUD_PROJECT,
                location=self.GOOGLE_CLOUD_LOCATION,
                staging_bucket=f"gs://{self.GOOGLE_CLOUD_STAGING_BUCKET}",
            )

            # API key not used in Vertex AI mode
            self.GOOGLE_API_KEY = ""

        else:
            # Local / AI Studio mode
            self.GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
            self.GOOGLE_CLOUD_PROJECT = ""
            self.GOOGLE_CLOUD_LOCATION = ""

# Instantiate config
config = AgentConfig()

# =============================================================================
# BACKWARD-COMPATIBLE MODULE CONSTANTS (CRITICAL)
# =============================================================================
# ⚠️ These are intentionally duplicated so existing imports keep working

APP_NAME = config.APP_NAME

FAST_MODEL = config.FAST_MODEL
MID_MODEL = config.MID_MODEL
PRO_MODEL = config.PRO_MODEL
IMAGE_MODEL = config.IMAGE_MODEL
CODE_EXEC_MODEL = config.CODE_EXEC_MODEL

RETRY_INITIAL_DELAY = config.RETRY_INITIAL_DELAY
RETRY_ATTEMPTS = config.RETRY_ATTEMPTS
RETRY_MAX_DELAY = config.RETRY_MAX_DELAY

GOOGLE_API_KEY = config.GOOGLE_API_KEY
GOOGLE_CLOUD_PROJECT = config.GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION = config.GOOGLE_CLOUD_LOCATION
MAPS_API_KEY = config.MAPS_API_KEY
