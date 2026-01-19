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
import crypto from 'crypto';

// 1. RUNTIME CONFIG
export const runtime = 'nodejs';

// 2. CRITICAL FIX: Bypass Vercel AI SDK Validation
// The SDK sees provider="google" and demands this key. 
// We provide a dummy value to satisfy the check. 
// Our actual code ignores this and uses the Service Account below.
process.env.GOOGLE_GENERATIVE_AI_API_KEY = "dummy-key-to-bypass-sdk-validation";

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
   4. Custom Adapter
   ============================================================ */
class VertexStreamingAdapter implements CopilotServiceAdapter {
  private endpoint: string;

  // We must define these to satisfy CopilotKit v1.50+ validation
  public name = "vertex-adapter";
  public provider = "google"; // This triggers the check we just bypassed
  public model = "agent-engine";

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async process(
    request: CopilotRuntimeChatCompletionRequest
  ): Promise<CopilotRuntimeChatCompletionResponse> {
    const { messages, threadId, eventSource } = request;

    // A. Extract User Input
    const lastMessage = messages[messages.length - 1];
    // Safe cast to handle strict message types
    const userBuffer = (lastMessage as any).content || "";

    // B. Call Vertex AI
    // We use the Service Account (OAuth2) here, NOT the API key
    const auth = getGoogleAuthClient();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const response = await fetch(this.endpoint, {
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
      throw new Error(`Vertex Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const agentText = data.output || data.text || JSON.stringify(data);

    // C. STREAM THE RESPONSE
    await eventSource.stream(async (eventStream) => {
      const responseId = crypto.randomUUID();

      eventStream.sendTextMessageStart({
        messageId: responseId,
      });

      eventStream.sendTextMessageContent({
        messageId: responseId,
        content: agentText,
      });

      eventStream.sendTextMessageEnd({
        messageId: responseId,
      });
    });

    // D. Return Metadata Only
    return {
      threadId: threadId || crypto.randomUUID(),
    };
  }
}

/* ============================================================
   5. Initialize & Export
   ============================================================ */
const serviceAdapter = new VertexStreamingAdapter(
  process.env.AGENT_ENGINE_ENDPOINT || ''
);

const runtimeInstance = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};