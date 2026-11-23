import { EnvError, loadEnv } from "../../../common/env/env";
import { standinEnv } from "../../../../test/kit/env";
import { SettlementService } from "../../payments/settlement.service";
import { RenderJobsService } from "../render-jobs.service";
import { NoVideoRenderer, StandinVideoRenderer, VideoRenderer, videoRendererFor } from "../video-renderer";
import { boot, routeStorage } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2027-06-07T09:00:00.000Z");
const SKU = "extra.portrait-video";
type Kit = Awaited<ReturnType<typeof boot>>;
let n = 0;

const helpers = (k: Kit) => {
  const http = () => k.t.http();
  const get = (auth: string, id: string) => http().get(`/v1/wishes/${id}`).set("Authorization", auth);
  const start = (auth: string, subjectId: string) => http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `ab19-${RUN}-${++n}-k`).send({ purpose: "extra", id: "portrait-video", subjectId });
  const ask = (auth: string | null, id: string) => (auth ? http().post(`/v1/wishes/${id}/video`).set("Authorization", auth) : http().post(`/v1/wishes/${id}/video`)).send({});
  const read = (auth: string | null, id: string) => (auth ? http().get(`/v1/wishes/${id}/video`).set("Authorization", auth) : http().get(`/v1/wishes/${id}/video`));
  const sealed = (accountId: string, over: Record<string, unknown> = {}) => k.wish(accountId, { status: "sealed", ticket: "keepsake", opensAt: new Date(NOW.getTime() + 86_400_000), ...over });
  async function pay(reference: string) {
    const p = await k.db.payment.findFirstOrThrow({ where: { providerReference: reference } });
    const o = await k.t.app.get(SettlementService).settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: NOW });
    expect(o.outcome).toBe("fulfilled");
  }
  return { http, get, start, ask, read, sealed, pay };
};

