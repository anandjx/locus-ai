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
import { HttpAgent } from "@ag-ui/client";
import { GoogleAuth } from "google-auth-library";

const AGENT_NAME = "locus";
// We remove the ':query' suffix if it exists to make the URL clean
const BASE_ENDPOINT = process.env.AGENT_ENGINE_ENDPOINT!.replace(":query", "");
const FINAL_ENDPOINT = `${BASE_ENDPOINT}:query`;

/**
 * Function to get a valid Google Access Token from the Base64 Service Account Key
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

export const POST = async (req: NextRequest) => {
  // 1. Generate the token
  const token = await getGoogleAccessToken();

  // 2. Initialize HttpAgent with Bearer Token in headers
  const httpAgent = new HttpAgent({
    url: FINAL_ENDPOINT,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // 3. Setup CopilotRuntime
  const runtime = new CopilotRuntime({
    agents: {
      [AGENT_NAME]: httpAgent,
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