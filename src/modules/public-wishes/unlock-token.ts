import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";

export const UNLOCK_SECONDS = 15 * 60;

/**
 * The unlock token: short-lived, bound to one link and to the passcode it opened (a changed passcode ends it). It is signed, not
 * stored; the page keeps it in memory only (R10) and sends it in the x-unlock-token header.
 */
@Injectable()
export class UnlockTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  issue(linkId: string, passcodeHash: string | null): { token: string; expiresAt: Date } {
    const exp = Math.floor(this.clock.now().getTime() / 1000) + UNLOCK_SECONDS;
    return { token: `${exp}.${this.sign(linkId, exp, passcodeHash)}`, expiresAt: new Date(exp * 1000) };
  }

  valid(token: string | undefined, linkId: string, passcodeHash: string | null): boolean {
    const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
    if (!m) return false;
    const exp = Number(m[1]);
    if (exp * 1000 <= this.clock.now().getTime()) return false;
    const want = Buffer.from(this.sign(linkId, exp, passcodeHash));
    const got = Buffer.from(m[2]);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  private sign(linkId: string, exp: number, passcodeHash: string | null): string {
    const key = createHmac("sha256", this.env.JWT_ACCESS_SECRET).update("wish-unlock").digest();
    const bound = createHash("sha256").update(passcodeHash ?? "").digest("hex").slice(0, 16);
    return createHmac("sha256", key).update(`${linkId}.${exp}.${bound}`).digest("base64url");
  }
}
