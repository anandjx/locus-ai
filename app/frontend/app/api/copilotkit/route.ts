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


import { CopilotRuntime, copilotRuntimeNextJSAppRouterEndpoint } from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { GoogleAuth } from "google-auth-library";

const VERTEX_ENDPOINT = process.env.AGENT_ENGINE_ENDPOINT?.replace(":query", "") || "";

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

export const POST = async (req: NextRequest) => {
  console.log("================================================================================");
  console.log("📥 [CopilotKit] Request received at", new Date().toISOString());
  console.log("================================================================================");

  try {
    // Parse the incoming CopilotKit request
    const body = await req.json();
    console.log("📊 [CopilotKit] Request body keys:", Object.keys(body));
    console.log("📊 [CopilotKit] Messages:", body.messages?.length || 0);

    const token = await getGoogleAccessToken();
    console.log("🔑 [Auth] OAuth token obtained");

    // Extract the latest user message
    const messages = body.messages || [];
    const lastMessage = messages[messages.length - 1];
    const userInput = lastMessage?.content || "";

    console.log("💬 [Input] User message:", userInput);

    // Call Vertex AI Agent Engine with the correct format
    const vertexPayload = {
      input: {
        text: userInput,
        // If your agent expects state, add it here:
        // state: body.state || {},
      },
    };

    const endpoint = `${VERTEX_ENDPOINT}:query`;
    console.log("📤 [Vertex] Calling:", endpoint);
    console.log("📤 [Vertex] Payload:", JSON.stringify(vertexPayload));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vertexPayload),
    });

    console.log(`📥 [Vertex] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [Vertex] Error:", errorText);
      
      return new Response(
        JSON.stringify({
          messages: [
            ...messages,
            {
              role: "assistant",
              content: `I encountered an error: ${response.status} - ${errorText.substring(0, 200)}`,
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const result = await response.json();
    console.log("✅ [Vertex] Success!");
    console.log("✅ [Vertex] Response keys:", Object.keys(result));
    console.log("✅ [Vertex] Full response:", JSON.stringify(result, null, 2));

    // Extract the response content from Vertex AI's format
    let assistantMessage = "";
    let agentState = {};

    // Vertex AI Agent Engine returns different structures - adapt based on what you see in logs
    if (result.output) {
      assistantMessage = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    } else if (result.response) {
      assistantMessage = result.response;
    } else if (result.content) {
      assistantMessage = result.content;
    } else {
      assistantMessage = JSON.stringify(result);
    }

    // Extract state if present
    if (result.state) {
      agentState = result.state;
    }

    console.log("📝 [Response] Assistant message length:", assistantMessage.length);
    console.log("📝 [Response] State:", agentState);

    // Return in CopilotKit format
    return new Response(
      JSON.stringify({
        messages: [
          ...messages,
          {
            role: "assistant",
            content: assistantMessage,
          },
        ],
        state: agentState,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("❌ [Error] Fatal error:", error.message);
    console.error("❌ [Error] Stack:", error.stack);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
