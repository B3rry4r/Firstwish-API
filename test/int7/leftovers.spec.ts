import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import { databaseUnavailable } from "../../src/common/errors/error-envelope.filter";
import { Money } from "../../src/common/money/money";
import { PaystackRefundProvider } from "../../src/common/ports/adapters/paystack-refund-provider";

/** INT-7 leftovers that need no database. The Paystack side is a local server: NOT RUN against Paystack itself. */
describe("B08: findRefund matches the amount", () => {
  let server: Server;
  let base: string;
  const posts: string[] = [];
  let list: unknown[] = [];

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      if (req.method === "POST") posts.push(req.url ?? "");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.method === "POST" ? { status: true, message: "ok", data: { id: 777 } } : { status: true, message: "ok", data: list }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    posts.length = 0;
  });

  it("does not take a refund of another amount, nor a failed one, as this one", async () => {
    list = [
      { id: 1, status: "processed", amount: 5000 },
      { id: 2, status: "failed", amount: 150000 },
      { id: 3, status: "processed" },
    ];
    const p = new PaystackRefundProvider("sk_test_x", base);
    expect(await p.findRefund("ref-1", Money.kobo(150000))).toBeNull();
  });

  it("takes the live refund with this amount, and refund() then asks nothing new", async () => {
    list = [
      { id: 1, status: "processed", amount: 5000 },
      { id: 9, status: "pending", amount: 150000 },
    ];
    const p = new PaystackRefundProvider("sk_test_x", base);
    expect(await p.findRefund("ref-1", Money.kobo(150000))).toEqual({ providerReference: "9" });
    expect(await p.refund({ refundId: "r1", paymentReference: "ref-1", amount: Money.kobo(150000) })).toEqual({ providerReference: "9" });
    expect(posts).toHaveLength(0);
  });

  it("with only a refund of another amount held, refund() asks for its own", async () => {
    list = [{ id: 1, status: "processed", amount: 5000 }];
    const p = new PaystackRefundProvider("sk_test_x", base);
    expect(await p.refund({ refundId: "r2", paymentReference: "ref-1", amount: Money.kobo(150000) })).toEqual({ providerReference: "777" });
    expect(posts).toEqual(["/refund"]);
  });
});

describe("INT-7: a wait that ran out is the database not answering (503), any other failure is not", () => {
  it("P2028 (a transaction that could not start in time) is unavailable; an ordinary error is not", () => {
    const wait = new Prisma.PrismaClientKnownRequestError("Unable to start a transaction in the given time.", { code: "P2028", clientVersion: "x" });
    const unique = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "x" });
    expect(databaseUnavailable(wait)).toBe(true);
    expect(databaseUnavailable(unique)).toBe(false);
    expect(databaseUnavailable(new Error("boom"))).toBe(false);
  });
});
