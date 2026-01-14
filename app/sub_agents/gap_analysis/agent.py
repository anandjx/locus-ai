# """Gap Analysis Agent - Part 2B of the Location Strategy Pipeline.

# This agent performs quantitative gap analysis using Python code execution
# to calculate saturation indices, viability scores, and zone rankings.
# """

# from google.adk.agents import LlmAgent
# from google.adk.code_executors import BuiltInCodeExecutor
# from google.genai import types

# from ...config import CODE_EXEC_MODEL, RETRY_INITIAL_DELAY, RETRY_ATTEMPTS
# from ...callbacks import before_gap_analysis, after_gap_analysis


# GAP_ANALYSIS_INSTRUCTION = """You are a data scientist analyzing market opportunities using quantitative methods.

# Your task is to perform advanced gap analysis on the data collected from previous stages.

# TARGET LOCATION: {target_location}
# BUSINESS TYPE: {business_type}
# CURRENT DATE: {current_date}

# ## Available Data

# ### MARKET RESEARCH FINDINGS (Part 1):
# {market_research_findings}

# ### COMPETITOR ANALYSIS (Part 2):
# {competitor_analysis}

# ## Your Mission
# Write and execute Python code to perform comprehensive quantitative analysis.

# ## Analysis Steps

# ### Step 1: Parse Competitor Data
# Extract from the competitor analysis:
# - Competitor names and locations
# - Ratings and review counts
# - Zone/area classifications
# - Business types (chain vs independent)

# ### Step 2: Extract Market Fundamentals
# From the market research:
# - Population estimates
# - Income levels (assign numeric scores)
# - Infrastructure quality indicators
# - Foot traffic patterns

# ### Step 3: Calculate Zone Metrics
# For each identified zone, compute:

# **Basic Metrics:**
# - Competitor count
# - Competitor density (per estimated area)
# - Average competitor rating
# - Total review volume

# **Quality Metrics:**
# - Competition Quality Score: Weighted by ratings (4.5+ = high threat)
# - Chain Dominance Ratio: % of chain/franchise competitors
# - High Performer Count: Number of 4.5+ rated competitors

# **Opportunity Metrics:**
# - Demand Signal: Based on population, income, infrastructure
# - Market Saturation Index: (Competitors × Quality) / Demand
# - Viability Score: Multi-factor weighted score

# ### Step 4: Zone Categorization
# Classify each zone as:
# - **SATURATED**: High competition, low opportunity
# - **MODERATE**: Balanced market, moderate opportunity
# - **OPPORTUNITY**: Low competition, high potential

# Also assign:
# - Risk Level: Low / Medium / High
# - Investment Tier: Based on expected costs
# - Best Customer Segment: Target demographic

# ### Step 5: Rank Top Zones
# Create a weighted ranking considering:
# - Low market saturation (weight: 30%)
# - High demand signals (weight: 30%)
# - Low chain dominance (weight: 15%)
# - Infrastructure quality (weight: 15%)
# - Manageable costs (weight: 10%)

# ### Step 6: Output Tables
# Generate clear output tables showing:
# 1. All zones with computed metrics
# 2. Top 3 recommended zones with scores
# 3. Risk assessment matrix

# ## Code Guidelines
# - Use pandas for data manipulation
# - Print all results clearly formatted
# - Include intermediate calculations for transparency
# - Handle missing data gracefully

# Execute the code and provide actionable strategic recommendations based on the quantitative findings.
# """

# gap_analysis_agent = LlmAgent(
#     name="GapAnalysisAgent",
#     model=CODE_EXEC_MODEL,
#     description="Performs quantitative gap analysis using Python code execution for zone rankings and viability scores",
#     instruction=GAP_ANALYSIS_INSTRUCTION,
#     generate_content_config=types.GenerateContentConfig(
#         http_options=types.HttpOptions(
#             retry_options=types.HttpRetryOptions(
#                 initial_delay=RETRY_INITIAL_DELAY,
#                 attempts=RETRY_ATTEMPTS,
#             ),
#         ),
#     ),
#     code_executor=BuiltInCodeExecutor(),
#     output_key="gap_analysis",
#     before_agent_callback=before_gap_analysis,
#     after_agent_callback=after_gap_analysis,
# )

