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
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { AbstractAgent, RunAgentInput, EventType, BaseEvent } from "@ag-ui/client";
import { Observable } from "rxjs";
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
 * Custom Vertex AI Agent with Dynamic OAuth
 */
class VertexAIAgent extends AbstractAgent {
  constructor() {
    super({
      agentId: AGENT_NAME,
      description: "Locus AI retail location intelligence agent",
    });
  }

  protected run(input: RunAgentInput): Observable<BaseEvent> {
    console.log("🚀 [VertexAI Agent] run() called");
    console.log("📊 [VertexAI Agent] Input:", {
      threadId: input.threadId,
      runId: input.runId,
      messageCount: input.messages?.length || 0,
    });

    return new Observable<BaseEvent>((observer) => {
      (async () => {
        try {
          // Generate fresh OAuth token
          const token = await getGoogleAccessToken();
          console.log("🔑 [VertexAI Agent] OAuth token obtained");

          // Emit run started event
          observer.next({
            type: EventType.RUN_STARTED,
            threadId: input.threadId,
            runId: input.runId,
          } as any);

          // Prepare payload for Vertex AI
          const vertexPayload = {
            input: {
              messages: input.messages || [],
              state: input.state || {},
              thread_id: input.threadId,
            },
          };

          console.log("📤 [VertexAI Agent] Calling:", FINAL_ENDPOINT);
          console.log("📤 [VertexAI Agent] Payload:", JSON.stringify(vertexPayload).substring(0, 400));

          // Call Vertex AI
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

            observer.next({
              type: EventType.RUN_ERROR,
              threadId: input.threadId,
              runId: input.runId,
              error: `Vertex AI error ${response.status}: ${errorText.substring(0, 200)}`,
            } as any);

            observer.complete();
            return;
          }

          const result = await response.json();
          console.log("✅ [VertexAI Agent] Success!");
          console.log("✅ [VertexAI Agent] Response keys:", Object.keys(result));
          console.log("✅ [VertexAI Agent] Full response:", JSON.stringify(result, null, 2));

          // Extract content from response
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
          console.log("📝 [VertexAI Agent] State:", state);

          // Emit message events
          const messageId = `msg_${Date.now()}`;

          observer.next({
            type: EventType.TEXT_MESSAGE_START,
            messageId,
          } as any);

          observer.next({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: content,
          } as any);

          observer.next({
            type: EventType.TEXT_MESSAGE_END,
            messageId,
          } as any);

          // Emit run finished event
          observer.next({
            type: EventType.RUN_FINISHED,
            threadId: input.threadId,
            runId: input.runId,
            state,
          } as any);

          observer.complete();

        } catch (error: any) {
          console.error("❌ [VertexAI Agent] Exception:", error.message);
          console.error("❌ [VertexAI Agent] Stack:", error.stack);

          observer.next({
            type: EventType.RUN_ERROR,
            threadId: input.threadId,
            runId: input.runId,
            error: `System error: ${error.message}`,
          } as any);

          observer.complete();
        }
      })();
    });
  }
}

const serviceAdapter = new ExperimentalEmptyAdapter();

const runtime = new CopilotRuntime({
  agents: {
    [AGENT_NAME]: new VertexAIAgent() as any,
  },
});

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [POST] CopilotKit request at", new Date().toISOString());
  console.log("=".repeat(80));

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};