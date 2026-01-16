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
 * The "LocusProductionAgent"
 * This satisfies all 1.50.1 handshake requirements.
 */
class LocusVertexAgent {
  // Metadata & State required for the v1.50.1 Handshake
  name: string = AGENT_NAME;
  description: string = "Locus Retail Strategist";
  isRunning: boolean = false; // Tells the UI the agent is ready to work
  status: string = "idle";      // Crucial status flag

  // Lifecycle Stubs to prevent silent hangs
  setMessages(messages: any[]) { }
  setState(state: any) { }
  setThreadId(threadId: string) { }
  setDebug(debug: boolean) { }

  // Mandatory for session isolation
  clone() {
    return new LocusVertexAgent();
  }

  // Actual execution bridge
  async execute({ messages, state, threadId }: any): Promise<any> {
    console.log("🚀 AGENT TRIGGERED: Connecting to Vertex AI...");
    this.isRunning = true;
    this.status = "running";

    try {
      const token = await getGoogleAccessToken();
      const vertexPayload = {
        input: { messages, state, thread_id: threadId },
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
        throw new Error(`Vertex API Error: ${await response.text()}`);
      }

      const result = await response.json();
      console.log("✅ SUCCESS: Response received from Vertex AI");
      return result;
    } finally {
      this.isRunning = false;
      this.status = "idle";
    }
  }
}

export const POST = async (req: NextRequest) => {
  console.log("📥 Incoming Request Detected");
  const runtime = new CopilotRuntime({
    agents: {
      [AGENT_NAME]: new LocusVertexAgent() as any,
    },
  });
console.log("📥 Incoming Request Detected 2");
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit",
  });
console.log("📥 Incoming Request Detected 3");
  return handleRequest(req);
};