"use client";

import { CopilotSidebar } from "@copilotkit/react-ui";
import { useCoAgent, useCoAgentStateRender } from "@copilotkit/react-core";

import { PipelineTimeline } from "@/components/PipelineTimeline";
import { LocationReport } from "@/components/LocationReport";
import { CompetitorCard } from "@/components/CompetitorCard";
import { MarketCard } from "@/components/MarketCard";
import { AlternativeLocations } from "@/components/AlternativeLocations";
import { ArtifactViewer } from "@/components/ArtifactViewer";
import { AgentStatus } from "@/components/AgentStatus";

import type { AgentState } from "@/lib/types";

/* ======================================================
   Reusable Agent Configuration (unchanged)
====================================================== */
const AGENT_CONFIG = {
  // agentName: "locus", {/*name when running locally */}
  agentName: "locus",
  productName: "LOCUS",
  tagline: "Where decisions meet intelligence",
  company: "AJx",
  totalStages: 7,
};

export default function Home() {
  const { state } = useCoAgent<AgentState>({
    name: AGENT_CONFIG.agentName,
  });

  useCoAgentStateRender<AgentState>({
    name: AGENT_CONFIG.agentName,
    render: ({ state }) => {
      if (!state || !state.pipeline_stage) return null;

      return (
        <div className="glass px-4 py-2">
          {/* Soft neutral text instead of bright white → calmer, premium */}
          <span className="text-sm text-slate-600">
            Agent processing:{" "}
            <span className="text-slate-900 font-medium">
              {state.pipeline_stage}
            </span>
          </span>
        </div>
      );
    },
  });

  return (
    <CopilotSidebar
      defaultOpen={false}
      clickOutsideToClose={true}
      labels={{
        title: AGENT_CONFIG.productName,
        initial: `Welcome to **${AGENT_CONFIG.productName}**.

I am your AI-powered location intelligence system.

Provide your business idea and geographic region clearly and I will analyze the demand dynamics, the competitive landscape and the location viability to deliver strategic recommendations.
<br />
**A fully structured HTML report will be delivered at the end of the analysis**.

**Try examples:**
- "Evaluate Downtown Toronto for a coworking space" 
- "Open a coffee shop in Park Street, Kolkata"
- "Analyze Manhattan for a fitness studio"
- "Best bakery location in Berlin"

⚠️ **IMPORTANT:** After entering your query, **close this sidebar** via **X** button at the top right to see the **full-screen interactive report update live!**
`,
      }}
    >
      {/* Removed particles visually (class can stay if globals.css changed) */}
      <main className="min-h-screen relative z-10">
        {/* Dimensions, padding, width: UNCHANGED */}
        <div className="max-w-5xl mx-auto p-10 glass">
          
          {/* ================= HEADER ================= */}
          <header className="mb-10 space-y-3">
            {/* Product name style intentionally UNCHANGED */}
            <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-100 to-cyan-600">
              {AGENT_CONFIG.productName}
            </h1>

            {/* Switched to slate tones → aligns with white Copilot panel */}
            <p className="text-slate-600 text-lg">
              {AGENT_CONFIG.tagline}
              <span className="mx-2 text-slate-300">|</span>
              A product by{" "}
              <span className="font-medium text-slate-600">
                {AGENT_CONFIG.company}
              </span>
            </p>

            {/* AgentStatus already glass → fits naturally */}
            <AgentStatus stage={state?.pipeline_stage} />
          </header>

          {/* ================= PIPELINE ================= */}
          {(state?.target_location || state?.pipeline_stage) && (
            <div className="mb-10">
              <PipelineTimeline
                state={state}
                currentStage={state.pipeline_stage}
                completedStages={state.stages_completed || []}
              />
            </div>
          )}

          {/* ================= RESULTS ================= */}
          {state?.strategic_report && (
            <div className="space-y-8">
              <LocationReport report={state.strategic_report} />

              <div className="grid md:grid-cols-2 gap-6">
                <CompetitorCard
                  competition={
                    state.strategic_report.top_recommendation.competition
                  }
                />
                <MarketCard
                  market={
                    state.strategic_report.top_recommendation.market
                  }
                />
              </div>

              {state.strategic_report.alternative_locations?.length > 0 && (
                <AlternativeLocations
                  locations={state.strategic_report.alternative_locations}
                />
              )}

              {(state.html_report_content ||
                state.infographic_base64) && (
                <ArtifactViewer
                  htmlReport={state.html_report_content}
                  infographic={state.infographic_base64}
                />
              )}
            </div>
          )}

          {/* ================= WELCOME STATE ================= */}
          {!state?.target_location && (
            <div className="glass p-14 text-center mt-12">
              {/* Emoji retained – friendly, human */}
              <div className="text-7xl mb-6">🌍</div>

              <h2 className="text-3xl font-semibold text-slate-500 mb-4">
                Discover the Optimal Location for your Business
              </h2>

              <p className="text-slate-700 max-w-xl mx-auto mb-10 text-lg leading-relaxed text-center">
                Enter your business idea and city in the chat to receive
                AI-driven market research, competitor analysis and
                strategic recommendations.
                <br />
                <span className="mt-2 inline-block text-slate-500 text-base">
                  To begin, click the <span className="font-medium text-slate-700">💬 chat bubble</span> in the lower-right corner.
                </span>
              </p>


              {/* Editorial body copy tone
              <p className="text-slate-700 max-w-xl mx-auto mb-10 text-lg leading-relaxed">
                Enter your business idea and city in the chat to receive
                AI-driven market research, competitor analysis and
                strategic recommendations.
                <strong>To begin, click the 💬 chat bubble in the lower-right corner of your screen.</strong>
              </p> */}

              <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
                <FeatureCard
                  icon="🔍"
                  title="Market Research"
                  description="Live analysis of demand and demographics"
                />
                <FeatureCard
                  icon="📍"
                  title="Competitor Mapping"
                  description="Real-world competitor intelligence"
                />
                <FeatureCard
                  icon="🧠"
                  title="AI Strategy"
                  description="Deep reasoning and decision synthesis"
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </CopilotSidebar>
  );
}

/* ================= FEATURE CARD =================
   Light editorial tone, same spacing, no layout change
================================================== */
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="glass p-5 text-left transition-all hover:-translate-y-1">
      <div className="text-2xl mb-2">{icon}</div>

      {/* Dark text on light glass → premium SaaS feel */}
      <h3 className="font-medium text-slate-900 mb-1">
        {title}
      </h3>

      <p className="text-sm text-slate-600 leading-relaxed">
        {description}
      </p>
    </div>
  );
}


