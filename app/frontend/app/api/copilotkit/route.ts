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
  LangChainAdapter, // We use this instead of implementing our own
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { GoogleAuth } from 'google-auth-library';

// FORCE NODEJS RUNTIME
// Google Auth Library requires Node.js standard libraries
export const runtime = 'nodejs';

// 1. Setup Google Auth Client
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

// 2. Define the Adapter using LangChainAdapter
// This wrapper handles the complex v1.50 event streaming protocol automatically.
// We just need to return the text string from Vertex.
const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages }) => {
    // A. Extract the user's last message
    // We cast to 'any' to avoid strict LangChain type dependencies
    const lastMessage = messages[messages.length - 1];
    const userBuffer = (lastMessage as any).content || "";

    // B. Get OAuth Token
    const auth = getGoogleAuthClient();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to generate Google Access Token');
    }

    // C. Call Vertex AI Agent Engine
    // Note: We use the endpoint from env vars
    const endpoint = process.env.AGENT_ENGINE_ENDPOINT || '';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          text: userBuffer
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex API Error:', response.status, errorText);
      return `Error: Vertex Agent Engine returned ${response.status}. Check logs.`;
    }

    // D. Extract Text and Return
    const data = await response.json();
    
    // We assume Vertex returns { output: "..." } or { text: "..." }
    const agentText = data.output || data.text || JSON.stringify(data);
    
    // Simply returning the string allows LangChainAdapter to handle the response protocol
    return agentText;
  }
});

// 3. Initialize Runtime
const runtimeInstance = new CopilotRuntime();

// 4. Export the Handler
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};