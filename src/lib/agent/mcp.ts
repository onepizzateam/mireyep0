const MIREYE_MCP = "https://api.mireye.com/mcp";

async function request(method: string, params: Record<string, unknown>) {
  const res = await fetch(MIREYE_MCP, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MIREYE_BEARER_TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: crypto.randomUUID() }),
  });
  if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`MCP ${method} error: ${json.error.message}`);
  return json.result;
}

export function mcpTool(tool: string, args: Record<string, unknown>) {
  return request("tools/call", { name: tool, arguments: args });
}

export function mcpResource(uri: string) {
  return request("resources/read", { uri });
}
