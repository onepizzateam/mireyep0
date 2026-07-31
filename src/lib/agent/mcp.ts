import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MIREYE_MCP = "https://api.mireye.com/mcp";
const REQUEST_TIMEOUT = 120_000;

type Session = {
  client: Client;
  transport: StreamableHTTPClientTransport;
};

let sessionPromise: Promise<Session> | undefined;
let authTokenCalls = 0;

function getBearerToken() {
  const token = process.env.MIREYE_MCP_ACCESS_TOKEN ?? process.env.MIREYE_BEARER_TOKEN;
  if (!token) throw new Error("MIREYE_BEARER_TOKEN missing");
  return token;
}

function isAuthenticationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /401|unauthorized|authentication/i.test(message);
}

function shouldRetry(error: unknown) {
  if (error instanceof Error && error.message === "MIREYE_BEARER_TOKEN missing") return false;
  return !isAuthenticationError(error);
}

async function createSession(): Promise<Session> {
  try {
    const authProvider: OAuthClientProvider = {
      redirectUrl: undefined,
      clientMetadata: {
        redirect_uris: [],
        token_endpoint_auth_method: "none",
        grant_types: ["client_credentials"],
      },
      clientInformation: async () => undefined,
      tokens: async () => {
        authTokenCalls += 1;
        console.log(`Mireye MCP authProvider.tokens() called (${authTokenCalls})`);
        return {
          access_token: getBearerToken(),
          token_type: "Bearer",
        };
      },
      saveTokens: async () => {
        console.log("Mireye MCP authProvider.saveTokens() called");
      },
      redirectToAuthorization: async (authorizationUrl) => {
        console.log(`Mireye MCP OAuth authorization URL: ${authorizationUrl}`);
      },
      saveCodeVerifier: async () => undefined,
      codeVerifier: async () => "",
    };
    const transport = new StreamableHTTPClientTransport(new URL(MIREYE_MCP), {
      authProvider,
      reconnectionOptions: {
        maxRetries: 1,
        initialReconnectionDelay: 250,
        maxReconnectionDelay: 1_000,
        reconnectionDelayGrowFactor: 2,
      },
    });
    const client = new Client(
      { name: "signalrent", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    console.log("Mireye MCP connected and initialized");
    return { client, transport };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      console.warn(`Mireye MCP UnauthorizedError: ${error.message}`);
    }
    if (isAuthenticationError(error)) {
      throw new Error("Mireye MCP authentication failed", { cause: error });
    }
    throw new Error("Unable to initialize Mireye MCP session", { cause: error });
  }
}

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = createSession().catch((error) => {
      sessionPromise = undefined;
      throw error;
    });
  }
  return sessionPromise;
}

async function reconnect() {
  const current = sessionPromise;
  sessionPromise = undefined;
  if (current) {
    try {
      (await current).transport.close();
    } catch {
      // The failed transport may already be closed.
    }
  }
  return getSession();
}

function decodePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function decodeToolResult(result: { structuredContent?: unknown; content?: Array<{ type: string; text?: string; [key: string]: unknown }> } | { [key: string]: unknown }) {
  const toolResult = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string; [key: string]: unknown }> };
  if (toolResult.structuredContent !== undefined) return toolResult.structuredContent;
  const textContent = toolResult.content?.find((item) => item.type === "text" && item.text !== undefined);
  if (textContent?.text !== undefined) return decodePayload(textContent.text);
  return toolResult.content ?? result;
}

function decodeResourceResult(result: { contents?: Array<{ text?: string; blob?: string; [key: string]: unknown }> }) {
  const content = result.contents?.[0];
  if (!content) return result;
  if (content.text !== undefined) return decodePayload(content.text);
  if (content.blob !== undefined) return decodePayload(content.blob);
  return content;
}

export async function mcpTool(tool: string, args: Record<string, unknown>): Promise<never> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { client } = await getSession();
      console.log(`Mireye MCP tool: ${tool}`);
      const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT });
      if (result.isError) {
        const message = decodeToolResult(result);
        const requestId = (result as { request_id?: string }).request_id;
        throw new Error(`Mireye MCP tool ${tool} failed: ${String(message)}${requestId ? ` (${requestId})` : ""}`);
      }
      return decodeToolResult(result) as never;
    } catch (error) {
    if (error instanceof UnauthorizedError) {
      console.warn(`Mireye MCP UnauthorizedError: ${error.message}`);
    }
      if (attempt === 0 && shouldRetry(error)) {
        await reconnect();
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Mireye MCP tool ${tool} failed`);
}

export async function mcpResource(uri: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { client } = await getSession();
      console.log(`Mireye MCP resource: ${uri}`);
      return decodeResourceResult(await client.readResource({ uri }, { timeout: REQUEST_TIMEOUT }));
    } catch (error) {
      if (attempt === 0 && shouldRetry(error)) {
        await reconnect();
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Mireye MCP resource ${uri} failed`);
}
