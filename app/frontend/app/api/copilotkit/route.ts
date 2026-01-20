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

export const runtime = 'nodejs';

/**
 * AUTH HELPER: Decodes the Base64 Service Account and creates a GoogleAuth client.
 * This ensures we are using "Real" auth, not dummy keys.
 */
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

/**
 * SESSION CACHE: Maps CopilotKit threadIds to Vertex AI Session IDs.
 * Vertex AI requires a specific session resource to maintain history.
 */
const sessionCache = new Map<string, string>();

/**
 * ADAPTER: Connects CopilotKit to Vertex AI Agent Engine.
 */
const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages, threadId }) => {
    try {
      console.log('🚀 [Vertex Adapter] Processing request for thread:', threadId);

      // 1. Extract the latest user message
      const lastMessage = messages[messages.length - 1];
      const userInput = (lastMessage as any).content || "";
      
      if (!userInput) return "I'm listening...";

      // 2. Authenticate
      const auth = getGoogleAuthClient();
      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();
      const token = accessToken.token;

      if (!token) throw new Error("Failed to generate Google Access Token");

      const projectId = process.env.GOOGLE_CLOUD_PROJECT;
      const location = process.env.GOOGLE_CLOUD_LOCATION;
      const resourceId = process.env.AGENT_ENGINE_RESOURCE_ID; // The ID usually starting with numbers

      if (!projectId || !location || !resourceId) {
        throw new Error("Missing Vertex AI environment variables (PROJECT, LOCATION, or RESOURCE_ID)");
      }

      // 3. Manage Vertex AI Session
      // We check if we already have a Vertex Session ID for this Copilot thread.
      // If not, we could create one, but for simplicity/robustness with Agent Engine,
      // we often let the engine handle transient context or map it manually.
      // Here we map 1:1 if your agent supports session persistence.
      
      // NOTE: Agent Engine API format is:
      // POST https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/reasoningEngines/{id}:query
      
      const baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/reasoningEngines/${resourceId}`;
      const queryEndpoint = `${baseUrl}:query`;

      console.log('📡 [Vertex Adapter] Querying Agent Engine:', queryEndpoint);

      // 4. Call Agent Engine
      const response = await fetch(queryEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { query: userInput } // The standard ADK/Reasoning Engine input schema
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [Vertex Adapter] API Error:', response.status, errorText);
        return `Error connecting to Locus Brain: ${response.status} - ${response.statusText}`;
      }

      // 5. Process Response
      // Agent Engine returns a JSON object. We need to extract the text/answer.
      const data = await response.json();
      console.log('✅ [Vertex Adapter] Received response payload');

      // The ADK Agent Engine response structure typically wraps the output.
      // It might look like { output: "..." } or { result: "..." } depending on your agent definition.
      // We attempt to find the text content.
      let agentResponse = 
        data.output || 
        data.result || 
        data.response || 
        (typeof data === 'string' ? data : JSON.stringify(data));

      // Handle complex object returns (e.g. if agent returns a dict)
      if (typeof agentResponse === 'object') {
        agentResponse = JSON.stringify(agentResponse, null, 2);
      }

      return agentResponse;

    } catch (error: any) {
      console.error("🔥 [Vertex Adapter] Fatal Error:", error);
      return `System Error: ${error.message}`;
    }
  }
});

const runtimeInstance = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};