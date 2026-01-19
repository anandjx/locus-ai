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

// 1. Force Node.js Runtime
export const runtime = 'nodejs';

/* ============================================================
   2. Google Auth Setup (Vertex AI Service Account)
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
   3. Custom Adapter (No Provider Declaration)
   ============================================================ */
class VertexCustomAdapter implements CopilotServiceAdapter {
  private endpoint: string;

  // We define a name for debugging, but we deliberately OMIT 'provider' and 'model'.
  // This prevents the Vercel AI SDK from hijacking the request.
  public name = "vertex-agent-engine";

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

    // B. Call Vertex AI (The REAL backend)
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
        // session_id: threadId // Uncomment if your agent supports sessions
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex API Error:', response.status, errorText);
      throw new Error(`Vertex Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const agentText = data.output || data.text || JSON.stringify(data);

    // C. Stream Response Manually
    // We use the eventSource to stream data according to v1.50 protocol
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
   4. Runtime Initialization (With Type Fixes)
   ============================================================ */
const serviceAdapter = new VertexCustomAdapter(
  process.env.AGENT_ENGINE_ENDPOINT || ''
);

const runtimeInstance = new CopilotRuntime({
  // CRITICAL: We strictly disable observability.
  // We must provide ALL properties (progressive, hooks) to satisfy the strict TypeScript definition
  // in your installed version, even though enabled is false.
  observability_c: {
    enabled: false,
    progressive: false,
    hooks: {
      handleRequest: async (data) => {},
      handleResponse: async (data) => {},
      handleError: async (data) => {},
    }
  },
});

/* ============================================================
   5. Export Handler
   ============================================================ */
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};