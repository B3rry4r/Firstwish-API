import { bearer, signIn, SignInApp, Signed, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { testHex } from "../../../../test/kit/unique";

/* Helpers for the account-sides bundle (B02). Handles are unique per call, so specs never share rows. */

export function uniqueHandle(tag = "h"): string {
  return `${tag.slice(0, 4)}${testHex(15)}`.slice(0, 20);
}

export interface Creator extends Signed {
  handle: string;
}

/** Signs in a new person and turns the creator side on with a fresh handle. */
export async function newCreator(t: SignInApp, tag = "cr"): Promise<Creator> {
  const s = await signIn(t, uniqueEmail(tag));
  const handle = uniqueHandle(tag);
  const res = await t.http().post("/v1/me/creator").set(bearer(s.accessToken)).send({ handle, name: `Creator ${tag}` });
  if (res.status !== 200) throw new Error(`creator on answered ${res.status}: ${JSON.stringify(res.body)}`);
  return { ...s, handle };
}
