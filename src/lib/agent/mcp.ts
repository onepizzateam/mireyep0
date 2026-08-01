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
const CACHE_TTL_MS = Number(process.env.MIREYE_CACHE_TTL_MS ?? 86_400_000);
const lookupCache = new Map<string, { expires: number; value: unknown }>();
const resourceCache = new Map<string, { expires: number; value: unknown }>();
export type McpUsage = { initialize: number; connect: number; lookup: number; fetch: number; ask: number; catalog: number; presets: number; retries: number; reconnects: number; total: number };
const emptyUsage = (): McpUsage => ({ initialize: 0, connect: 0, lookup: 0, fetch: 0, ask: 0, catalog: 0, presets: 0, retries: 0, reconnects: 0, total: 0 });
let activeUsage: McpUsage | undefined;
function record(kind: keyof McpUsage) { if (activeUsage) { activeUsage[kind] += 1; activeUsage.total += 1; } }
export function beginMcpUsage() { activeUsage = emptyUsage(); return () => { const result = activeUsage ?? emptyUsage(); activeUsage = undefined; return result; }; }

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
  const message = error instanceof Error ? error.message : String(error);
  return !/credits_exhausted|quota|rate.?limit|validation|invalid|unauthorized|authentication|\b401\b|\b403\b/i.test(message);
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
        return {
          access_token: getBearerToken(),
          token_type: "Bearer",
        };
      },
      saveTokens: async () => {
      },
      redirectToAuthorization: async (authorizationUrl) => {
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

    record("initialize"); await client.connect(transport); record("connect");
    return { client, transport };
  } catch (error) {
    console.error("Mireye MCP session initialization failed", error instanceof Error ? error.message : String(error));
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
  record("reconnects");
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
  const cacheKey = tool === "mireye_lookup" ? JSON.stringify(args) : undefined;
  if (cacheKey) { const cached = lookupCache.get(cacheKey); if (cached && cached.expires > Date.now()) return cached.value as never; }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { client } = await getSession();
      record(tool === "mireye_lookup" ? "lookup" : tool === "mireye_fetch" ? "fetch" : tool === "mireye_ask" ? "ask" : "total");
      const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT });
      if (result.isError) {
        const message = decodeToolResult(result);
        const requestId = (result as { request_id?: string }).request_id;
        throw new Error(`Mireye MCP tool ${tool} failed: ${String(message)}${requestId ? ` (${requestId})` : ""}`);
      }
      const value = decodeToolResult(result); if (cacheKey) lookupCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, value }); return value as never;
    } catch (error) {
      console.error(`Mireye MCP tool ${tool} request failed`, error instanceof Error ? error.message : String(error));
    if (error instanceof UnauthorizedError) {
      console.warn(`Mireye MCP UnauthorizedError: ${error.message}`);
    }
      if (attempt === 0 && shouldRetry(error)) {
        record("retries");
        await reconnect();
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Mireye MCP tool ${tool} failed`);
}

export async function mcpResource(uri: string) {
  const cached = resourceCache.get(uri); if (cached && cached.expires > Date.now()) return cached.value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { client } = await getSession();
      record(uri.endsWith("/fields") ? "catalog" : uri.endsWith("/presets") ? "presets" : "total"); const value = decodeResourceResult(await client.readResource({ uri }, { timeout: REQUEST_TIMEOUT })); resourceCache.set(uri, { expires: Date.now() + CACHE_TTL_MS, value }); return value;
    } catch (error) {
      console.error(`Mireye MCP resource ${uri} request failed`, error instanceof Error ? error.message : String(error));
      if (attempt === 0 && shouldRetry(error)) {
        record("retries");
        await reconnect();
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Mireye MCP resource ${uri} failed`);
}
