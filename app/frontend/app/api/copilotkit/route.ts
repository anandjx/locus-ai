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


import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { GoogleAuth } from "google-auth-library";

const AGENT_NAME = "locus";
const BASE_ENDPOINT = (process.env.AGENT_ENGINE_ENDPOINT || "").replace(":query", "");
const FINAL_ENDPOINT = `${BASE_ENDPOINT}:query`;

async function getGoogleAccessToken() {
  const base64Key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!base64Key) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
  const jsonKey = JSON.parse(Buffer.from(base64Key, "base64").toString("utf-8"));
  const auth = new GoogleAuth({
    credentials: jsonKey,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

class LocusVertexAgent {
  name: string = AGENT_NAME;
  description: string = "Locus Retail Strategy Agent";
  
  // Instance-level state preservation
  private currentThreadId: string | null = null;
  private currentMessages: any[] = [];
  private currentState: any = {};

  setMessages(messages: any[]) { 
    console.log("🔄 Syncing messages:", messages.length);
    this.currentMessages = messages;
  }
  
  setState(state: any) { 
    console.log("🔄 Syncing state:", Object.keys(state || {}));
    this.currentState = state;
  }
  
  setThreadId(threadId: string) { 
    console.log("🔄 Syncing thread:", threadId);
    this.currentThreadId = threadId;
  }
  
  setDebug(debug: boolean) { }
  
  clone() {
    const cloned = new LocusVertexAgent();
    // Preserve state in the clone
    cloned.currentThreadId = this.currentThreadId;
    cloned.currentMessages = [...this.currentMessages];
    cloned.currentState = { ...this.currentState };
    return cloned;
  }

  async execute({ messages, state, threadId }: any): Promise<any> {
    console.log(`🚀 [EXECUTE CALLED] Thread: ${threadId}, Messages: ${messages?.length || 0}`);
    
    // Use instance state if parameters are missing
    const finalMessages = messages || this.currentMessages;
    const finalState = state || this.currentState;
    const finalThreadId = threadId || this.currentThreadId || `thread_${Date.now()}`;

    if (!finalMessages || finalMessages.length === 0) {
      console.warn("⚠️ No messages to process");
      return { content: "No input received" };
    }

    try {
      const token = await getGoogleAccessToken();

      // Transform CopilotKit messages to Vertex AI format
      const transformedMessages = finalMessages.map((msg: any) => ({
        role: msg.role === "assistant" ? "model" : msg.role,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      }));

      const vertexPayload = {
        input: {
          messages: transformedMessages,
          state: finalState,
          thread_id: finalThreadId,
        },
      };

      console.log("📤 Sending to Vertex AI:", {
        endpoint: FINAL_ENDPOINT,
        messageCount: transformedMessages.length,
        threadId: finalThreadId,
      });

      const response = await fetch(FINAL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vertexPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Vertex AI API Error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        
        // Return error in CopilotKit-compatible format
        return {
          content: `Error: ${response.status} - ${errorText.substring(0, 200)}`,
          error: true,
        };
      }

      const result = await response.json();
      console.log("✅ Vertex AI Response:", {
        hasContent: !!result.content,
        hasOutput: !!result.output,
        keys: Object.keys(result),
      });
      
      // Ensure response has expected format for CopilotKit
      return {
        content: result.content || result.output || JSON.stringify(result),
        ...result,
      };
      
    } catch (error: any) {
      console.error("❌ Execution Failed:", {
        message: error.message,
        stack: error.stack?.substring(0, 300),
      });
      
      // Return error in user-friendly format
      return {
        content: `System Error: ${error.message}`,
        error: true,
      };
    }
  }
}

export const POST = async (req: NextRequest) => {
  console.log("📥 [POST] CopilotKit Request Received");
  
  try {
    const runtime = new CopilotRuntime({
      agents: {
        [AGENT_NAME]: new LocusVertexAgent() as any,
      },
    });

    const serviceAdapter = new ExperimentalEmptyAdapter();

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter,
      endpoint: "/api/copilotkit",
    });

    const response = await handleRequest(req);
    console.log("✅ [POST] Request handled successfully");
    return response;
    
  } catch (error: any) {
    console.error("❌ [POST] Handler failed:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};