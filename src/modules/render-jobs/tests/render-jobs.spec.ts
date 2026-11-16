import { VideoRenderer, StandinVideoRenderer } from "../video-renderer";
import { RenderJobsService, RENDER_LEASE_MS } from "../render-jobs.service";
import { boot, ids, routeStorage } from "../../concierge/tests/kit";

const NOW = new Date("2026-12-07T09:00:00.000Z");
type Kit = Awaited<ReturnType<typeof boot>>;

describe("video job B19", () => {
  let k: Kit;
  let route: ReturnType<typeof routeStorage>;
  let renderer: StandinVideoRenderer;
  let svc: RenderJobsService;
  beforeAll(async () => {
    renderer = new StandinVideoRenderer();
    k = await boot("b19v", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(renderer) });
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
  });
  beforeEach(() => {
    route.fail = false;
    renderer.on = true;
    renderer.failWith = null;
    k.t.clock.set(NOW);
  });

  const ask = (auth: string | null, id: string, body: Record<string, unknown> = {}) => {
    const r = k.t.http().post(`/v1/wishes/${id}/video`);
    return (auth ? r.set("Authorization", auth) : r).send(body);
  };
  const jobRow = (id: string) => k.db.renderJob.findUniqueOrThrow({ where: { id } });

  it("5. asking makes a job (queued); asked twice gives the same job; it renders to ready with a file", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    await ask(null, w).expect(401);
    const first = await ask(a.auth, w).expect(200);
    expect(first.body.payment).toBeNull();
    expect(first.body.item).toMatchObject({ status: "queued", kind: "status-video", wishId: w, width: 1080, height: 1920, outputFileId: null });
    const second = await ask(a.auth, w, { wishId: w }).expect(200);
    expect(second.body.item.id).toBe(first.body.item.id);
    expect(await k.db.renderJob.count({ where: { wishId: w } })).toBe(1);
    expect(await svc.run(first.body.item.id)).toBe("done");
    expect(await svc.run(first.body.item.id)).toBe("skipped");
    const read = await k.t.http().get(`/v1/wishes/${w}/video`).set("Authorization", a.auth).expect(200);
    expect(read.body).toMatchObject({ id: first.body.item.id, status: "done" });
    const f = await k.db.storedFile.findUniqueOrThrow({ where: { id: read.body.outputFileId } });
    expect(f).toMatchObject({ ownerAccountId: a.id, purpose: "render", kind: "video", contentType: "video/mp4" });
    expect((await k.t.storage.readStart(f.objectKey, 1000))?.toString()).toContain(`standin-video:${w}`);
    expect(renderer.rendered.filter((r) => r.wishId === w)).toHaveLength(1);
    // asked again once ready: the same ready job, nothing rendered again
    expect((await ask(a.auth, w).expect(200)).body.item).toMatchObject({ id: read.body.id, status: "done" });
    expect(renderer.rendered.filter((r) => r.wishId === w)).toHaveLength(1);
  });

  it("5. the entitlement is checked (402), the owner is checked (404), a draft is refused (409)", async () => {
    const a = await k.account();
    const other = await k.account();
    const moment = await k.wish(a.id, { ticket: "moment" });
    expect((await ask(a.auth, moment).expect(402)).body.error.code).toBe("payment_required");
    const bought = await k.wish(a.id, { ticket: "moment", adds: ["extra.portrait-video"] });
    await ask(a.auth, bought).expect(200);
    const sig = await k.wish(a.id, { ticket: "signature" });
    await ask(other.auth, sig).expect(404);
    await ask(a.auth, "nope").expect(404);
    await ask(a.auth, ids.next()).expect(404);
    await k.t.http().get(`/v1/wishes/${sig}/video`).set("Authorization", a.auth).expect(404);
    await k.t.http().get(`/v1/wishes/${sig}/video`).set("Authorization", other.auth).expect(404);
    const draft = await k.wish(a.id, { ticket: "signature", status: "draft" });
    await ask(a.auth, draft).expect(409);
    await ask(a.auth, sig, { wishId: ids.next() }).expect(422);
    expect(await k.db.renderJob.count({ where: { wishId: { in: [moment, draft] } } })).toBe(0);
  });

  it("5. with no renderer configured the ask is 503 video_unavailable and no job or file is made", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    renderer.on = false;
    const res = await ask(a.auth, w).expect(503);
    expect(res.body.error.code).toBe("video_unavailable");
    expect(await k.db.renderJob.count({ where: { wishId: w } })).toBe(0);
    expect(renderer.rendered.filter((r) => r.wishId === w)).toHaveLength(0);
  });

  it("5. a resting wish is asked for as a file (keepsake-export) without the extra; failed has a way out on the same row", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "resting", ticket: "moment", restingSince: NOW });
    const first = await ask(a.auth, w).expect(200);
    expect(first.body.item.kind).toBe("keepsake-export");
    renderer.failWith = "boom";
    expect(await svc.run(first.body.item.id)).toBe("failed");
    expect((await jobRow(first.body.item.id)).status).toBe("failed");
    expect((await jobRow(first.body.item.id)).outputFileId).toBeNull();
    renderer.failWith = null;
    const again = await ask(a.auth, w).expect(200);
    expect(again.body.item).toMatchObject({ id: first.body.item.id, status: "queued" });
    expect(await svc.run(first.body.item.id)).toBe("done");
    // storage refusing the file also ends in failed, never done
    const w2 = await k.wish(a.id, { status: "resting", ticket: "moment", restingSince: NOW });
    const j2 = (await ask(a.auth, w2).expect(200)).body.item.id;
    route.fail = true;
    expect(await svc.run(j2)).toBe("failed");
    route.fail = false;
  });

  it("5. a job lost while rendering is taken again after the lease; one still inside it is left alone; two runs at once render once", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    const id = (await ask(a.auth, w).expect(200)).body.item.id;
    await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "updatedAt" = ${NOW} WHERE id = ${id}::uuid`;
    expect(await svc.run(id)).toBe("skipped");
    k.t.clock.set(new Date(NOW.getTime() + RENDER_LEASE_MS + 1000));
    const before = renderer.rendered.length;
    const [r1, r2] = await Promise.all([svc.run(id), svc.run(id)]);
    expect([r1, r2].sort()).toEqual(["done", "skipped"]);
    expect(renderer.rendered.length - before).toBe(1);
    expect(await svc.run("not-an-id")).toBe("skipped");
  });

  it("5. two asks at once make one job", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    const [r1, r2] = await Promise.all([ask(a.auth, w), ask(a.auth, w)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(r1.body.item.id).toBe(r2.body.item.id);
    expect(await k.db.renderJob.count({ where: { wishId: w } })).toBe(1);
  });
});
