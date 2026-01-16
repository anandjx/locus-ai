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
 * Custom Remote Agent Implementation
 * This bypasses the service adapter and implements the agent directly
 */
class VertexAIRemoteAgent {
  name = AGENT_NAME;
  
  async run(params: {
    messages: any[];
    threadId?: string;
    state?: any;
  }): Promise<AsyncGenerator<any, void, unknown>> {
    console.log("🚀 [VertexAI Agent] run() called");
    console.log("📊 [VertexAI Agent] Messages:", params.messages?.length || 0);
    console.log("📊 [VertexAI Agent] ThreadId:", params.threadId);
    
    const self = this;
    
    return (async function* () {
      try {
        const token = await getGoogleAccessToken();
        console.log("🔑 [VertexAI Agent] OAuth token obtained");

        // Transform messages
        const transformedMessages = (params.messages || []).map((msg: any) => ({
          role: msg.role === "assistant" ? "model" : msg.role,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        }));

        const vertexPayload = {
          input: {
            messages: transformedMessages,
            state: params.state || {},
            thread_id: params.threadId || `thread_${Date.now()}`,
          },
        };

        console.log("📤 [VertexAI Agent] Calling:", FINAL_ENDPOINT);
        console.log("📤 [VertexAI Agent] Payload:", JSON.stringify(vertexPayload).substring(0, 400));

        const response = await fetch(FINAL_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(vertexPayload),
        });

        console.log(`📥 [VertexAI Agent] Response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ [VertexAI Agent] Error:", errorText.substring(0, 500));
          
          yield {
            role: "assistant",
            content: `Error ${response.status}: ${errorText.substring(0, 200)}`,
          };
          return;
        }

        const result = await response.json();
        console.log("✅ [VertexAI Agent] Success!");
        console.log("✅ [VertexAI Agent] Response keys:", Object.keys(result));
        console.log("✅ [VertexAI Agent] Full response:", JSON.stringify(result, null, 2));

        // Extract the actual response content
        let content = "";
        let state = {};

        // Try different response structures Vertex AI might return
        if (result.output) {
          content = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
          state = result.state || {};
        } else if (result.content) {
          content = result.content;
          state = result.state || {};
        } else if (result.messages && Array.isArray(result.messages)) {
          const lastMessage = result.messages[result.messages.length - 1];
          content = lastMessage?.content || JSON.stringify(result);
          state = result.state || {};
        } else if (result.response) {
          content = result.response;
          state = result.state || {};
        } else {
          content = JSON.stringify(result);
        }

        console.log("📝 [VertexAI Agent] Extracted content length:", content.length);
        console.log("📝 [VertexAI Agent] Extracted state keys:", Object.keys(state));

        // Yield the message
        yield {
          role: "assistant",
          content: content,
        };

        // Yield state update if present
        if (Object.keys(state).length > 0) {
          yield {
            state: state,
          };
        }

      } catch (error: any) {
        console.error("❌ [VertexAI Agent] Exception:", error.message);
        console.error("❌ [VertexAI Agent] Stack:", error.stack);
        
        yield {
          role: "assistant",
          content: `System error: ${error.message}`,
        };
      }
    })();
  }
}

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [POST] CopilotKit request received at", new Date().toISOString());
  console.log("=".repeat(80));

  try {
    const runtime = new CopilotRuntime({
      remoteActions: [
        {
          name: AGENT_NAME,
          agent: new VertexAIRemoteAgent() as any,
        }
      ],
    });

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      endpoint: "/api/copilotkit",
    });

    const response = await handleRequest(req);
    console.log("✅ [POST] Request handled, returning response");
    return response;

  } catch (error: any) {
    console.error("❌ [POST] Fatal error:", error.message);
    console.error("❌ [POST] Stack:", error.stack);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack?.substring(0, 500),
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
};