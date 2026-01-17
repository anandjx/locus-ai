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

const sessionCache = new Map<string, string>();

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [POST] Request at", new Date().toISOString());
  console.log("=".repeat(80));

  try {
    const requestBody = await req.json();
    console.log("📦 [Request Body]:", JSON.stringify(requestBody, null, 2));

    const method = requestBody.method;
    const params = requestBody.params || {};
    const body = requestBody.body || {};

    // Handle agent/connect (with slash)
    if (method === "agent/connect") {
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

    // Handle agent/run
    if (method === "agent/run") {
      console.log("🚀 [AG-UI] Run request");
      
      const threadId = body.threadId || params.threadId || `thread_${Date.now()}`;
      const messages = body.messages || [];
      
      // Extract user input from messages
      const userMessages = messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];
      const userInput = lastUserMessage?.content || "";

      console.log("🔗 [ThreadID]:", threadId);
      console.log("💬 [Input]:", userInput);
      console.log("📨 [Messages count]:", messages.length);

      if (!userInput) {
        console.log("⚠️ No user input - sending welcome");
        return new Response(
          JSON.stringify({
            result: {
              events: [
                {
                  type: "TEXT_MESSAGE_CONTENT",
                  delta: "👋 Welcome to LOCUS! I'm your AI-powered retail location intelligence assistant. Tell me about your business idea and target location to get started.",
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

        const createRespText = await createResp.text();
        console.log(`📥 [Session] Create response (${createResp.status}):`, createRespText);

        if (!createResp.ok) {
          console.error("❌ [Session] Create failed");
          
          return new Response(
            JSON.stringify({
              result: {
                events: [
                  {
                    type: "TEXT_MESSAGE_CONTENT",
                    delta: `Failed to initialize session: ${createRespText.substring(0, 200)}`,
                  }
                ]
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        const sessionData = JSON.parse(createRespText);
        sessionId = sessionData.name || sessionData.session_id || "";
        
        if (!sessionId) {
          console.error("❌ [Session] No ID in response");
          return new Response(
            JSON.stringify({
              result: {
                events: [
                  {
                    type: "TEXT_MESSAGE_CONTENT",
                    delta: "Failed to create session - no ID returned",
                  }
                ]
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        
        sessionCache.set(threadId, sessionId);
        console.log("✅ [Session] Created:", sessionId);
      } else {
        console.log("♻️ [Session] Reusing:", sessionId);
      }

      // Query the agent
      console.log("📤 [Agent] Querying with input:", userInput.substring(0, 100));
      
      const queryResp = await fetch(`${AGENT_ENGINE_BASE}/sessions/${sessionId}:query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: userInput }),
      });

      const queryRespText = await queryResp.text();
      console.log(`📥 [Agent] Query response (${queryResp.status}):`, queryRespText.substring(0, 500));

      if (!queryResp.ok) {
        console.error("❌ [Agent] Query failed");
        
        return new Response(
          JSON.stringify({
            result: {
              events: [
                {
                  type: "TEXT_MESSAGE_CONTENT",
                  delta: `Agent error: ${queryRespText.substring(0, 300)}`,
                }
              ]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = JSON.parse(queryRespText);
      console.log("✅ [Agent] Parsed response:", JSON.stringify(result, null, 2).substring(0, 1000));

      // Extract content from response
      const content = result.response || result.output || result.message || result.text || JSON.stringify(result);
      const state = result.state || result.session_state || {};

      console.log("📝 [Response] Content:", content.substring(0, 200));
      console.log("📝 [Response] State keys:", Object.keys(state));

      // Return AG-UI formatted events
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
        JSON.stringify({ result: { events } }),
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