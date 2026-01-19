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

// Session cache to map threadIds to Vertex AI session IDs
const sessionCache = new Map<string, string>();

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [AG-UI Proxy] Request at", new Date().toISOString());
  console.log("=".repeat(80));

  try {
    const body = await req.json();
    console.log("📦 [Request]:", JSON.stringify(body, null, 2));

    const method = body.method;
    const params = body.params || {};
    const requestBody = body.body || {};

    // Handle AG-UI Protocol Methods
    
    // Method 1: agent/connect - Connection handshake
    if (method === "agent/connect" || method === "agent.connect") {
      console.log("🔌 [AG-UI] Connect request");
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id || 1,
          result: {
            agentId: "locus",
            capabilities: {
              streaming: true,
              tools: true,
              state: true,
            }
          }
        }),
        { 
          status: 200, 
          headers: { "Content-Type": "application/json" } 
        }
      );
    }

    // Method 2: agent/run - Execute agent with user input
    if (method === "agent/run" || method === "agent.run") {
      console.log("🚀 [AG-UI] Run request");
      
      const threadId = requestBody.threadId || params.threadId || `thread_${Date.now()}`;
      const messages = requestBody.messages || params.messages || [];
      const state = requestBody.state || params.state || {};
      
      // Extract the latest user message
      const userMessages = messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];
      const userInput = lastUserMessage?.content || "";

      console.log("🔗 [ThreadID]:", threadId);
      console.log("💬 [User Input]:", userInput);

      if (!userInput) {
        console.warn("⚠️ No user input found");
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id || 1,
            result: {
              output: "Please send a message to start the analysis.",
              state: {}
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const token = await getGoogleAccessToken();
      console.log("🔑 [Auth] Token obtained");

      // Get or create Vertex AI session
      let sessionId: string = sessionCache.get(threadId) || "";
      
      if (!sessionId) {
        console.log("🆕 [Session] Creating new Vertex AI session");
        
        const createSessionResp = await fetch(`${AGENT_ENGINE_BASE}:createSession`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session: {
              user_id: threadId,
            }
          }),
        });

        if (!createSessionResp.ok) {
          const errorText = await createSessionResp.text();
          console.error("❌ [Session] Create failed:", errorText);
          
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id || 1,
              error: {
                code: -32000,
                message: `Session creation failed: ${errorText}`
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        const sessionData = await createSessionResp.json();
        sessionId = sessionData.name || sessionData.session_id || "";
        
        if (!sessionId) {
          console.error("❌ [Session] No session ID returned:", sessionData);
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id || 1,
              error: {
                code: -32001,
                message: "Failed to extract session ID from Vertex AI response"
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        
        sessionCache.set(threadId, sessionId);
        console.log("✅ [Session] Created:", sessionId);
      } else {
        console.log("♻️ [Session] Reusing existing:", sessionId);
      }

      // Query the Vertex AI Agent Engine
      console.log("📤 [Vertex AI] Sending query");
      
      const queryResp = await fetch(`${AGENT_ENGINE_BASE}/sessions/${sessionId}:query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: userInput,
        }),
      });

      console.log(`📥 [Vertex AI] Response status: ${queryResp.status}`);

      if (!queryResp.ok) {
        const errorText = await queryResp.text();
        console.error("❌ [Vertex AI] Query failed:", errorText);
        
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id || 1,
            error: {
              code: -32002,
              message: `Vertex AI query failed: ${errorText.substring(0, 300)}`
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await queryResp.json();
      console.log("✅ [Vertex AI] Full Response:", JSON.stringify(result, null, 2));

      // Extract response content
      const assistantContent = result.response || 
                               result.output || 
                               result.message || 
                               result.text || 
                               JSON.stringify(result);
      
      const agentState = result.state || 
                        result.session_state || 
                        result.agent_state || 
                        {};

      console.log("📝 [Response] Content length:", assistantContent.length);
      console.log("📝 [Response] State keys:", Object.keys(agentState));

      // Return in AG-UI format
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id || 1,
          result: {
            output: assistantContent,
            state: agentState,
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Unknown method
    console.warn("⚠️ [Unknown Method]:", method);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id || 1,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ [Fatal Error]:", error.message);
    console.error("❌ [Stack]:", error.stack);
    
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        }
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};