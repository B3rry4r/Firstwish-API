import { AiWritingPort, WriteRequest, WriteResult } from "../ai.port";
import { postJson } from "./http";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

interface MessagesResponse {
  model: string;
  content: { type: string; text?: string }[];
}

/** Anthropic Messages API. The model id comes from ANTHROPIC_MODEL. */
export class AnthropicWriting extends AiWritingPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = ANTHROPIC_BASE_URL,
  ) {
    super();
  }

  async write(input: WriteRequest): Promise<WriteResult> {
    const r = await postJson<MessagesResponse>(
      "anthropic",
      `${this.baseUrl}/v1/messages`,
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: input.maxTokens,
        ...(input.system ? { system: input.system } : {}),
        messages: [{ role: "user", content: input.prompt }],
      },
    );
    const text = r.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("");
    return { text, model: r.model };
  }
}
