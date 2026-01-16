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
import { NextRequest } from "next/server";
import { GoogleAuth } from "google-auth-library";

const AGENT_NAME = "locus";
const BASE_ENDPOINT = (process.env.AGENT_ENGINE_ENDPOINT || "").replace(":query", "");
const FINAL_ENDPOINT = `${BASE_ENDPOINT}:query`;

/**
 * 1. Google OAuth2 Token Generation
 */
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
 * 2. The LocusVertexAgent Class (v1.50.1 Implementation)
 * This class provides the full surface area required for state-sync and execution.
 */
class LocusVertexAgent {
  name: string = AGENT_NAME;
  description: string = "Locus Retail Strategy Agent";

  // v1.50.1 Lifecycle Shims: These prevent the runtime from hanging
  setMessages(messages: any[]) { console.log("🔄 Syncing messages..."); }
  setState(state: any) { console.log("🔄 Syncing state..."); }
  setThreadId(threadId: string) { console.log("🔄 Syncing thread..."); }
  setDebug(debug: boolean) { }
  
  // Mandatory for session isolation
  clone() {
    return new LocusVertexAgent();
  }

  // The actual execution bridge to Google Cloud
  async execute({ messages, state, threadId }: any): Promise<any> {
    console.log(`🚀 Executing Vertex Agent for thread: ${threadId}`);
    
    try {
      const token = await getGoogleAccessToken();

      const vertexPayload = {
        input: {
          messages: messages,
          state: state,
          thread_id: threadId, 
        },
      };

      const response = await fetch(FINAL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vertexPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Vertex AI API Error:", errorText);
        throw new Error(`Vertex AI Error: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Vertex AI Response Received");
      return result;
      
    } catch (error) {
      console.error("❌ Execution Failed:", error);
      throw error;
    }
  }
}

/**
 * 3. App Router POST Handler
 */
export const POST = async (req: NextRequest) => {
  console.log("📥 Incoming CopilotKit Request");

  const runtime = new CopilotRuntime({
    agents: {
      [AGENT_NAME]: new LocusVertexAgent() as any,
    },
  });

  const serviceAdapter = new ExperimentalEmptyAdapter();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};