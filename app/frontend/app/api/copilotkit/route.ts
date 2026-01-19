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

// 1. Force Node.js Runtime
export const runtime = 'nodejs';

// 2. THE TROJAN HORSE CONFIG
// We must set this to satisfy any "eager" SDK checks, even though we won't use it.
process.env.OPENAI_API_KEY = "dummy-key-to-bypass-sdk-validation";

/* ============================================================
   3. Google Auth Setup (The REAL Authentication)
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
   4. The Solution: Masquerading Adapter
   ============================================================ */
const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages }) => {
    // A. Extract User Input
    // Safe cast to 'any' to avoid strict type issues
    const lastMessage = messages[messages.length - 1];
    const userBuffer = (lastMessage as any).content || "";

    // B. Call Vertex AI (Your actual backend)
    const auth = getGoogleAuthClient();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const endpoint = process.env.AGENT_ENGINE_ENDPOINT || '';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: userBuffer }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex API Error:', response.status, errorText);
      return `Error: Vertex Agent Engine returned ${response.status}. Check logs.`;
    }

    // C. Process Response
    const data = await response.json();
    const agentText = data.output || data.text || JSON.stringify(data);

    // D. Return plain text
    // LangChainAdapter will handle the streaming protocol for us automatically
    return agentText;
  }
});

// CRITICAL BYPASS:
// We explicitly set these properties to "openai" to satisfy the Runtime's strict validation list.
// The Runtime will think this is an OpenAI adapter and allow it to proceed.
// Since we provided a custom 'chainFn' above, the actual OpenAI SDK is NEVER called.
(serviceAdapter as any).provider = "openai";
(serviceAdapter as any).model = "gpt-4o";

/* ============================================================
   5. Runtime Initialization
   ============================================================ */
const runtimeInstance = new CopilotRuntime();

/* ============================================================
   6. Export Handler
   ============================================================ */
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};