describe("API-BASE-19 IK3: the portrait video is not sold while no renderer is configured", () => {
  let k: Kit;
  let h: ReturnType<typeof helpers>;
  beforeAll(async () => {
    k = await boot("ab19n", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(new NoVideoRenderer()) });
    h = helpers(k);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  it("2a: the start is 409 extra_not_sold with words and makes no payment; the wish read says it cannot be bought; a paid wish keeps the 503 with words", async () => {
    const a = await k.account();
    const w = await h.sealed(a.id);
    const was = k.t.payments.started.length;
    const r = await h.start(a.auth, w);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("extra_not_sold");
    expect(r.body.error.message).toBe("The portrait video is not on sale right now. Nothing was charged.");
    expect(await k.db.payment.count({ where: { subjectId: w } })).toBe(0);
    expect(k.t.payments.started.length).toBe(was);
    expect((await h.get(a.auth, w)).body.extrasOpen).toMatchObject({ [SKU]: false });
    // another extra of the same ticket is still sold
    expect((await h.get(a.auth, w)).body.extrasOpen["extra.five-photos"]).toBe(true);
    // a wish that already holds the extra (paid before) and meets no renderer: the ask is 503, the words say it is theirs and nothing more is charged; no job is made
    const paid = await h.sealed(a.id, { adds: [SKU] });
    const ask = await h.ask(a.auth, paid);
    expect(ask.status).toBe(503);
    expect(ask.body.error.code).toBe("video_unavailable");
    expect(ask.body.error.message).toBe("Your video cannot be made right now. It stays yours and you will not pay again. Ask again later.");
    expect(await k.db.renderJob.count({ where: { wishId: paid } })).toBe(0);
  });

  it("2b: live providers bind no renderer; STANDIN_VIDEO is refused with live providers or in production", () => {
    expect(videoRendererFor({ PROVIDERS: "live" })).toBeInstanceOf(NoVideoRenderer);
    expect(videoRendererFor({ PROVIDERS: "standin" })).toBeInstanceOf(StandinVideoRenderer);
    const names = (raw: Record<string, string | undefined>) => {
      try {
        loadEnv(raw);
        return [] as string[];
      } catch (e) {
        if (!(e instanceof EnvError)) throw e;
        return e.problems.map((p) => p.name);
      }
    };
    const on = { ...standinEnv(), STANDIN_VIDEO: "fail" };
    expect(names(on)).toEqual([]);
    expect(names({ ...on, PROVIDERS: "live" })).toContain("STANDIN_VIDEO");
    expect(names({ ...on, NODE_ENV: "production" })).toContain("STANDIN_VIDEO");
    expect(names({ ...standinEnv(), STANDIN_VIDEO: "maybe" })).toContain("STANDIN_VIDEO");
  });
});

describe("API-BASE-19 IK3, IK4: with PROVIDERS=standin the video is bought once, made, and fetched", () => {
  let k: Kit;
  let h: ReturnType<typeof helpers>;
  let route: ReturnType<typeof routeStorage>;
  let svc: RenderJobsService;
  beforeAll(async () => {
    process.env.STANDIN_VIDEO = "fail";
    try {
      k = await boot("ab19s", NOW);
    } finally {
      delete process.env.STANDIN_VIDEO;
    }
    h = helpers(k);
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
  });
  beforeEach(() => k.t.clock.set(NOW));

  it("2b, 2c, 2d: bought once; the job fails on STANDIN_VIDEO=fail, is asked again and reaches ready; the ready read gives a signed address of the stored file; a second purchase is refused", async () => {
    const renderer = k.t.app.get<StandinVideoRenderer>(VideoRenderer);
    expect(renderer).toBeInstanceOf(StandinVideoRenderer);
    expect(renderer.failWith).toBeTruthy();
    const a = await k.account();
    const other = await k.account();
    const w = await h.sealed(a.id);
    expect((await h.get(a.auth, w)).body.extrasOpen[SKU]).toBe(true);
    const bought = await h.start(a.auth, w);
    expect(bought.status).toBe(201);
    await h.pay(bought.body.payment.reference);
    expect((await k.db.wish.findUniqueOrThrow({ where: { id: w } })).adds).toContain(SKU);
    // 2d: held, so no offer and no second charge
    expect((await h.get(a.auth, w)).body.extrasOpen[SKU]).toBe(false);
    const again = await h.start(a.auth, w);
    expect(again.status).toBe(422);
    expect(again.body.error.fields.subjectId).toBe("This wish already has that extra.");
    expect(await k.db.payment.count({ where: { subjectId: w, purpose: "extra" } })).toBe(1);
    // 2b: the first job fails (switch on), the person is told "failed" and asks again on the same row
    const first = (await h.ask(a.auth, w)).body.item;
    expect(first.status).toBe("queued");
    expect(await svc.run(first.id)).toBe("failed");
    expect((await h.get(a.auth, w)).body.video).toBe("failed");
    expect((await h.read(a.auth, w)).body).toMatchObject({ id: first.id, status: "failed" });
    expect((await h.read(a.auth, w)).body.downloadUrl).toBeUndefined();
    renderer.failWith = null; // the stack's switch turned off: the same ask now reaches ready
    const second = (await h.ask(a.auth, w)).body.item;
    expect(second).toMatchObject({ id: first.id, status: "queued" });
    expect(await svc.run(second.id)).toBe("done");
    expect((await h.get(a.auth, w)).body.video).toBe("ready");
    // 2c: the ready read carries a short-lived address of the stored file; the bytes there are the stored file
    const ready = await h.read(a.auth, w);
    expect(ready.status).toBe(200);
    const url = new URL(ready.body.downloadUrl as string);
    expect(Date.parse(ready.body.downloadExpiresAt) - NOW.getTime()).toBe(600_000);
    const file = await k.db.storedFile.findUniqueOrThrow({ where: { id: ready.body.outputFileId } });
    const hit = k.t.storage.serve(decodeURI(url.pathname.replace(/^\/[^/]+\//, "")), Number(url.searchParams.get("expires")), url.searchParams.get("signature") ?? "");
    expect(hit?.bytes.toString()).toBe(`standin-video:${w}:status-video`);
    expect(hit?.bytes.length).toBe(Number(file.bytes));
    expect((await k.t.storage.readStart(file.objectKey, 1000))?.toString()).toBe(hit?.bytes.toString());
    // after the address lapses it is no longer served
    expect(k.t.storage.serve(decodeURI(url.pathname.replace(/^\/[^/]+\//, "")), Number(url.searchParams.get("expires")), "bad")).toBeNull();
    // the same address comes from the ask too; another person gets 404 and no address; signed out 401
    expect((await h.ask(a.auth, w)).body.item.downloadUrl).toMatch(/signature=/);
    expect((await h.read(other.auth, w)).status).toBe(404);
    expect((await h.ask(other.auth, w)).status).toBe(404);
    expect((await h.read(null, w)).status).toBe(401);
    expect((await h.ask(null, w)).status).toBe(401);
  });
});
