import { HttpStatus } from "@nestjs/common";
import { AppError } from "../errors/app-error";

/** The ports that call a provider over the network (FF1). The clock and the id and code generators call nothing and are not here. */
export const LIMITED_PORTS = ["payments", "email", "storage", "ai", "google", "screening", "imageSizes"] as const;
export type LimitedPort = (typeof LIMITED_PORTS)[number];

/** The time limit of one call to each port, in milliseconds. Payments is 10 s (FF1). PORT_TIMEOUTS_MS changes any of them. */
export const DEFAULT_PORT_TIMEOUTS_MS: Readonly<Record<LimitedPort, number>> = {
  payments: 10_000,
  email: 10_000,
  storage: 30_000,
  ai: 60_000,
  google: 10_000,
  screening: 20_000,
  imageSizes: 60_000,
};

/** A call to a provider did not answer in time. Callers that can say what they know (a payment as it stands) catch this. */
export class PortTimeoutError extends AppError {
  constructor(
    readonly port: LimitedPort,
    readonly method: string,
    readonly limitMs: number,
  ) {
    super(HttpStatus.GATEWAY_TIMEOUT, "provider_timeout", "The service we depend on did not answer in time. Try again in a moment.");
  }
}

export const isPortTimeout = (e: unknown): e is PortTimeoutError => e instanceof PortTimeoutError;

/**
 * Reads PORT_TIMEOUTS_MS, a list such as "payments=8000,storage=45000". Answers the limits it changes, or the problem with it.
 * Only ports in LIMITED_PORTS and whole numbers of 1 to 600000 milliseconds are accepted.
 */
export function parsePortTimeouts(raw: string | undefined): { limits: Partial<Record<LimitedPort, number>>; problem: string | null } {
  const limits: Partial<Record<LimitedPort, number>> = {};
  if (raw === undefined || raw.trim() === "") return { limits, problem: null };
  for (const part of raw.split(",")) {
    const [name, ms, ...rest] = part.split("=").map((s) => s.trim());
    if (rest.length || !name || ms === undefined) return { limits: {}, problem: `"${part.trim()}" must look like port=milliseconds` };
    if (!(LIMITED_PORTS as readonly string[]).includes(name)) return { limits: {}, problem: `"${name}" is not a port (${LIMITED_PORTS.join(", ")})` };
    if (!/^\d+$/.test(ms) || Number(ms) < 1 || Number(ms) > 600_000) return { limits: {}, problem: `${name} must be 1 to 600000 milliseconds` };
    limits[name as LimitedPort] = Number(ms);
  }
  return { limits, problem: null };
}

/** The limit of every port: the defaults, with what PORT_TIMEOUTS_MS changes. */
export function portTimeouts(raw: string | undefined): Record<LimitedPort, number> {
  return { ...DEFAULT_PORT_TIMEOUTS_MS, ...parsePortTimeouts(raw).limits };
}

const isThenable = (v: unknown): v is PromiseLike<unknown> => typeof v === "object" && v !== null && typeof (v as { then?: unknown }).then === "function";

/**
 * The one wrapper (FF1): every method of `port` that answers a promise now answers within `limitMs`, or rejects with
 * PortTimeoutError. It replaces the methods on the port object itself (so a test that spies a method still works, and the port keeps
 * its type, its `this` and its #private fields). The provider call itself is not cancelled (a port has no way to say so), so a late
 * answer is dropped; a caller that moved money or state must read the provider again, never assume. Methods that answer at once
 * (a signature check) are untouched. Wrapping twice is harmless: the second wrapper only shortens the limit.
 */
export function withTimeLimit<T extends object>(port: T, name: LimitedPort, limitMs: number): T {
  const names = new Set<string>();
  for (let o: object | null = port; o && o !== Object.prototype; o = Object.getPrototypeOf(o) as object | null) {
    for (const key of Object.getOwnPropertyNames(o)) if (key !== "constructor") names.add(key);
  }
  for (const method of names) {
    const original = (port as Record<string, unknown>)[method];
    if (typeof original !== "function") continue;
    Object.defineProperty(port, method, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: (...args: unknown[]): unknown => {
        const out: unknown = (original as (...a: unknown[]) => unknown).apply(port, args);
        if (!isThenable(out)) return out;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new PortTimeoutError(name, method, limitMs)), limitMs);
          out.then(
            (v) => {
              clearTimeout(timer);
              resolve(v);
            },
            (e: unknown) => {
              clearTimeout(timer);
              reject(e instanceof Error ? e : new Error(String(e)));
            },
          );
        });
      },
    });
  }
  return port;
}
