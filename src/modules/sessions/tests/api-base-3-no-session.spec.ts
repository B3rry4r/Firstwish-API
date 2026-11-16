import { SessionFamilies } from "../../../common/auth/session-families";
import { IdGenerator } from "../../../common/ports/ids.port";
import { refreshCookieOf, signIn, SignInApp, signInApp, uniqueEmail } from "./sign-in.kit";

/** API-BASE-3, HM6 (DEC-216): a refresh with no cookie, or a malformed one, answers 401 no_session; every other ended session keeps unauthorized and its words. */
describe("HM6 no_session on refresh (E-159, E-234)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const WORDS = "Your session has ended. Sign in again.";
  const user = (cookie?: string) => {
    const r = t.http().post("/v1/auth/refresh");
    return cookie === undefined ? r : r.set("Cookie", `other=1; fw_refresh=${cookie}`);
  };
  const staff = (cookie?: string) => {
    const r = t.http().post("/v1/admin/auth/refresh");
    return cookie === undefined ? r : r.set("Cookie", `fw_staff_refresh=${cookie}`);
  };
  const code = (r: { status: number; body: { error?: { code?: string; message?: string } } }) => [r.status, r.body.error?.code];

  it("no cookie at all, an empty cookie and a cookie that is not a refresh cookie: 401 no_session", async () => {
    const none = await user();
    expect(code(none)).toEqual([401, "no_session"]);
    expect(none.body.error?.message).toBe("There is no session. Sign in to continue.");
    expect(code(await user(""))).toEqual([401, "no_session"]);
    expect(code(await user("not-a-cookie"))).toEqual([401, "no_session"]);
    expect(code(await user("abc.def"))).toEqual([401, "no_session"]);
  });

  it("an ended, reused, signed-out, expired, forged or erased session keeps 401 unauthorized and its words", async () => {
    const forgedFrom = await signIn(t, uniqueEmail("hm6f"));
    const forged = await user(`${forgedFrom.cookie.split(".")[0]}.${"A".repeat(43)}`);
    expect(code(forged)).toEqual([401, "unauthorized"]);
    expect(forged.body.error?.message).toBe(WORDS);

    const reused = await signIn(t, uniqueEmail("hm6r"));
    const first = await user(reused.cookie);
    expect(first.status).toBe(200);
    t.clock.advance(11_000);
    const again = await user(reused.cookie);
    expect(code(again)).toEqual([401, "unauthorized"]);
    expect(again.body.error?.message).toBe(WORDS);
    expect(code(await user(refreshCookieOf(first)!))).toEqual([401, "unauthorized"]);

    const out = await signIn(t, uniqueEmail("hm6o"));
    expect((await t.http().post("/v1/auth/sign-out").set({ Authorization: `Bearer ${out.accessToken}` })).status).toBe(204);
    const ended = await user(out.cookie);
    expect(code(ended)).toEqual([401, "unauthorized"]);
    expect(ended.body.error?.message).toBe(WORDS);

    const gone = await signIn(t, uniqueEmail("hm6e"));
    await t.db.account.update({ where: { id: gone.accountId }, data: { erasedAt: new Date() } });
    const erased = await user(gone.cookie);
    expect(code(erased)).toEqual([401, "unauthorized"]);
    expect(erased.body.error?.message).toBe(WORDS);

    const old = await signIn(t, uniqueEmail("hm6x"));
    t.clock.advance(30 * 24 * 3600 * 1000 + 1000);
    const expired = await user(old.cookie);
    expect(code(expired)).toEqual([401, "unauthorized"]);
  });

  it("staff refresh: no cookie or a malformed one is no_session; an ended or reused staff session keeps unauthorized and its words", async () => {
    expect(code(await staff())).toEqual([401, "no_session"]);
    expect(code(await staff("not-a-cookie"))).toEqual([401, "no_session"]);
    const families = t.app.get(SessionFamilies);
    const make = async () => {
      const staffId = t.app.get(IdGenerator).id();
      await t.db.staffAccount.create({ data: { id: staffId, email: uniqueEmail("hm6s"), name: "Staff", roles: ["support"], status: "active" } });
      return { staffId, started: await families.start(t.db, { kind: "staff", staffId }, {}, { seconds: 3600, fromSignIn: true }) };
    };
    const a = await make();
    const ok = await staff(a.started.cookie);
    expect(ok.status).toBe(200);
    t.clock.advance(11_000);
    const reused = await staff(a.started.cookie);
    expect(code(reused)).toEqual([401, "unauthorized"]);
    expect(reused.body.error?.message).toBe(WORDS);
    const b = await make();
    await t.db.staffAccount.update({ where: { id: b.staffId }, data: { status: "suspended" as never } }).catch(() => undefined);
    await t.db.session.updateMany({ where: { staffId: b.staffId }, data: { revokedAt: new Date(), revokeReason: "ended" } });
    const ended = await staff(b.started.cookie);
    expect(code(ended)).toEqual([401, "unauthorized"]);
    expect(ended.body.error?.message).toBe(WORDS);
  });
});
