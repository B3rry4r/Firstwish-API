import { AiWritingPort, WriteRequest, WriteResult } from "../ai.port";
import { getJson, postJson } from "./http";
import { type PortPing, pingWith } from "../ping";

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

  /** FB4: one authenticated read of the model list (a page of one); it costs nothing. NOT RUN against Anthropic. */
  ping(): Promise<PortPing> {
    return pingWith(() => getJson("anthropic", `${this.baseUrl}/v1/models?limit=1`, { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }), [this.apiKey]);
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
