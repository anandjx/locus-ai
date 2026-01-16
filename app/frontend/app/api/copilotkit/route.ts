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
 * Vertex AI Agent Implementation
 */
class VertexAIAgent {
  name = AGENT_NAME;
  description = "Locus AI retail location intelligence agent";

  async execute(request: {
    messages: any[];
    threadId?: string;
    state?: any;
  }): Promise<ReadableStream> {
    console.log("🚀 [VertexAI Agent] execute() called");
    console.log("📊 [VertexAI Agent] Messages:", request.messages?.length || 0);
    console.log("📊 [VertexAI Agent] ThreadId:", request.threadId);

    const encoder = new TextEncoder();
    
    return new ReadableStream({
      async start(controller) {
        try {
          const token = await getGoogleAccessToken();
          console.log("🔑 [VertexAI Agent] OAuth token obtained");

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
            
            const errorChunk = encoder.encode(
              JSON.stringify({
                role: "assistant",
                content: `Error ${response.status}: ${errorText.substring(0, 200)}`,
              }) + "\n"
            );
            controller.enqueue(errorChunk);
            controller.close();
            return;
          }

          const result = await response.json();
          console.log("✅ [VertexAI Agent] Success!");
          console.log("✅ [VertexAI Agent] Response keys:", Object.keys(result));
          console.log("✅ [VertexAI Agent] Full response:", JSON.stringify(result, null, 2));

          let content = "";
          let state = {};

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

          console.log("📝 [VertexAI Agent] Content length:", content.length);
          console.log("📝 [VertexAI Agent] State keys:", Object.keys(state));

          const messageChunk = encoder.encode(
            JSON.stringify({
              role: "assistant",
              content: content,
            }) + "\n"
          );
          controller.enqueue(messageChunk);

          if (Object.keys(state).length > 0) {
            const stateChunk = encoder.encode(
              JSON.stringify({
                state: state,
              }) + "\n"
            );
            controller.enqueue(stateChunk);
          }

          controller.close();

        } catch (error: any) {
          console.error("❌ [VertexAI Agent] Exception:", error.message);
          console.error("❌ [VertexAI Agent] Stack:", error.stack);
          
          const errorChunk = encoder.encode(
            JSON.stringify({
              role: "assistant",
              content: `System error: ${error.message}`,
            }) + "\n"
          );
          controller.enqueue(errorChunk);
          controller.close();
        }
      },
    });
  }
}

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [POST] CopilotKit request at", new Date().toISOString());
  console.log("=".repeat(80));

  try {
    const runtime = new CopilotRuntime({
      agents: {
        [AGENT_NAME]: new VertexAIAgent() as any,
      },
    });

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      endpoint: "/api/copilotkit",
    });

    const response = await handleRequest(req);
    console.log("✅ [POST] Response ready");
    return response;

  } catch (error: any) {
    console.error("❌ [POST] Fatal error:", error.message);
    console.error("❌ [POST] Stack:", error.stack);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
};