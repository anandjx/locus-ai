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

// 1. FORCE NODEJS RUNTIME
export const runtime = 'nodejs';

// 2. BYPASS VALIDATION
process.env.OPENAI_API_KEY = "sk-dummy-key-for-copilotkit-validation";

// 3. SESSION CACHE (Critical for Agent Engine)
const sessionCache = new Map<string, string>();

// 4. GOOGLE AUTH
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

// 5. THE ADAPTER
const serviceAdapter = new LangChainAdapter({
  chainFn: async ({ messages, threadId }) => {
    try {
      console.log('📥 [Adapter] Processing request', { 
        messageCount: messages.length,
        threadId 
      });

      // A. Extract User Input
      const lastMessage = messages[messages.length - 1];
      const userInput = (lastMessage as any).content || "";
      
      console.log('💬 [Adapter] User input:', userInput);

      if (!userInput) {
        return "Please send a message to start the analysis.";
      }

      // B. Authenticate
      const auth = getGoogleAuthClient();
      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();
      const baseEndpoint = (process.env.AGENT_ENGINE_ENDPOINT || '').replace(':query', '');

      console.log('🔑 [Adapter] Auth token obtained');

      // C. Get or Create Session
      const sessionKey = threadId || `thread_${Date.now()}`;
      let sessionId = sessionCache.get(sessionKey);

      if (!sessionId) {
        console.log('🆕 [Adapter] Creating new session');
        
        const createSessionResp = await fetch(`${baseEndpoint}:createSession`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session: { user_id: sessionKey }
          }),
        });

        if (!createSessionResp.ok) {
          const errorText = await createSessionResp.text();
          console.error('❌ [Adapter] Session creation failed:', errorText);
          throw new Error(`Session creation failed: ${errorText}`);
        }

        const sessionData = await createSessionResp.json();
        sessionId = sessionData.name || sessionData.session_id;
        
        if (!sessionId) {
          throw new Error('No session ID returned from Vertex AI');
        }

        sessionCache.set(sessionKey, sessionId);
        console.log('✅ [Adapter] Session created:', sessionId);
      } else {
        console.log('♻️ [Adapter] Reusing session:', sessionId);
      }

      // D. Query the Agent
      const queryEndpoint = `${baseEndpoint}/sessions/${sessionId}:query`;
      console.log('📤 [Adapter] Querying agent:', queryEndpoint);

      const response = await fetch(queryEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userInput,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [Adapter] Vertex AI error:', response.status, errorText);
        return `I encountered an error (${response.status}). The agent team has been notified.`;
      }

      // E. Process Response
      const data = await response.json();
      console.log('✅ [Adapter] Response received:', {
        keys: Object.keys(data),
        hasResponse: !!data.response,
        hasOutput: !!data.output,
      });

      // Extract agent response
      const agentText = data.response || 
                       data.output || 
                       data.message ||
                       data.text || 
                       JSON.stringify(data);

      console.log('📝 [Adapter] Returning:', agentText.substring(0, 100));

      return agentText;

    } catch (error: any) {
      console.error("❌ [Adapter] Fatal error:", error.message);
      console.error("❌ [Adapter] Stack:", error.stack);
      return `System error: ${error.message}. Please try again.`;
    }
  }
});

// 6. MASQUERADE
(serviceAdapter as any).provider = "openai";
(serviceAdapter as any).model = "gpt-4o";

// 7. RUNTIME
const runtimeInstance = new CopilotRuntime();

// 8. EXPORT HANDLER
export const POST = async (req: NextRequest) => {
  console.log('📥 [POST] Request received');
  
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};