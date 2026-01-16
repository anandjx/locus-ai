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

// Configuration
const AGENT_NAME = "locus";
const BASE_ENDPOINT = process.env.AGENT_ENGINE_ENDPOINT!.replace(":query", "");
const FINAL_ENDPOINT = `${BASE_ENDPOINT}:query`;

/**
 * Utility to fetch Google Access Token
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
 * Custom Vertex Agent 
 * We manually define the agent object to satisfy the runtime requirements
 * while transforming the payload for Vertex AI.
 */
const vertexAgent: any = {
  name: AGENT_NAME,
  description: "Locus Retail Strategy Agent on Vertex AI",
  execute: async ({ messages, state, threadId }: any) => {
    const token = await getGoogleAccessToken();

    // SOTA Fix: Wrap in 'input' and map threadId to thread_id for Vertex/ADK
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
      throw new Error(`Vertex AI Error (${response.status}): ${errorText}`);
    }

    return await response.json();
  },
};

export const POST = async (req: NextRequest) => {
  const runtime = new CopilotRuntime({
    agents: [vertexAgent], 
  });

  const serviceAdapter = new ExperimentalEmptyAdapter();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};