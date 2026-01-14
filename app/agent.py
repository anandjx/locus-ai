"""Locus Agent - Root Agent Definition.

This module defines the root agent for the Location Strategy Pipeline.
It uses a SequentialAgent to orchestrate 6 specialized sub-agents:

1. MarketResearchAgent - Live web research with Google Search
2. CompetitorMappingAgent - Competitor mapping with Maps Places API
3. GapAnalysisAgent - Quantitative analysis with Python code execution
4. StrategyAdvisorAgent - Strategic synthesis with extended reasoning
5. ReportGeneratorAgent - HTML executive report generation
6. InfographicGeneratorAgent - Visual infographic generation

The pipeline analyzes a target location for a specific business type and
produces comprehensive location intelligence including recommendations,
an HTML report, and an infographic.

Authentication:
    Uses Google AI Studio (API key) instead of Vertex AI.
    Set environment variables:
        GOOGLE_API_KEY=your_api_key
        GOOGLE_GENAI_USE_VERTEXAI=FALSE
        MAPS_API_KEY=your_maps_api_key

Usage:
    Run with: adk web locus_adk

    The agent expects initial state variables:
    - target_location: The geographic area to analyze (e.g., "Bangalore, India")
    - business_type: Type of business to open (e.g., "coffee shop")

    Optional state variables:
    - maps_api_key: Google Maps API key for Places search
"""

from google.adk.agents import SequentialAgent
from google.adk.agents.llm_agent import Agent
from google.adk.tools.agent_tool import AgentTool


from .sub_agents.intake_agent.agent import intake_agent
from .sub_agents.market_research.agent import market_research_agent
from .sub_agents.competitor_mapping.agent import competitor_mapping_agent
from .sub_agents.gap_analysis.agent import gap_analysis_agent
from .sub_agents.strategy_advisor.agent import strategy_advisor_agent
from .sub_agents.infographic_generator.agent import infographic_generator_agent
from .sub_agents.report_generator.agent import report_generator_agent

from .config import FAST_MODEL, APP_NAME

# location_strategy_pipeline
location_strategy_pipeline = SequentialAgent(
    name="LocationStrategyPipeline",
    description="""Comprehensive retail location strategy analysis pipeline.

This agent analyzes a target location for a specific business type and produces:
1. Market research findings from live web data
2. Competitor mapping from Google Maps Places API
3. Quantitative gap analysis with zone rankings
4. Strategic recommendations with structured JSON output
5. Professional HTML executive report
6. Visual infographic summary

To use, get the following details:
- target_location: {target_location}
- business_type: {business_type}

The analysis runs automatically through all stages and produces artifacts
including JSON report, HTML report, and infographic image.
""",
    sub_agents=[
        market_research_agent,      # Part 1: Market research with search
        competitor_mapping_agent,   # Part 2A: Competitor mapping with Maps
        gap_analysis_agent,         # Part 2B: Gap analysis with code exec
        strategy_advisor_agent,     # Part 3: Strategy synthesis
        report_generator_agent,     # Part 4: HTML report generation
        infographic_generator_agent,  # Part 5: Infographic generation
    ],
)

# Root agent orchestrating the complete location strategy pipeline
root_agent = Agent(
    model=FAST_MODEL,
    name=APP_NAME,
    description='A strategic partner for retail businesses, guiding them to optimal physical locations that foster growth and profitability.',
    instruction="""Your primary role is to orchestrate the retail location analysis.
    Your persona is a Premier Retail Strategy Analyst—elite, data-driven, and visionary for the brand Intsemble.
1. Start by greeting the user with a high-energy, professional welcome that positions you as a leading expert in retail location intelligence. Tell them you are ready to engineer their market dominance.
2. Check if the `TARGET_LOCATION` (Geographic area to analyze (e.g., "Park-Street, Kolkata")) and `BUSINESS_TYPE` (Type of business (e.g., "coffee shop", "bakery", "gym")) have been provided.
3. If they are missing, or you are in doubt and you cannot parse or understand the `TARGET_LOCATION` or `BUSINESS_TYPE`, clearly **ask the user clarifying questions to get the required information.**
4. Once you have the necessary details, call the `IntakeAgent` tool to process them.
5. After the `IntakeAgent` is successful, delegate the full analysis to the `LocationStrategyPipeline`.
Your main function is to manage this workflow conversationally.""",
    tools = [AgentTool(intake_agent)], # Part 0: Parse user request
    sub_agents=[location_strategy_pipeline],
)