
"""
LOCUS Agent Engine Deployment App
Deploys the LOCUS ADK agent to Vertex AI Agent Engine.
"""

import copy
import os
from typing import Any

import vertexai
from google.adk.artifacts import GcsArtifactService
from google.cloud import logging as cloud_logging
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from vertexai import agent_engines
from vertexai.preview.reasoning_engines import AdkApp

from app.agent import root_agent
from app.config import FAST_MODEL, APP_NAME

# ---------------------------------------------------------------------
# ADK App Wrapper
# ---------------------------------------------------------------------
class LocusAgentApp(AdkApp):
    def set_up(self) -> None:
        """Initializes logging and tracing for the cloud environment."""
        super().set_up()

        # Initialize Cloud Logging for monitoring
        logging_client = cloud_logging.Client()
        self.logger = logging_client.logger("locus-agent")

        # Initialize Tracing with the SDK exporter
        provider = TracerProvider()
        # Fix: ConsoleSpanExporter is imported from opentelemetry.sdk
        provider.add_span_processor(
            BatchSpanProcessor(ConsoleSpanExporter())
        )
        trace.set_tracer_provider(provider)
        self.enable_tracing = True

    def register_feedback(self, feedback: dict[str, Any]) -> None:
        """Captures user feedback directly into Google Cloud logs."""
        self.logger.log_struct(feedback, severity="INFO")

    def register_operations(self) -> dict[str, list[str]]:
        """Registers custom feedback operations for the agent engine."""
        ops = super().register_operations()
        ops[""] = ops[""] + ["register_feedback"]
        return ops

    def clone(self) -> "LocusAgentApp":
        """Facilitates deep copying of the agent during orchestration."""
        attrs = self._tmpl_attrs
        return self.__class__(
            agent=copy.deepcopy(attrs["agent"]),
            artifact_service_builder=attrs.get("artifact_service_builder"),
            env_vars=attrs.get("env_vars"),
        )


# ---------------------------------------------------------------------
# Deployment Logic
# ---------------------------------------------------------------------
def deploy() -> agent_engines.AgentEngine:
    print("🚀 Starting deployment of LOCUS to Vertex AI Agent Engine")

    # Configuration for Google Cloud resources
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "your-project-id")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    staging_bucket = os.environ.get("GOOGLE_CLOUD_STAGING_BUCKET", f"{project_id}-staging")
    
    # Bucket for storing agent artifacts (HTML reports, images)
    artifacts_bucket = f"{project_id}-{APP_NAME}-artifacts"

    vertexai.init(
        project=project_id,
        location=location,
        staging_bucket=f"gs://{staging_bucket}",
    )

    # Load project dependencies
    requirements_path = ".requirements.txt"
    if os.path.exists(requirements_path):
        with open(requirements_path) as f:
            requirements = f.read().splitlines()
    else:
        requirements = []

    # Explicitly include critical libraries for the cloud runtime
    cloud_dependencies = [
        "google-adk>=1.20.0",
        "google-cloud-aiplatform[adk,agent_engines]>=1.120.0",
        "google-genai>=1.53.0",
        "opentelemetry-api",
        "opentelemetry-sdk", # Required for the exporters in set_up()
    ]
    
    # Merge and deduplicate dependencies
    requirements = list(set(requirements + cloud_dependencies))

    # Initialize the ADK App wrapper
    app = LocusAgentApp(
        agent=root_agent,
        artifact_service_builder=lambda: GcsArtifactService(
            bucket_name=artifacts_bucket
        ),
    )

    # Configuration for the Reasoning Engine deployment
    agent_cfg = {
        "agent_engine": app,
        "display_name": "Locus_Retail_Strategy_Agent",
        "description": "LocusIQ — AI-powered retail location intelligence agent",
        "requirements": requirements,
        "extra_packages": ["app"], # Bundles the local application directory
        "env_vars": {
            "GOOGLE_GENAI_USE_VERTEXAI": "TRUE",
            "APP_NAME": APP_NAME,
        },
    }

    # Retrieve existing engine or create a new one
    deployment_name = agent_cfg["display_name"]
    existing_agents = list(agent_engines.list(filter=f"display_name={deployment_name}"))

    if existing_agents:
        print(f"🔄 Updating existing agent resource: {existing_agents[0].resource_name}")
        engine = existing_agents[0].update(**agent_cfg)
    else:
        print(f"🆕 Registering new agent: {deployment_name}")
        engine = agent_engines.create(**agent_cfg)

    print("✅ Deployment process complete")
    print(f"🆔 Engine Resource ID: {engine.resource_name}")

    return engine


if __name__ == "__main__":
    deploy()
    
    
# run_command=uv run app/agent_engine_app.py