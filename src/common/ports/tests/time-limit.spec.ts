import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ENV } from "../../env/env.module";
import { loadEnv } from "../../env/env";
import { standinEnv } from "../../../../test/kit/env";
import { ProvidersModule } from "../providers.module";
import { PaymentsPort, StartPayment, StartedPayment, VerifiedPayment } from "../payments.port";
import { StoragePort } from "../storage.port";
import { DEFAULT_PORT_TIMEOUTS_MS, isPortTimeout, LIMITED_PORTS, parsePortTimeouts, PortTimeoutError, portTimeouts, withTimeLimit } from "../time-limit";
import { Money } from "../../money/money";
import { StandinPayments, StandinStorage } from "../adapters/standins";

/* FF1: every call to a provider port has a time limit; one wrapper, the limit of each port from config. */

/** A provider that takes the call and never answers. */
class NeverAnswers extends PaymentsPort {
  calls = 0;
  start(_input: StartPayment): Promise<StartedPayment> {
    this.calls++;
    return new Promise(() => undefined);
  }
  verify(_reference: string): Promise<VerifiedPayment> {
    this.calls++;
    return new Promise(() => undefined);
  }
  verifySignature(): boolean {
    return true;
  }
  ping(): Promise<{ state: "stand-in" }> {
    return Promise.resolve({ state: "stand-in" });
  }
}

describe("withTimeLimit", () => {
  it("rejects a call that never answers with PortTimeoutError, within the limit", async () => {
    const never = new NeverAnswers();
    const port = withTimeLimit(never, "payments", 40);
    const t0 = Date.now();
    const err = await port.verify("ref-1").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isPortTimeout(err)).toBe(true);
    expect(err).toBeInstanceOf(PortTimeoutError);
    expect(err).toMatchObject({ port: "payments", method: "verify", limitMs: 40, code: "provider_timeout" });
    expect((err as PortTimeoutError).getStatus()).toBe(504);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(never.calls).toBe(1);
  });

  it("limits every method that answers a promise, and not the ones that answer at once", async () => {
    const port = withTimeLimit(new NeverAnswers(), "payments", 30);
    await expect(port.start({ reference: "r", amount: Money.kobo(100), email: "a@b.test" })).rejects.toBeInstanceOf(PortTimeoutError);
    expect(port.verifySignature()).toBe(true);
  });

  it("passes an answer and an error through unchanged, and leaves no timer behind", async () => {
    const calls: string[] = [];
    const port = withTimeLimit(
      {
        ok: (x: number) => Promise.resolve(x + 1),
        bad: () => Promise.reject(new Error("provider said no")),
        label: "kept",
        note(): string {
          calls.push("note");
          return "sync";
        },
      },
      "email",
      5_000,
    );
    await expect(port.ok(1)).resolves.toBe(2);
    await expect(port.bad()).rejects.toThrow("provider said no");
    expect(port.label).toBe("kept");
    expect(port.note()).toBe("sync");
    expect(calls).toEqual(["note"]);
    const timers = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
    await port.ok(2);
    expect(process.getActiveResourcesInfo().filter((r) => r === "Timeout").length).toBe(timers);
  });

  it("keeps `this` on the real object (a #private field works)", async () => {
    class Holder {
      #secret = 7;
      read(): Promise<number> {
        return Promise.resolve(this.#secret);
      }
    }
    await expect(withTimeLimit(new Holder(), "storage", 1000).read()).resolves.toBe(7);
  });
});

describe("the limit of each port is config", () => {
  it("payments is 10 seconds, every limited port has a limit", () => {
    expect(DEFAULT_PORT_TIMEOUTS_MS.payments).toBe(10_000);
    expect(Object.keys(portTimeouts(undefined)).sort()).toEqual([...LIMITED_PORTS].sort());
  });
  it("PORT_TIMEOUTS_MS changes the ports it names and no other", () => {
    expect(portTimeouts("payments=8000,storage=45000")).toEqual({ ...DEFAULT_PORT_TIMEOUTS_MS, payments: 8000, storage: 45000 });
    expect(parsePortTimeouts("fax=5").problem).toMatch(/not a port/);
    expect(parsePortTimeouts("payments=0").problem).toMatch(/1 to 600000/);
  });
});

describe("the providers module wraps every port with its limit", () => {
  it("a stand-in that never answers is cut off at the port's own limit, for payments and for storage", async () => {
    const env = loadEnv({ ...standinEnv(), PORT_TIMEOUTS_MS: "payments=50,storage=60" });
    // the stand-ins answer at once, so make them silent before the module builds them (the wrapper wraps what it finds)
    const silent = () => new Promise<never>(() => undefined);
    const spies = [jest.spyOn(StandinPayments.prototype, "verify").mockImplementation(silent), jest.spyOn(StandinStorage.prototype, "head").mockImplementation(silent)];
    @Global()
    @Module({ providers: [{ provide: ENV, useValue: env }], exports: [ENV] })
    class TestEnv {}
    const m2 = await Test.createTestingModule({ imports: [TestEnv, ProvidersModule] }).compile();
    const payments = m2.get(PaymentsPort);
    const storage = m2.get(StoragePort);
    await expect(payments.verify("ref-9")).rejects.toMatchObject({ port: "payments", limitMs: 50 });
    await expect(storage.head("k")).rejects.toMatchObject({ port: "storage", limitMs: 60 });
    for (const s of spies) s.mockRestore();
    await m2.close();
  });
});
