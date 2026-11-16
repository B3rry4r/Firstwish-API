import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { Clock } from "../../common/ports/clock.port";

const HOUR = 3600;
/** HU1: the name a link holder with no account signs under: the email the receipt goes to (never an Account). */
export const holderKey = (email: string): string => `hold:${email.trim().toLowerCase()}`;
/** How long a receiver's proof may be used to START a keep payment. A payment already started settles whenever it is paid. */
export const PROOF_START_HOURS = 2;

/**
 * HA1: the receiver of a wish may pay a keep for it. The keep service checks the link (and its passcode) and signs the paying account
 * and the wish; the payments start and the keep handler accept a payer who is not the owner only with that signature, so a request
 * to POST /v1/payments that names someone else's wish and invents the proof is refused. Stateless: the proof is signed, not stored,
 * and the same for one account and wish within an hour, so a repeat of the same Idempotency-Key is the same request.
 */
@Injectable()
export class KeepProofs {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  issue(accountId: string, wishId: string): string {
    const exp = (Math.floor(this.clock.now().getTime() / 1000 / HOUR) + PROOF_START_HOURS) * HOUR;
    return `${exp}.${this.sign(accountId, wishId, exp)}`;
  }

  /** `fresh`: also refuse a proof past its start time (at the start); the handler at settle checks the signature only. */
  valid(proof: unknown, accountId: string | null, wishId: string | null, fresh: boolean): boolean {
    if (typeof proof !== "string" || !accountId || !wishId) return false;
    const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(proof);
    if (!m) return false;
    const exp = Number(m[1]);
    if (fresh && exp * 1000 <= this.clock.now().getTime()) return false;
    const want = Buffer.from(this.sign(accountId, wishId.toLowerCase(), exp));
    const got = Buffer.from(m[2]);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  /**
   * HS2: the proof a link holder with no account carries. The public view gives it (only to a holder the link, and its unlock where it has a
   * passcode, let in); it names the link and the wish, so it works for that wish only and for no other. Signed, not stored.
   */
  issueHold(linkId: string, wishId: string): { proof: string; expiresAt: Date } {
    const exp = (Math.floor(this.clock.now().getTime() / 1000 / HOUR) + PROOF_START_HOURS) * HOUR;
    return { proof: `${exp}.${this.signHold(linkId, wishId.toLowerCase(), exp)}`, expiresAt: new Date(exp * 1000) };
  }

  validHold(proof: unknown, linkId: string, wishId: string): boolean {
    if (typeof proof !== "string") return false;
    const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(proof);
    if (!m) return false;
    const exp = Number(m[1]);
    if (exp * 1000 <= this.clock.now().getTime()) return false;
    const want = Buffer.from(this.signHold(linkId, wishId.toLowerCase(), exp));
    const got = Buffer.from(m[2]);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  private signHold(linkId: string, wishId: string, exp: number): string {
    const key = createHmac("sha256", this.env.JWT_ACCESS_SECRET).update("hold-by-link").digest();
    return createHmac("sha256", key).update(`${linkId}.${wishId}.${exp}`).digest("base64url");
  }

  private sign(accountId: string, wishId: string, exp: number): string {
    const key = createHmac("sha256", this.env.JWT_ACCESS_SECRET).update("keep-by-link").digest();
    return createHmac("sha256", key).update(`${accountId}.${wishId}.${exp}`).digest("base64url");
  }
}
