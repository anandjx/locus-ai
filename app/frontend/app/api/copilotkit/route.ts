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


import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { GoogleAuth } from "google-auth-library";

const AGENT_NAME = "locus";
const BASE_ENDPOINT = (process.env.AGENT_ENGINE_ENDPOINT || "").replace(":query", "");
const FINAL_ENDPOINT = `${BASE_ENDPOINT}:query`;

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

/**
 * Custom LangGraph Service Adapter for Vertex AI
 * This implements the protocol CopilotKit expects when agent="locus" is set
 */
class VertexAILangGraphAdapter {
  async process(request: {
    messages: any[];
    threadId?: string;
    state?: any;
  }): Promise<any> {
    console.log("🚀 [VertexAI Adapter] Processing request");
    console.log("📊 [VertexAI Adapter] Messages:", request.messages?.length || 0);
    console.log("📊 [VertexAI Adapter] ThreadId:", request.threadId);

    try {
      const token = await getGoogleAccessToken();
      console.log("🔑 [VertexAI Adapter] OAuth token obtained");

      // Transform messages to Vertex AI format
      const transformedMessages = (request.messages || []).map((msg: any) => ({
        role: msg.role === "assistant" ? "model" : msg.role,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      }));

      const vertexPayload = {
        input: {
          messages: transformedMessages,
          state: request.state || {},
          thread_id: request.threadId || `thread_${Date.now()}`,
        },
      };

      console.log("📤 [VertexAI Adapter] Calling:", FINAL_ENDPOINT);
      console.log("📤 [VertexAI Adapter] Payload preview:", JSON.stringify(vertexPayload).substring(0, 300));

      const response = await fetch(FINAL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vertexPayload),
      });

      console.log(`📥 [VertexAI Adapter] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ [VertexAI Adapter] Error:", errorText.substring(0, 500));
        throw new Error(`Vertex AI returned ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const result = await response.json();
      console.log("✅ [VertexAI Adapter] Success! Keys:", Object.keys(result));
      console.log("✅ [VertexAI Adapter] Result preview:", JSON.stringify(result).substring(0, 500));

      // Return in the format CopilotKit expects
      return {
        messages: [
          {
            role: "assistant",
            content: result.content || result.output || result.response || JSON.stringify(result),
          }
        ],
        state: result.state || {},
      };

    } catch (error: any) {
      console.error("❌ [VertexAI Adapter] Exception:", error.message);
      console.error("❌ [VertexAI Adapter] Stack:", error.stack?.substring(0, 500));
      
      // Return error as assistant message so UI shows it
      return {
        messages: [
          {
            role: "assistant",
            content: `I encountered an error: ${error.message}`,
          }
        ],
        state: {},
      };
    }
  }
}

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [POST] CopilotKit request received");
  console.log("=".repeat(80));

  try {
    const serviceAdapter = new VertexAILangGraphAdapter();

    const runtime = new CopilotRuntime({
      // Don't register agents here - the adapter handles it
    });

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter: serviceAdapter as any,
      endpoint: "/api/copilotkit",
    });

    const response = await handleRequest(req);
    console.log("✅ [POST] Request handled successfully");
    return response;

  } catch (error: any) {
    console.error("❌ [POST] Fatal error:", error.message);
    console.error("❌ [POST] Stack:", error.stack);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        hint: "Check Vercel logs for details"
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
};