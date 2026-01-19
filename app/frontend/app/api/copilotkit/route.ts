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



import { NextRequest } from 'next/server';
import {
  CopilotRuntime,
  LangChainAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { GoogleAuth } from 'google-auth-library';

// 1. Runtime Config
export const runtime = 'nodejs';

/* ============================================================
   2. Google Auth Setup (For Vertex Agent Engine)
   ============================================================ */
const getGoogleAuthClient = () => {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');
  }
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8')
  );
  return new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
};

/* ============================================================
   3. The Adapter Implementation
   ============================================================ */
// We use LangChainAdapter to route requests to your custom Vertex Agent Engine endpoint
// while adhering to the CopilotKit streaming protocol.
const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages }) => {
    // A. Extract User Input
    // We cast to 'any' to ensure we capture content from all message types
    const lastMessage = messages[messages.length - 1];
    const userBuffer = (lastMessage as any).content || "";

    // B. Authenticate with Vertex AI (Service Account)
    const auth = getGoogleAuthClient();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const endpoint = process.env.AGENT_ENGINE_ENDPOINT || '';

    // C. Execute Request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: userBuffer }
        // session_id: threadId // Uncomment if session persistence is needed
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex API Error:', response.status, errorText);
      return `Error: Vertex Agent Engine returned ${response.status}.`;
    }

    // D. Process Response
    const data = await response.json();
    // Vertex Agent Engine typically returns 'output' or 'text'
    const agentText = data.output || data.text || JSON.stringify(data);

    // E. Return text for streaming
    return agentText;
  }
});

/* ============================================================
   4. Provider Configuration (The Fix)
   ============================================================ */
// We explicitly identify as "google". 
// The Runtime will check process.env.GOOGLE_GENERATIVE_AI_API_KEY.
// Since you have now provided it, this validation will PASS.
(serviceAdapter as any).provider = "google";
(serviceAdapter as any).model = "gemini-2.5-pro"; // Or your specific model version

/* ============================================================
   5. Runtime Initialization
   ============================================================ */
const runtimeInstance = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};