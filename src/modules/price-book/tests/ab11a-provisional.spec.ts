import { ownDatabase } from "../../../../test/kit/own-db";
import { boot } from "../../concierge/tests/kit";

const NOW = new Date("2027-11-01T09:00:00.000Z");
const PAYOUT = "payout.thresholdKobo";
const FILES = "limits.conciergeFilesDays";
type Kit = Awaited<ReturnType<typeof boot>>;
type Line = { key: string; name: string; lead?: string; price?: number; value?: number; confirmation?: { provisional: boolean; confirmedBy: string | null; confirmedAt: string | null } | null };

/** API-BASE-11A case 6 (R14, IE3): a setting's name is plain words; provisional settings say so in one shape; finance keeps it provisional, the owner confirms. */
describe("staff Prices: provisional settings", () => {
  const own = ownDatabase("ab11a6");
  let k: Kit;
  let finance: string;
  let owner: string;
  beforeAll(async () => {
    own.use();
    k = await boot("ab11a6", NOW);
    finance = (await k.staff(["finance"])).auth;
    owner = (await k.staff(["owner"])).auth;
  });
  afterAll(async () => {
    await k.t.close();
    own.drop();
  });
  const lines = async (): Promise<Line[]> => {
    const out: Line[] = [];
    let cursor: string | undefined;
    do {
      const r = await k.t.http().get("/v1/admin/prices").query({ limit: 50, ...(cursor ? { cursor } : {}) }).set("Authorization", owner);
      expect(r.status).toBe(200);
      out.push(...(r.body.items as Line[]));
      cursor = r.body.nextCursor ?? undefined;
    } while (cursor);
    return out;
  };
  const put = (auth: string, key: string, body: Record<string, unknown>) => k.t.http().put(`/v1/admin/prices/${key}`).set("Authorization", auth).send({ sku: key, reason: "Setting it", ...body });
  const line = async (key: string) => (await lines()).find((l) => l.key === key) as Line;
  const provisional = { provisional: true, confirmedBy: null, confirmedAt: null };

  it("names are plain words; only payout.thresholdKobo and limits.conciergeFilesDays are provisional, in one shape; no other line reads provisional", async () => {
    const all = await lines();
    expect(all.length).toBeGreaterThan(10);
    const files = all.find((l) => l.key === FILES) as Line;
    expect(files.name).toBe("Days the files of an order that is never paid are kept");
    expect(files.confirmation).toEqual(provisional);
    expect((all.find((l) => l.key === PAYOUT) as Line).confirmation).toEqual(provisional);
    // the payout threshold's own field still works
    expect((all.find((l) => l.key === PAYOUT) as Line).lead).toBe("PROVISIONAL");
    for (const l of all.filter((x) => x.key !== PAYOUT && x.key !== FILES)) {
      expect([l.key, l.confirmation ?? null]).toEqual([l.key, null]);
      expect([l.key, /provisional/i.test(`${l.name} ${l.lead ?? ""}`)]).toEqual([l.key, false]);
    }
    expect(/provisional/i.test(files.name)).toBe(false);
  });

  it("finance's change keeps both provisional; the owner's change confirms both, with who and when; the read agrees after each", async () => {
    const f1 = await put(finance, PAYOUT, { priceKobo: 700000 });
    expect(f1.status).toBe(200);
    expect(f1.body.confirmation).toEqual(provisional);
    expect(f1.body.lead).toBe("PROVISIONAL");
    const f2 = await put(finance, FILES, { value: 20 });
    expect(f2.status).toBe(200);
    expect(f2.body).toMatchObject({ value: 20, confirmation: provisional });
    let payout = await line(PAYOUT);
    let files = await line(FILES);
    expect(payout).toMatchObject({ price: 700000, confirmation: provisional, lead: "PROVISIONAL" });
    expect(files).toMatchObject({ value: 20, confirmation: provisional });
    // the owner changes the payout figure and sends the files figure again: both are confirmed
    k.t.clock.set(new Date(NOW.getTime() + 3_600_000));
    const at = k.t.clock.now().toISOString();
    const o1 = await put(owner, PAYOUT, { priceKobo: 800000 });
    expect(o1.status).toBe(200);
    expect(o1.body.confirmation).toEqual({ provisional: false, confirmedBy: "owner", confirmedAt: at });
    payout = await line(PAYOUT);
    expect(payout).toMatchObject({ price: 800000, lead: "CONFIRMED", confirmation: { provisional: false, confirmedBy: "owner", confirmedAt: at } });
    files = await line(FILES);
    expect(files.confirmation).toEqual(provisional);
    const o2 = await put(owner, FILES, { value: 20 });
    expect(o2.status).toBe(200);
    expect(o2.body.confirmation).toEqual({ provisional: false, confirmedBy: "owner", confirmedAt: at });
    files = await line(FILES);
    expect(files).toMatchObject({ value: 20, lead: "CONFIRMED", confirmation: { provisional: false, confirmedBy: "owner", confirmedAt: at } });
    // a confirmed figure sent again by the owner is no change
    expect((await put(owner, FILES, { value: 20 })).status).toBe(409);
    // the owner's change of a figure that stays confirmed; and no other line ever reads provisional
    expect((await put(owner, FILES, { value: 25 })).body).toMatchObject({ value: 25, confirmation: { provisional: false, confirmedBy: "owner" } });
    for (const l of (await lines()).filter((x) => x.key !== PAYOUT && x.key !== FILES)) expect([l.key, l.confirmation ?? null]).toEqual([l.key, null]);
  });
});
