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
  CopilotServiceAdapter,
  CopilotRuntimeChatCompletionRequest,
  CopilotRuntimeChatCompletionResponse,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { GoogleAuth } from 'google-auth-library';

// 1. Setup Google Auth Client
// We decodes the base64 key to avoid file system issues in Vercel Serverless
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

// 2. Define the Custom Adapter for Vertex AI Agent Engine
class VertexReasoningEngineAdapter implements CopilotServiceAdapter {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async process(
    request: CopilotRuntimeChatCompletionRequest
  ): Promise<CopilotRuntimeChatCompletionResponse> {
    const { messages, threadId } = request;
    
    // Extract the latest user message
    const lastMessage = messages[messages.length - 1];
    const userBuffer = lastMessage.content;

    // Get OAuth Token
    const auth = getGoogleAuthClient();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to generate Google Access Token');
    }

    // 3. Call Vertex AI Agent Engine (REST API)
    // Structure matches the standard AdkApp :query interface
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          text: userBuffer
          // Pass threadId here if your Python agent supports session handling
          // session_id: threadId 
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex API Error:', response.status, errorText);
      throw new Error(`Vertex Agent Engine error: ${response.statusText}`);
    }

    const data = await response.json();

    // 4. Translate Vertex Response -> CopilotKit Response
    // Agent Engine typically returns { output: "..." } or { text: "..." }
    // We strictly typecheck or fallback to stringifying the data
    const agentText = data.output || data.text || JSON.stringify(data);

    return {
      threadId,
      // We wrap the result in a generated message
      generatedOutputs: [
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: agentText,
        },
      ],
    };
  }
}

// 5. Initialize Runtime with the Adapter
const serviceAdapter = new VertexReasoningEngineAdapter(
  process.env.AGENT_ENGINE_ENDPOINT || ''
);

const runtime = new CopilotRuntime();

// 6. Export the Handler
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};