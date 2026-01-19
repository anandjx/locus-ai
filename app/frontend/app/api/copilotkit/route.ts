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

// 1. FORCE NODEJS RUNTIME
export const runtime = 'nodejs';

/* ============================================================
   2. CRITICAL: BYPASS VALIDATION & HIJACKING
   ============================================================ */
// We provide a dummy OpenAI key. The SDK checks for this environment variable
// presence during initialization, even though we won't use it.
process.env.OPENAI_API_KEY = "sk-dummy-key-for-copilotkit-validation";

/* ============================================================
   3. GOOGLE AUTH SETUP (Your Actual Backend)
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
   4. THE ADAPTER (The Bridge)
   ============================================================ */
// We use LangChainAdapter because it handles the CopilotKit v1.50 streaming protocol automatically.
// We use 'chainFn' to insert your custom Vertex logic.
const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages }) => {
    try {
      // A. Extract User Input
      const lastMessage = messages[messages.length - 1];
      const userBuffer = (lastMessage as any).content || "";

      // B. Authenticate & Call Vertex AI
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
        return `System Error: Vertex Agent Engine returned ${response.status}. Check Vercel logs.`;
      }

      // C. Process Response
      const data = await response.json();
      // Extract text from Vertex response structure
      const agentText = data.output || data.text || JSON.stringify(data);

      // D. Return Text
      // The adapter will automatically stream this text to the frontend
      return agentText;

    } catch (error) {
      console.error("Adapter Execution Error:", error);
      return "An internal error occurred while connecting to the agent.";
    }
  }
});

/* ============================================================
   5. THE MASQUERADE (Satisfying Telemetry)
   ============================================================ */
// We explicitly set the provider to "openai". 
// 1. This satisfies the TelemetryRunner's "supported providers" check (Unknown provider error fixed).
// 2. This prevents the Vercel AI SDK from hijacking the call to Google's public API (Quota error fixed).
// 3. Our custom 'chainFn' above ensures we actually call Vertex, not OpenAI.
(serviceAdapter as any).provider = "openai";
(serviceAdapter as any).model = "gpt-4o";

/* ============================================================
   6. RUNTIME CONFIGURATION
   ============================================================ */
const runtimeInstance = new CopilotRuntime({
  // Discord Advice: "Register your backend as an agent"
  // When we provide a 'serviceAdapter', CopilotKit v1.50 automatically 
  // wraps it in a BuiltInAgent named "default".
  // This matches your frontend config: agentName: "default"
});

/* ============================================================
   7. EXPORT HANDLER
   ============================================================ */
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};