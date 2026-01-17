/**
 * CopilotKit API Route - Proxies requests to the backend AG-UI agent
 *
 * Uses LangGraphHttpAgent which is the generic HTTP agent
 * for connecting to any AG-UI compatible backend, including ag-ui-adk.
 */


// import {
//   CopilotRuntime,
//   ExperimentalEmptyAdapter,
//   copilotRuntimeNextJSAppRouterEndpoint,
// } from "@copilotkit/runtime";

// import { LangGraphHttpAgent } from "@copilotkit/runtime/langgraph";
// import { NextRequest } from "next/server";

// // Empty adapter because backend handles everything
// const serviceAdapter = new ExperimentalEmptyAdapter();

// // Runtime with AG-UI agent mapping
// const runtime = new CopilotRuntime({
//   agents: {
//     locus: new LangGraphHttpAgent({
//       url: process.env.REMOTE_ACTION_URL || "http://localhost:8000",
//     }),
//   },
// });

// export const POST = async (req: NextRequest) => {
//   const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
//     runtime,
//     serviceAdapter,
//     endpoint: "/api/copilotkit",
//   });

//   return handleRequest(req);
// };


import { NextRequest } from "next/server";
import { GoogleAuth } from "google-auth-library";

const AGENT_ENGINE_BASE = process.env.AGENT_ENGINE_ENDPOINT?.replace(":query", "") || "";

async function getGoogleAccessToken() {
  const base64Key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!base64Key) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
  const jsonKey = JSON.parse(Buffer.from(base64Key, "base64").toString("utf-8"));
  const auth = new GoogleAuth({
    credentials: jsonKey,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// Session management
const sessionCache = new Map<string, string>();

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [POST] Request at", new Date().toISOString());
  console.log("=".repeat(80));

  try {
    const body = await req.json();
    console.log("📦 [Request Body]:", JSON.stringify(body, null, 2));

    const method = body.method;
    const params = body.params || {};

    // Handle AG-UI protocol methods
    if (method === "agent.connect") {
      console.log("🔌 [AG-UI] Connect request");
      return new Response(
        JSON.stringify({
          result: {
            agentId: "locus",
            connected: true,
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (method === "agent.run") {
      console.log("🚀 [AG-UI] Run request");
      
      const threadId = params.threadId || `thread_${Date.now()}`;
      const input = params.input || params.messages?.[params.messages.length - 1]?.content || "";

      console.log("🔗 [ThreadID]:", threadId);
      console.log("💬 [Input]:", input);

      if (!input) {
        return new Response(
          JSON.stringify({
            result: {
              events: [
                {
                  type: "TEXT_MESSAGE_CONTENT",
                  delta: "Please send a message to get started.",
                }
              ]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const token = await getGoogleAccessToken();
      console.log("🔑 [Auth] Token obtained");

      // Get or create session
      let sessionId: string = sessionCache.get(threadId) || "";
      
      if (!sessionId) {
        console.log("🆕 [Session] Creating new session");
        
        const createResp = await fetch(`${AGENT_ENGINE_BASE}:createSession`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session: { user_id: threadId }
          }),
        });

        if (!createResp.ok) {
          const errorText = await createResp.text();
          console.error("❌ [Session] Create failed:", errorText);
          
          return new Response(
            JSON.stringify({
              error: { message: `Session creation failed: ${errorText}` }
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const sessionData = await createResp.json();
        sessionId = sessionData.name || sessionData.session_id || "";
        
        if (!sessionId) {
          console.error("❌ [Session] No ID returned");
          return new Response(
            JSON.stringify({
              error: { message: "Failed to create session" }
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        
        sessionCache.set(threadId, sessionId);
        console.log("✅ [Session] Created:", sessionId);
      } else {
        console.log("♻️ [Session] Reusing:", sessionId);
      }

      // Query the agent
      console.log("📤 [Agent] Querying...");
      
      const queryResp = await fetch(`${AGENT_ENGINE_BASE}/sessions/${sessionId}:query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: input }),
      });

      console.log(`📥 [Agent] Status: ${queryResp.status}`);

      if (!queryResp.ok) {
        const errorText = await queryResp.text();
        console.error("❌ [Agent] Query failed:", errorText);
        
        return new Response(
          JSON.stringify({
            result: {
              events: [
                {
                  type: "TEXT_MESSAGE_CONTENT",
                  delta: `Error: ${errorText.substring(0, 300)}`,
                }
              ]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await queryResp.json();
      console.log("✅ [Agent] Response:", JSON.stringify(result, null, 2));

      // Transform to AG-UI events
      const content = result.response || result.output || result.message || result.text || JSON.stringify(result);
      const state = result.state || result.session_state || {};

      const events = [
        {
          type: "RUN_STARTED",
          threadId: threadId,
        },
        {
          type: "TEXT_MESSAGE_CONTENT",
          delta: content,
        },
        {
          type: "RUN_FINISHED",
          threadId: threadId,
          state: state,
        }
      ];

      return new Response(
        JSON.stringify({
          result: { events }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Unknown method
    console.warn("⚠️ [Unknown method]:", method);
    return new Response(
      JSON.stringify({
        error: { message: `Unknown method: ${method}` }
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ [Fatal]:", error.message);
    console.error("❌ [Stack]:", error.stack);
    
    return new Response(
      JSON.stringify({
        error: { message: error.message }
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};