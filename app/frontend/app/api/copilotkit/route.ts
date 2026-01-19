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

export const runtime = 'nodejs';

/* ============================================================
   1. Google Auth Setup
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
   2. Custom Streaming Adapter (With Fixes)
   ============================================================ */
class VertexStreamingAdapter implements CopilotServiceAdapter {
  private endpoint: string;

  // FIX: Explicitly define the properties required by CopilotKit v1.50+
  // The runtime needs these to avoid "Unknown provider" errors.
  public name = "vertex-adapter";
  public provider = "google"; // "google" is on the allowed list
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
    const userBuffer = (lastMessage as any).content || "";

    // B. Call Vertex AI
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

      // 1. Start
      eventStream.sendTextMessageStart({
        messageId: responseId,
      });

      // 2. Content
      eventStream.sendTextMessageContent({
        messageId: responseId,
        content: agentText,
      });

      // 3. End
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
   3. Runtime Initialization
   ============================================================ */
const serviceAdapter = new VertexStreamingAdapter(
  process.env.AGENT_ENGINE_ENDPOINT || ''
);

const runtimeInstance = new CopilotRuntime();

/* ============================================================
   4. Export Handler
   ============================================================ */
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};