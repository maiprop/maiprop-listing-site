const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export function getOpenAIModel(envVar = "OPENAI_MODEL", fallback = "gpt-4.1-mini"): string {
  return Deno.env.get(envVar) ?? fallback;
}

export function requireOpenAIKey(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return apiKey;
}

export async function openAIChatCompletion(
  body: Record<string, unknown>,
  model = getOpenAIModel(),
): Promise<Response> {
  return fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      ...body,
    }),
  });
}

export function readOpenAITextContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  return (payload as { choices?: Array<{ message?: { content?: string } }> })
    .choices?.[0]?.message?.content ?? "";
}
