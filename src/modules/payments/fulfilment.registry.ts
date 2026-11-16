import { Injectable } from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import type { Grant } from "../price-book/entitlements.service";
import type { Quote } from "../price-book/price-book.service";

/** What was bought on one price-book line of a payment. */
export interface PaidLineInfo {
  sku: string;
  name: string;
  qty: number;
  unitKobo: number;
  totalKobo: number;
}

/** What the buyer asked for, as the start request named it (the body without any money). */
export interface PaymentRequestInfo {
  purpose: string;
  subjectId?: string;
  id?: string;
  key?: string;
  plan?: string;
  packs?: number;
  ticket?: string;
  title?: string;
  way?: string;
  extraDays?: unknown;
  options?: Record<string, unknown>;
}

/**
 * Given to a fulfilment handler. `tx` is the payment's own transaction with the payment row locked: whatever the handler writes
 * lands with the state change and the ledger rows, or none of it does. A handler that throws undoes the whole payment.
 * `grant()` is what the price book says the line grants (EntitlementsService.for).
 */
export interface FulfilmentContext {
  tx: Prisma.TransactionClient;
  payment: Payment;
  line: PaidLineInfo;
  request: PaymentRequestInfo;
  grant: () => Promise<Grant>;
}

export type FulfilmentHandler = (ctx: FulfilmentContext) => Promise<void>;

/**
 * A check made when a payment STARTS (GG3), in the start's own transaction with the account locked: it throws the 422 that tells the
 * buyer a line can never be granted, before any money is asked for. The fulfilment bundle registers its own (assertStartable).
 */
export type StartCheck = (
  accountId: string | null,
  request: PaymentRequestInfo,
  skus: string[],
  tx: Prisma.TransactionClient,
  quote: Quote,
  /** HU1: the email of a link holder who pays with no account (accountId is null then) */
  holderEmail?: string,
) => Promise<void | { existingPaymentId: string }>;

/**
 * The fulfilment frame: handlers register by price-book line (sku). The payment core calls the registered handler once
 * per line of a payment that has just become paid, never twice, and never for a line nobody registered (that fails the whole
 * settle, so the next delivery retries once a handler exists). The handlers themselves belong to the fulfilment bundle.
 */
@Injectable()
export class FulfilmentRegistry {
  private readonly handlers = new Map<string, FulfilmentHandler>();
  private readonly startChecks: StartCheck[] = [];

  /** Registers the handler of one line. A second registration for the same line is a programming error. */
  register(sku: string, handler: FulfilmentHandler): void {
    if (this.handlers.has(sku)) throw new Error(`fulfilment: ${sku} already has a handler`);
    this.handlers.set(sku, handler);
  }

  /** Registers a check run at the start of every payment (GG3). */
  onStart(check: StartCheck): void {
    this.startChecks.push(check);
  }

  /** Test helper: a payments-core spec that replaces the handlers also drops the fulfilment bundle's start check. */
  clearStartChecks(): void {
    this.startChecks.length = 0;
  }

  /**
   * Runs the start checks in the order they were registered; the first to throw refuses the start. A check may set the price the
   * payment charges (it changes `quote`: the order's own row) or answer that an open payment for the same thing already exists.
   */
  async checkStart(accountId: string | null, request: PaymentRequestInfo, skus: string[], tx: Prisma.TransactionClient, quote: Quote, holderEmail?: string): Promise<string | null> {
    for (const check of this.startChecks) {
      const again = await check(accountId, request, skus, tx, quote, holderEmail);
      if (again) return again.existingPaymentId;
    }
    return null;
  }

  /** Test helper and hot-swap: replaces whatever is registered. */
  replace(sku: string, handler: FulfilmentHandler): void {
    this.handlers.set(sku, handler);
  }

  clear(sku: string): void {
    this.handlers.delete(sku);
  }

  get(sku: string): FulfilmentHandler | undefined {
    return this.handlers.get(sku);
  }

  skus(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
