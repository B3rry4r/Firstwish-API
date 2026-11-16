import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { isPortTimeout } from "../../common/ports/time-limit";
import { AiWritingPort } from "../../common/ports/ai.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { StyleChange } from "../../contracts";
import { CreatorStateService } from "./creator-state.service";
import { cleanDoc, isObj, json, obj, type Obj, UUID } from "./studio-doc";

/**
 * Whether the AI can answer at all. A live API with no key cannot (the env check refuses to start without one, so this is the
 * belt for a key removed at run time); the stand-in is a test provider and answers only what a test queued for it.
 */
export class AiAvailability {
  constructor(private readonly env: Pick<Env, "PROVIDERS" | "ANTHROPIC_API_KEY">) {}
  available(): boolean {
    return this.env.PROVIDERS === "standin" || (this.env.ANTHROPIC_API_KEY ?? "").trim() !== "";
  }
}
export const AI_AVAILABILITY = Symbol("AI_AVAILABILITY");

const MAX_WORDS = 2000;
const MAX_TOKENS = 4000;

const SYSTEM = [
  "You help a creator edit one Firstwish Studio style: a design document made of a theme, scenes, art, a poster and tags.",
  "Answer with ONE JSON object and nothing else. Keys: said (a list of one to three short plain sentences saying what you did),",
  "ops (a list of change objects, may be empty), and any of base, theme, scenes, made, tags that you change.",
  "You are given only the style document and the creator's own words. Never invent a photo, a person's words or a sound.",
].join(" ");

const DESIGN_KEYS = ["name", "base", "brief", "theme", "scenes", "art", "made", "tags", "still", "fallback", "poster", "holds", "ending", "opening", "piece", "sound", "soundSet", "moments", "style"];

type Kind = "studio_draft" | "studio_change";

interface Plan {
  kind: Kind;
  cost: number;
  /** What goes into the AiRequest row. */
  row: { ask?: string; instruction?: string; prompt?: string; description?: string; base?: string; made?: Prisma.InputJsonValue; target?: Prisma.InputJsonValue };
  /** The text sent to the provider: the style document and the creator's words, nothing else (T-74, R13). */
  prompt: string;
}

const words = (v: unknown, field: string, max: number): string => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw AppError.validation({ [field]: "Must be text." });
  const t = v.trim();
  if (t.length > max) throw AppError.validation({ [field]: `At most ${max} characters.` });
  return t;
};

function designOf(doc: Obj): Obj {
  const out: Obj = {};
  for (const k of DESIGN_KEYS) if (doc[k] !== undefined && doc[k] !== null) out[k] = doc[k];
  return out;
}

/** The AI's answer as a StyleChange, or null when it is not one (the credits come back and nothing invented is shown). */
export function parseChange(text: string): Omit<StyleChange, "credits"> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let v: unknown;
  try {
    v = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  const said = Array.isArray(v.said) ? v.said.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.slice(0, 500)).slice(0, 5) : [];
  if (!said.length) return null;
  if (v.ops !== undefined && (!Array.isArray(v.ops) || v.ops.length > 50 || !v.ops.every(isObj))) return null;
  if (v.scenes !== undefined && !isObj(v.scenes)) return null;
  if (v.base !== undefined && typeof v.base !== "string") return null;
  const out: Omit<StyleChange, "credits"> = { said };
  if (v.base !== undefined) out.base = v.base;
  if (v.theme !== undefined) out.theme = v.theme;
  if (v.scenes !== undefined) out.scenes = v.scenes;
  if (v.made !== undefined) out.made = v.made;
  if (v.tags !== undefined) out.tags = v.tags;
  if (v.ops !== undefined) out.ops = v.ops;
  return out;
}

/**
 * Studio AI: a full draft costs the book's `costs.draft` credits, a change `costs.change` (T-22). Credits are drawn in one
 * statement BEFORE the call and given back if the provider fails or times out; the call runs outside any transaction, through the AI
 * port only (which has its own time limit). With no key the route answers 503 and nothing is spent. The request holds the style
 * document and the creator's own words only: no customer photo, no customer words, no audio (T-74, R13).
 */
@Injectable()
export class StudioAiService {
  constructor(
    private readonly db: PrismaService,
    private readonly ai: AiWritingPort,
    private readonly ids: IdGenerator,
    private readonly state: CreatorStateService,
    @Inject(AI_AVAILABILITY) private readonly availability: AiAvailability,
  ) {}

