import { AccountErasureService } from "../../accounts/account-erasure.service";
import { ids, boot, routeStorage } from "../../concierge/tests/kit";
import { testSlug } from "../../../../test/kit/unique";

const NOW = new Date("2026-12-07T09:00:00.000Z");
type Kit = Awaited<ReturnType<typeof boot>>;

describe("QR card B19", () => {
  let k: Kit;
  let route: ReturnType<typeof routeStorage>;
  beforeAll(async () => {
    k = await boot("b19q", NOW);
    route = routeStorage(k.t);
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
  });
  beforeEach(() => {
    route.fail = false;
  });

  const post = (auth: string | null, body: Record<string, unknown>) => {
    const r = k.t.http().post("/v1/qr-cards");
    return (auth ? r.set("Authorization", auth) : r).send(body);
  };
  /** A wish with a ticket, and a link unless asked not to. */
  async function owned(accountId: string, over: Record<string, unknown> = {}, link = true) {
    const w = await k.wish(accountId, over);
    const slug = testSlug("b19q");
    if (link) await k.db.wishLink.create({ data: { id: ids.next(), slug, wishId: w, active: true } });
    return { id: w, slug };
  }
  const bytesOf = async (fileId: string) => {
    const f = await k.db.storedFile.findUniqueOrThrow({ where: { id: fileId } });
    return { f, text: (await k.t.storage.readStart(f.objectKey, 1_000_000))?.toString("utf8") ?? "" };
  };

  it("4. a Signature wish: a print-ready file made on the server carries the wish's link; asked twice is the same card", async () => {
    const a = await k.account();
    const w = await owned(a.id, { ticket: "signature" });
    await post(null, { wishId: w.id }).expect(401);
    const res = await post(a.auth, { wishId: w.id, names: ["  Ada  "] }).expect(200);
    expect(res.body).toMatchObject({ status: "done", kind: "wish-card", wishIds: [w.id], names: ["Ada"] });
    const { f, text } = await bytesOf(res.body.fileId);
    expect(f).toMatchObject({ ownerAccountId: a.id, purpose: "qr_card", contentType: "image/svg+xml", status: "ready" });
    expect(text).toContain("<svg");
    expect(text).toContain(`/w/${w.slug}`);
    expect(text).toContain("Ada");
    const again = await post(a.auth, { wishIds: [w.id], names: ["Ada"] }).expect(200);
    expect(again.body.id).toBe(res.body.id);
    expect(await k.db.qrCard.count({ where: { wishId: w.id } })).toBe(1);
  });

  it("4. the bought extra gives the card on a Moment wish; no card is 402; another's wish and a bad id are 404", async () => {
    const a = await k.account();
    const other = await k.account();
    const bought = await owned(a.id, { ticket: "moment", adds: ["extra.qr-card"] });
    await post(a.auth, { wishId: bought.id }).expect(200);
    const plain = await owned(a.id, { ticket: "moment" });
    const no = await post(a.auth, { wishId: plain.id }).expect(402);
    expect(no.body.error.code).toBe("payment_required");
    const none = await owned(a.id, {});
    await post(a.auth, { wishId: none.id }).expect(402);
    await post(other.auth, { wishId: bought.id }).expect(404);
    await post(a.auth, { wishId: "nope" }).expect(404);
    await post(a.auth, { wishId: ids.next() }).expect(404);
    expect(await k.db.qrCard.count({ where: { wishId: plain.id } })).toBe(0);
    const bad = await post(a.auth, {}).expect(422);
    expect(bad.body.error.fields.wishIds).toBeDefined();
    await post(a.auth, { wishId: bought.id, names: ["a", "b"] }).expect(422);
  });

  it("4. a wish with no link yet is 409; several wishes make one table card; one wish short of the card fails the whole ask", async () => {
    const a = await k.account();
    const nolink = await owned(a.id, { ticket: "signature" }, false);
    await post(a.auth, { wishId: nolink.id }).expect(409);
    const w1 = await owned(a.id, { ticket: "premiere" });
    const w2 = await owned(a.id, { ticket: "signature" });
    const t = await post(a.auth, { wishIds: [w1.id, w2.id], names: ["One", "Two"] }).expect(200);
    expect(t.body.kind).toBe("table-card");
    const { text } = await bytesOf(t.body.fileId);
    expect(text).toContain(`/w/${w1.slug}`);
    expect(text).toContain(`/w/${w2.slug}`);
    const weak = await owned(a.id, { ticket: "moment" });
    await post(a.auth, { wishIds: [w1.id, weak.id] }).expect(402);
  });

  it("4. storage failing leaves a failed card; asking again makes it on the same row; two at once make one card", async () => {
    const a = await k.account();
    const w = await owned(a.id, { ticket: "signature" });
    route.fail = true;
    const failed = await post(a.auth, { wishId: w.id }).expect(200);
    expect(failed.body).toMatchObject({ status: "failed", fileId: null });
    route.fail = false;
    const ok = await post(a.auth, { wishId: w.id }).expect(200);
    expect(ok.body).toMatchObject({ id: failed.body.id, status: "done" });
    const w2 = await owned(a.id, { ticket: "signature" });
    const [r1, r2] = await Promise.all([post(a.auth, { wishId: w2.id }), post(a.auth, { wishId: w2.id })]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.id).toBe(r2.body.id);
    expect(await k.db.qrCard.count({ where: { wishId: w2.id } })).toBe(1);
  });

  it("B19: an asker who comes while the first ask is still making the file gets the file id, not a queued card with none", async () => {
    const a = await k.account();
    const w = await owned(a.id, { ticket: "signature" });
    const first = await post(a.auth, { wishId: w.id }).expect(200);
    const fileId = first.body.fileId as string;
    // the first ask is, for the moment, still making its file
    await k.db.qrCard.update({ where: { id: first.body.id }, data: { status: "queued", fileId: null } });
    const finishing = new Promise<void>((resolve) => {
      setTimeout(() => {
        void k.db.qrCard.update({ where: { id: first.body.id }, data: { status: "done", fileId } }).then(() => resolve());
      }, 400);
    });
    const racing = await post(a.auth, { wishId: w.id }).expect(200);
    await finishing;
    expect(racing.body).toMatchObject({ id: first.body.id, status: "done", fileId });
    expect(await k.db.qrCard.count({ where: { wishId: w.id } })).toBe(1);
  });

  it("6. erase: the names on a card go with the account", async () => {
    const a = await k.account();
    const w = await owned(a.id, { ticket: "signature" });
    const c = await post(a.auth, { wishId: w.id, names: ["Secret"] }).expect(200);
    await k.t.app.get(AccountErasureService).erase(a.id, { actor: { type: "system", id: null, requestId: "b19" }, reason: null });
    const row = await k.db.qrCard.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(row.names).toBeNull();
  });
});
