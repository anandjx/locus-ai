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
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { GoogleAuth } from "google-auth-library";

const AGENT_NAME = "locus";
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

/**
 * Custom service adapter that proxies to Vertex AI with OAuth
 */
class VertexAIServiceAdapter {
  async process(input: any): Promise<any> {
    console.log("🚀 [Vertex Proxy] Processing request");
    console.log("📊 [Vertex Proxy] Input keys:", Object.keys(input || {}));

    try {
      const token = await getGoogleAccessToken();
      console.log("🔑 [Vertex Proxy] OAuth token obtained");

      // Forward the request to Vertex AI exactly as CopilotKit sends it
      const vertexPayload = {
        input: input,
      };

      const endpoint = `${VERTEX_ENDPOINT}:query`;
      console.log("📤 [Vertex Proxy] Calling:", endpoint);
      console.log("📤 [Vertex Proxy] Payload:", JSON.stringify(vertexPayload).substring(0, 500));

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vertexPayload),
      });

      console.log(`📥 [Vertex Proxy] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ [Vertex Proxy] Error:", errorText.substring(0, 500));
        throw new Error(`Vertex AI error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ [Vertex Proxy] Success!");
      console.log("✅ [Vertex Proxy] Response keys:", Object.keys(result));
      console.log("✅ [Vertex Proxy] Full response:", JSON.stringify(result, null, 2));

      return result;

    } catch (error: any) {
      console.error("❌ [Vertex Proxy] Exception:", error.message);
      console.error("❌ [Vertex Proxy] Stack:", error.stack);
      throw error;
    }
  }
}

export const POST = async (req: NextRequest) => {
  console.log("=".repeat(80));
  console.log("📥 [POST] CopilotKit request at", new Date().toISOString());
  console.log("=".repeat(80));

  try {
    const serviceAdapter = new VertexAIServiceAdapter();

    const runtime = new CopilotRuntime();

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter: serviceAdapter as any,
      endpoint: "/api/copilotkit",
    });

    const response = await handleRequest(req);
    console.log("✅ [POST] Response ready");
    return response;

  } catch (error: any) {
    console.error("❌ [POST] Fatal error:", error.message);
    console.error("❌ [POST] Stack:", error.stack);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};