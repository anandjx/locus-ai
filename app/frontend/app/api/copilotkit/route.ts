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
    const rawBody = await req.json();
    console.log("📦 [Raw Request]:", JSON.stringify(rawBody, null, 2));

    const actualBody = rawBody.body || rawBody;
    const messages = actualBody.messages || [];
    const threadId = actualBody.threadId || `thread_${Date.now()}`;

    const userMessages = messages.filter((m: any) => m.role === "user");
    const lastUserMessage = userMessages[userMessages.length - 1];
    const userInput = lastUserMessage?.content || "";

    console.log("💬 [Input]:", userInput);
    console.log("🔗 [ThreadID]:", threadId);

    if (!userInput) {
      return new Response(
        JSON.stringify({ messages: messages }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = await getGoogleAccessToken();
    console.log("🔑 [Auth] Token obtained");

    let sessionId: string = sessionCache.get(threadId) || "";
    
    if (!sessionId) {
      console.log("🆕 [Session] Creating new session for thread:", threadId);
      
      const createSessionResponse = await fetch(`${AGENT_ENGINE_BASE}:createSession`, {
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

      if (!createSessionResponse.ok) {
        const errorText = await createSessionResponse.text();
        console.error("❌ [Session] Create failed:", errorText);
        throw new Error(`Session creation failed: ${errorText}`);
      }

      const sessionData = await createSessionResponse.json();
      sessionId = sessionData.name || sessionData.session_id || "";
      
      if (!sessionId) {
        console.error("❌ [Session] No session ID in response:", sessionData);
        throw new Error("Failed to extract session ID from response");
      }
      
      sessionCache.set(threadId, sessionId);
      console.log("✅ [Session] Created:", sessionId);
    } else {
      console.log("♻️ [Session] Reusing existing:", sessionId);
    }

    console.log("📤 [Agent] Sending message to session");
    
    const queryPayload = {
      query: userInput,
    };

    const queryResponse = await fetch(`${AGENT_ENGINE_BASE}/sessions/${sessionId}:query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryPayload),
    });

    console.log(`📥 [Agent] Response status: ${queryResponse.status}`);

    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      console.error("❌ [Agent] Query failed:", errorText);
      
      return new Response(
        JSON.stringify({
          messages: [
            ...messages,
            {
              role: "assistant",
              content: `I encountered an error: ${errorText.substring(0, 300)}`,
            }
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await queryResponse.json();
    console.log("✅ [Agent] Full Response:", JSON.stringify(result, null, 2));

    let assistantContent = "";
    let agentState = {};

    if (result.response) {
      assistantContent = result.response;
    } else if (result.output) {
      assistantContent = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    } else if (result.message) {
      assistantContent = result.message;
    } else if (result.text) {
      assistantContent = result.text;
    } else {
      assistantContent = JSON.stringify(result);
    }

    if (result.state) {
      agentState = result.state;
    } else if (result.session_state) {
      agentState = result.session_state;
    }

    console.log("📝 [Response] Content length:", assistantContent.length);
    console.log("📝 [Response] State keys:", Object.keys(agentState));

    return new Response(
      JSON.stringify({
        messages: [
          ...messages,
          {
            role: "assistant",
            content: assistantContent,
          }
        ],
        state: agentState,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ [Fatal]:", error.message);
    console.error("❌ [Stack]:", error.stack);
    
    return new Response(
      JSON.stringify({
        role: "assistant",
        content: `System error: ${error.message}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};