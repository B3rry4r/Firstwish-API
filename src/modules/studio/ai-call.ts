import type { AiWritingPort } from "../../common/ports/ai.port";

/**
 * The one way an answer is asked of the AI port and checked: the call, then the caller's own check of the text. A throw (a timeout, a
 * provider error) or an answer the check refuses gives `value: null` and the failure; nothing here writes a row or spends anything.
 * Studio AI and the sender's writing both use it. The caller runs it outside any database transaction (the port holds its own time limit).
 */
export async function askAi<T>(
  ai: AiWritingPort,
  req: { system?: string; prompt: string; maxTokens: number },
  parse: (text: string) => T | null,
): Promise<{ value: T | null; model: string; failure: unknown }> {
  try {
    const r = await ai.write(req);
    return { value: parse(r.text), model: r.model, failure: null };
  } catch (failure) {
    return { value: null, model: "", failure };
  }
}
