import { ownDatabase } from "../../../../test/kit/own-db";
import { boot } from "./kit";

const NOW = new Date("2027-03-08T09:00:00.000Z");
const own = ownDatabase("ab18ic");

/**
 * API-BASE-18 (B1): the order start locks the account row, then reads the business. That read used the pool, so on a small pool twenty starts for one
 * account held every connection while the one holding the lock asked for another: a pool timeout, answered 503. The read now goes through the same
 * transaction. The pool here is three connections (twenty requests at once, three places).
 */
describe("order start: twenty at once for one account on a pool of three", () => {
  jest.setTimeout(600000);
  let k: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    own.use();
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${process.env.DATABASE_URL!.includes("?") ? "&" : "?"}connection_limit=3`;
    k = await boot("ab18ic", NOW);
  });
  afterAll(async () => {
    await k.t.close();
    own.drop();
  });

  it("20 rounds of 20: every start answers 201 or its refusal, none 503, and no order or charge beyond the 201s", async () => {
    const buyer = await k.account();
    let created = 0;
    for (let round = 0; round < 20; round++) {
      const res = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          k.t.http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `pool ${round}-${i}`, count: 1, kind: "single", rush: false }),
        ),
      );
      const bad = res.filter((r) => r.status !== 201).map((r) => `${r.status}:${r.body?.error?.code}`);
      expect(bad).toEqual([]);
      created += res.filter((r) => r.status === 201).length;
      expect(await k.db.conciergeOrder.count({ where: { accountId: buyer.id } })).toBe(created);
    }
    expect(created).toBe(400);
    expect(await k.db.payment.count({ where: { accountId: buyer.id } })).toBe(0);
  });
});
