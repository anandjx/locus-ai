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

// 1. Setup Constants
const AGENT_NAME = "locus";
const BASE_ENDPOINT = (process.env.AGENT_ENGINE_ENDPOINT || "").replace(":query", "");
const FINAL_ENDPOINT = `${BASE_ENDPOINT}:query`;

// 2. Google OAuth2 Token Helper
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
 * 3. The "LocusShimAgent"
 * This class provides the mandatory surface area for CopilotKit 1.50.1 state-sync.
 */
class LocusVertexAgent {
  // Metadata required for the UI
  name: string = AGENT_NAME;
  description: string = "Retail Intelligence Strategist";

  // --- Mandatory State Sync Methods (Stubs) ---
  // These stop the "o.setMessages is not a function" errors.
  setMessages(messages: any[]) { /* No-op: Vertex handles history */ }
  setState(state: any) { /* No-op: Vertex handles state */ }
  setThreadId(threadId: string) { /* No-op: Vertex handles thread_id */ }
  setDebug(debug: boolean) { /* No-op */ }

  // Runtime calls this to create session-isolated instances
  clone() {
    return new LocusVertexAgent();
  }

  // --- Actual Execution Logic ---
  async execute(params: any): Promise<any> {
    const token = await getGoogleAccessToken();

    // Payload transformation: wrap in 'input' and use snake_case for ADK
    const vertexPayload = {
      input: {
        messages: params.messages,
        state: params.state,
        thread_id: params.threadId, 
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
      throw new Error(`Vertex AI API Error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }
}

// 4. Main Route Handler
export const POST = async (req: NextRequest) => {
  const runtime = new CopilotRuntime({
    agents: {
      // We cast as 'any' to avoid the 25+ internal property check
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