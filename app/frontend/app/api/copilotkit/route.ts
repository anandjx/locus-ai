// /**
//  * CopilotKit API Route - Proxies requests to the backend AG-UI agent
//  *
//  * Uses LangGraphHttpAgent which is the generic HTTP agent
//  * for connecting to any AG-UI compatible backend, including ag-ui-adk.
//  */

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
import { AIMessage } from "@langchain/core/messages"; // Standard LangChain message type

// 1. FORCE NODEJS RUNTIME
export const runtime = 'nodejs';

// 2. CONFIGURATION & AUTH
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

// 3. THE ADAPTER (ACTING AS YOUR MIDDLEWARE)
const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages, threadId }) => {
    try {
      console.log('📥 [Adapter] Processing request', { threadId });

      // A. Extract User Input
      const lastMessage = messages[messages.length - 1];
      const userInput = (lastMessage as any).content || "";
      
      if (!userInput) return "Please send a message to start the analysis.";

      // B. Authenticate with Google
      const auth = getGoogleAuthClient();
      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();
      const token = accessToken.token;

      // C. Construct Vertex AI Endpoint
      const projectId = process.env.GOOGLE_CLOUD_PROJECT;
      const location = process.env.GOOGLE_CLOUD_LOCATION; // e.g., us-central1
      const resourceId = process.env.AGENT_ENGINE_RESOURCE_ID; // The ID of your deployed agent

      if (!projectId || !location || !resourceId) {
        throw new Error("Missing Vertex AI env vars (PROJECT, LOCATION, or AGENT_ENGINE_RESOURCE_ID)");
      }

      // The standard Reasoning Engine query endpoint
      const queryEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/reasoningEngines/${resourceId}:query`;

      console.log('📤 [Adapter] Querying Vertex AI:', queryEndpoint);

      // D. Call the Agent
      // Mimics the behavior of 'ADKAgent.run()' but over HTTP
      const response = await fetch(queryEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { query: userInput } // Standard ADK input schema
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [Adapter] Vertex Error:', response.status, errorText);
        return `Error from Locus Brain (${response.status}). Please check logs.`;
      }

      // E. Parse Response (Mimicking endpoint.py logic)
      const data = await response.json();
      
      // The Agent Engine usually wraps the return value in 'output' or 'result'
      let agentText = "";
      
      if (data.output) {
        agentText = typeof data.output === 'string' ? data.output : JSON.stringify(data.output);
      } else if (data.result) {
         agentText = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
      } else {
        // Fallback: dump the whole JSON if structure is unknown
        agentText = JSON.stringify(data);
      }

      console.log('✅ [Adapter] Response received, returning text.');

      // F. RETURN LANGCHAIN MESSAGE
      // This is crucial. Returning a string is okay, but returning an AIMessage object
      // is safer for LangChainAdapter to process.
      return new AIMessage(agentText);

    } catch (error: any) {
      console.error("❌ [Adapter] Fatal error:", error);
      return `System error: ${error.message}`;
    }
  }
});

// 4. CRITICAL: MASQUERADE AS OPENAI
// This fixes the "Unknown provider 'undefined'" error.
// We tell CopilotKit: "Trust me, I am acting like OpenAI."
(serviceAdapter as any).provider = "openai";
(serviceAdapter as any).model = "gpt-4o"; 

// 5. RUNTIME INSTANCE
const runtimeInstance = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};