"""Gap Analysis Agent - Part 2B of the Location Strategy Pipeline.

This agent performs quantitative gap analysis using Python code execution
to calculate saturation indices, viability scores, and zone rankings.
"""

from google.adk.agents import LlmAgent
from google.adk.code_executors import BuiltInCodeExecutor
from google.genai import types

from ...config import CODE_EXEC_MODEL, RETRY_INITIAL_DELAY, RETRY_ATTEMPTS
from ...callbacks import before_gap_analysis, after_gap_analysis


GAP_ANALYSIS_INSTRUCTION = """You are a senior data scientist specializing in retail site selection.

Your task is to execute Python code to perform a SOTA quantitative gap analysis using data from previous stages.

TARGET LOCATION: {target_location?}
BUSINESS TYPE: {business_type?}
CURRENT DATE: {current_date}

## Input Data Context

### MARKET RESEARCH FINDINGS:
{market_research_findings}

### COMPETITOR ANALYSIS (Multi-Call Results):
{competitor_analysis}

## Your Mission
Write and execute high-quality Python code using pandas to calculate a deterministic 'Viability Score' for multiple sub-zones.

## Step 1: Structured Data Parsing
- Extract competitor details (name, rating, reviews, status, and category).
- Extract macro indicators: population density (1-10), income score (1-10), and infrastructure quality (1-10).

## Step 2: SOTA Metric Calculations
For each sub-zone identified, compute the following metrics:

1. **Competition Intensity (CI):** - CI = (Number of Competitors * Avg Rating) / log(Total Reviews + 2).
2. **Demand Signal (DS):** - DS = (Population Density * 0.4) + (Income Score * 0.4) + (Infrastructure * 0.2).
3. **Market Saturation Index (MSI):** - MSI = CI / DS. (MSI > 1.5 indicates high saturation; MSI < 0.8 indicates a gap).
4. **Viability Score (0-100):**
   - Use a weighted average: (30% Low MSI) + (30% High DS) + (20% Review Volume Growth) + (20% Low Chain Dominance).

## Step 3: Zone Categorization & Risk Matrix
- **OPPORTUNITY (Viability > 75):** High demand, manageable competition.
- **MODERATE (50-75):** Balanced market.
- **SATURATED (< 50):** High barrier to entry.
- Assign Risk Levels (Low/Medium/High) and Investment Tiers based on rental cost tiers from research.

## Step 4: Python Code Execution Guidelines
- Use `pandas.DataFrame` for all calculations.
- Handle missing rating or review data by using the median value of the dataset.
- **CRITICAL:** The last part of your code must print a final summary table in JSON-like format or a Markdown table that clearly ranks the Top 3 Zones by Viability Score.

## Step 5: Output Requirements
1. **The Python Code Block:** Containing all logic and calculations.
2. **Analysis Summary:** A written explanation of the 'why' behind the top-ranked zones.
3. **Viability Heatmap Data:** A list of zones and their scores (0-100) for the strategy synthesis stage.

Execute the code now to produce the quantitative foundation for the final strategic report.
"""

gap_analysis_agent = LlmAgent(
    name="GapAnalysisAgent",
    model=CODE_EXEC_MODEL,
    description="Performs quantitative gap analysis using Python code execution for zone rankings and viability scores",
    instruction=GAP_ANALYSIS_INSTRUCTION,
    generate_content_config=types.GenerateContentConfig(
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(
                initial_delay=RETRY_INITIAL_DELAY,
                attempts=RETRY_ATTEMPTS,
            ),
        ),
    ),
    code_executor=BuiltInCodeExecutor(),
    output_key="gap_analysis",
    before_agent_callback=before_gap_analysis,
    after_agent_callback=after_gap_analysis,
)