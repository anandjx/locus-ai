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
 * 3. Custom Vertex AI Agent Implementation
 * We include the .clone() method to satisfy CopilotKit's internal thread management.
 */
const vertexAgent: any = {
  name: AGENT_NAME,
  description: "Locus Retail Strategy Agent",
  
  // MANDATORY: v1.50.1 requires a clone method to handle session isolation
  clone: function() {
    return this; 
  },

  execute: async (params: any): Promise<any> => {
    const token = await getGoogleAccessToken();

    // The 'input' wrapper is MANDATORY for Vertex AI Reasoning Engine
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
  },
};

// 4. Main Route Handler
export const POST = async (req: NextRequest) => {
  const runtime = new CopilotRuntime({
    agents: {
      [AGENT_NAME]: vertexAgent,
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