  /** E-15 */
  async change(accountId: string, body: { ask?: string; instruction?: string; style?: unknown; styleId?: string; target?: Record<string, unknown> }): Promise<StyleChange> {
    this.requireAvailable();
    const instruction = words(body.instruction, "instruction", 240);
    const ask = words(body.ask, "ask", MAX_WORDS);
    if (!instruction && !ask) throw AppError.validation({ instruction: "Say what you want changed." });
    const doc = await this.styleOf(accountId, body.style, body.styleId);
    const target = isObj(body.target) ? body.target : {};
    const cost = (await this.state.rules(this.db)).costChange;
    return this.run(accountId, {
      kind: "studio_change",
      cost,
      row: { ask, instruction, target: json(target) },
      prompt: JSON.stringify({ task: "change", style: designOf(doc), target, instruction, ask }),
    });
  }

  /** E-16 */
  async draft(accountId: string, body: { base?: string; description?: string; made?: unknown; prompt?: string; styleId?: string }): Promise<StyleChange> {
    this.requireAvailable();
    const prompt = words(body.prompt, "prompt", MAX_WORDS);
    const description = words(body.description, "description", MAX_WORDS);
    if (!prompt && !description) throw AppError.validation({ prompt: "Describe the style you want." });
    const base = words(body.base, "base", 80);
    if (body.styleId !== undefined && !UUID.test(body.styleId)) throw AppError.notFound("No style has this id.");
    const made = isObj(body.made) ? body.made : {};
    let start: Obj = {};
    if (body.styleId) start = designOf(await this.styleOf(accountId, undefined, body.styleId));
    const cost = (await this.state.rules(this.db)).costDraft;
    return this.run(accountId, {
      kind: "studio_draft",
      cost,
      row: { prompt, description, base, made: json(made) },
      prompt: JSON.stringify({ task: "draft", base, made, start, prompt, description }),
    });
  }

  private requireAvailable(): void {
    if (!this.availability.available()) throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "The AI helper is not available right now. Nothing was spent.");
  }

  /** The style the words are about: the document sent, or the creator's own stored one (another creator's is 404). */
  private async styleOf(accountId: string, sent: unknown, styleId: string | undefined): Promise<Obj> {
    if (styleId !== undefined) {
      if (!UUID.test(styleId)) throw AppError.notFound("No style has this id.");
      const row = await this.db.studioStyle.findFirst({ where: { id: styleId, accountId } });
      if (!row) throw AppError.notFound("No style has this id.");
      if (sent === undefined) return obj(row.document);
    }
    if (sent === undefined) throw AppError.validation({ style: "Send the style, or the id of one of yours." });
    return cleanDoc(sent);
  }

  private async run(accountId: string, plan: Plan): Promise<StyleChange> {
    // 1. one short transaction: the credits go out in ONE statement and the request is written with them.
    const id = this.ids.id();
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const left = await this.state.draw(tx, accountId, plan.cost);
      if (left === null) throw new AppError(HttpStatus.PAYMENT_REQUIRED, "credits_needed", `This needs ${plan.cost} credit${plan.cost === 1 ? "" : "s"}. Buy a credit pack to go on.`);
      await tx.aiRequest.create({ data: { id, accountId, kind: plan.kind, creditsSpent: plan.cost, status: "queued", model: "pending", ...plan.row } });
    });
    // 2. the provider call, outside any transaction (the port holds its own time limit).
    let change: Omit<StyleChange, "credits"> | null = null;
    let model = "";
    let failure: unknown = null;
    try {
      const r = await this.ai.write({ system: SYSTEM, prompt: plan.prompt, maxTokens: MAX_TOKENS });
      model = r.model;
      change = parseChange(r.text);
    } catch (e) {
      failure = e;
    }
    // 3. the answer is kept, or the credits come back.
    if (change) {
      const out = change;
      const credits = await this.db.$transaction(async (tx) => {
        await tx.aiRequest.update({ where: { id }, data: { status: "done", model, output: json(out as unknown as Obj) } });
        return this.state.balance(tx, accountId);
      });
      return { ...out, credits };
    }
    await this.refund(accountId, id, plan.cost);
    if (failure && isPortTimeout(failure)) throw failure;
    throw new AppError(HttpStatus.BAD_GATEWAY, "ai_failed", "The AI helper could not answer. Your credits are back.");
  }

  /** Marks the request failed and gives its credits back, once: a second call (a retry) finds it already failed and gives nothing. */
  async refund(accountId: string, requestId: string, cost: number): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const hit = await tx.$queryRaw<{ id: string }[]>`UPDATE ai_request SET status = 'failed' WHERE id = ${requestId}::uuid AND status = 'queued' RETURNING id::text AS id`;
      if (hit.length) await this.state.giveBack(tx, accountId, cost);
    });
  }
}
