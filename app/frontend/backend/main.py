# """FastAPI server wrapping ADK agent with AG-UI middleware.

# This server provides an AG-UI compatible endpoint that wraps the existing
# LocationStrategyPipeline agent without modifying any core agent files.

# Usage:
#     cd app/frontend/backend
#     pip install -r requirements.txt
#     python main.py

#     # Or with uv:
#     uv pip install -r requirements.txt
#     uv run python main.py
# """

# import os
# import sys
# from pathlib import Path

# import uvicorn
# from dotenv import load_dotenv
# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware

# # Add app directory to path for imports
# # Structure: app/frontend/backend/main.py
# app_dir = Path(__file__).parent.parent.parent  # app/
# project_root = app_dir.parent  # retail-ai-location-strategy/
# sys.path.insert(0, str(project_root))

# # Load environment variables from app/.env
# env_path = app_dir / ".env"
# if env_path.exists():
#     load_dotenv(env_path)

# # Import AG-UI middleware (CopilotKit official package)
# from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint

# # Import the EXISTING root_agent - no modifications needed
# from app.agent import root_agent

# # Create AG-UI wrapper around the existing ADK agent
# # Increase timeout for Strategy Synthesis which uses extended thinking
# adk_agent = ADKAgent(
#     adk_agent=root_agent,
#     app_name="locus",
#     user_id="demo_user",
#     execution_timeout_seconds=1800,  # 30 minutes for full pipeline
#     tool_timeout_seconds=600,  # 10 minutes for individual tools
# )

# # Create FastAPI app
# app = FastAPI(
#     title="Locus API",
#     description="AG-UI compatible API for Locus AI Location Strategy agent",
#     version="1.0.0",
# )

# # CORS configuration for frontend
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[
#         "http://localhost:3000",
#         "http://127.0.0.1:3000",
#     ],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


# @app.get("/health")
# async def health_check():
#     """Health check endpoint."""
#     return {"status": "healthy", "agent": "LocationStrategyPipeline"}

 
# # Add AG-UI endpoint at root path
# # This handles all AG-UI protocol communication
# add_adk_fastapi_endpoint(app, adk_agent, path="/")


# if __name__ == "__main__":
#     port = int(os.environ.get("PORT", 8000))
#     print(f"Starting AG-UI server at http://0.0.0.0:{port}")
#     print("Frontend should connect to this URL")
#     uvicorn.run(app, host="0.0.0.0", port=port)

import os
import sys
from pathlib import Path
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint

# 1. Setup Paths
app_dir = Path(__file__).parent.parent.parent  # app/
project_root = app_dir.parent  # retail-ai-location-strategy/
sys.path.insert(0, str(project_root))

# 2. Load Env
env_path = app_dir / ".env"
if env_path.exists():
    load_dotenv(env_path)

# 3. Import Agent
try:
    from app.agent import root_agent
except ImportError as e:
    print(f"Error importing agent: {e}")
    sys.exit(1)

# 4. Initialize Wrapper
adk_agent = ADKAgent(
    adk_agent=root_agent,
    app_name="locus",
    user_id="demo_user",
    execution_timeout_seconds=1800,
    tool_timeout_seconds=600,
)

# 5. Create App
app = FastAPI(
    title="Locus API",
    description="AG-UI compatible API for Locus AI Location Strategy agent",
    version="1.0.0",
)

# 6. Unified CORS Configuration
# allowing "*" is fine for testing, but in production you can restrict this list
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://locus-ai.vercel.app",  # Example: Add your real Vercel domain here if known
    "*"  # Allows all domains (easiest for initial setup)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "agent": "LocationStrategyPipeline"}

# 7. Add Endpoint
add_adk_fastapi_endpoint(app, adk_agent, path="/")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    # In Cloud Run, PORT is set automatically. Locally it defaults to 8000.
    uvicorn.run(app, host="0.0.0.0", port=port)