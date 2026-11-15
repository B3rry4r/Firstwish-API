export interface WriteRequest {
  system?: string;
  prompt: string;
  maxTokens: number;
}
export interface WriteResult {
  text: string;
  model: string;
}

/** AI writing (Anthropic). Never answered by a stand-in in production: the env check refuses PROVIDERS=standin there. */
export abstract class AiWritingPort {
  abstract write(input: WriteRequest): Promise<WriteResult>;
}
