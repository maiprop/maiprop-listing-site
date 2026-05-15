const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function getOpenAIModel(envVar = "OPENAI_MODEL", fallback = "gpt-4.1-mini"): string {
  return Deno.env.get(envVar) ?? fallback;
}

export function getGeminiModel(envVar = "GEMINI_MODEL", fallback = "gemini-2.5-flash"): string {
  return Deno.env.get(envVar) ?? fallback;
}

export function getOpenAIReasoningEffort(): string | null {
  return Deno.env.get("OPENAI_REASONING_EFFORT") ?? null;
}

export function hasAIProviderCredentials(): boolean {
  return Boolean(Deno.env.get("GEMINI_API_KEY") || Deno.env.get("OPENAI_API_KEY"));
}

export function requireOpenAIKey(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return apiKey;
}

export function requireAIProviderKey(): string {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("AI provider key not configured");
  return apiKey;
}

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

function getPromptText(body: Record<string, unknown>): string {
  const messages = body.messages;
  if (!Array.isArray(messages)) return "";
  return messages
    .map((message) => {
      const item = message as ChatMessage;
      const role = typeof item.role === "string" ? item.role : "user";
      const content = typeof item.content === "string" ? item.content : "";
      return content ? `${role.toUpperCase()}:\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function getSystemInstruction(body: Record<string, unknown>): { parts: Array<{ text: string }> } | undefined {
  const messages = body.messages;
  if (!Array.isArray(messages)) return undefined;
  const systemText = messages
    .map((message) => message as ChatMessage)
    .filter((message) => message.role === "system" && typeof message.content === "string")
    .map((message) => message.content as string)
    .join("\n\n")
    .trim();
  return systemText ? { parts: [{ text: systemText }] } : undefined;
}

function wantsJsonResponse(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return normalized.includes("return only valid json") ||
    normalized.includes("output (json only)") ||
    normalized.includes("return only the json object");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geminiGenerateContent(
  body: Record<string, unknown>,
  model = getGeminiModel(),
): Promise<Response> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const prompt = getPromptText(body);
  const maxOutputTokens = typeof body.max_tokens === "number" ? body.max_tokens : undefined;
  const temperature = typeof body.temperature === "number" ? body.temperature : undefined;
  const geminiModel = model.startsWith("gemini-") ? model : getGeminiModel();
  const systemInstruction = getSystemInstruction(body);
  const generationConfig = {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(wantsJsonResponse(prompt) ? { responseMimeType: "application/json" } : {}),
  };

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${GEMINI_API_BASE_URL}/${geminiModel}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(systemInstruction ? { systemInstruction } : {}),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < 2) await sleep(750 * (attempt + 1));
  }

  return response!;
}

export async function openAIChatCompletion(
  body: Record<string, unknown>,
  model = getOpenAIModel(),
): Promise<Response> {
  if (Deno.env.get("GEMINI_API_KEY")) return geminiGenerateContent(body, model);

  const reasoningEffort = getOpenAIReasoningEffort();
  return fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      ...(reasoningEffort && body.reasoning_effort === undefined
        ? { reasoning_effort: reasoningEffort }
        : {}),
      ...body,
    }),
  });
}

export function readOpenAITextContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const openAIContent = (payload as { choices?: Array<{ message?: { content?: string } }> })
    .choices?.[0]?.message?.content;
  if (openAIContent) return openAIContent;

  return (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("") ?? "";
}
