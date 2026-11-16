import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { AppError } from "../../common/errors/app-error";
import { EmailPort } from "../../common/ports/email.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { normaliseEmail } from "../../common/normalise/email";
import type { BankAccount, PostBankAccountsBody } from "../../contracts";
import { maskNumber } from "./payout-wire";
import { AccountNotFound, PayoutProviderPort } from "./payout-provider.port";

const NUMBER = /^\d{10}$/;
const BANK_CODE = /^\d{3,6}$/;

/**
 * E-22: the creator sets the bank and number the monthly payout goes to. The account name comes from the payout provider port (a
 * stand-in until the owner gives Paystack keys: NOT RUN against Paystack) and must exist; it is checked, not kept. Every answer shows
 * the last four digits only. A change makes a new row (earlier payouts keep pointing at the account they went to) and sends the
 * creator a notice by email; the same bank and number again changes nothing and sends nothing.
 */
@Injectable()
export class BankAccountsService {
  private readonly log = new Logger("bank-accounts");

  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly provider: PayoutProviderPort,
    private readonly email: EmailPort,
  ) {}

  async set(accountId: string, body: PostBankAccountsBody): Promise<BankAccount> {
    const accountNumber = String(body.accountNumber ?? "").replace(/[\s-]/g, "");
    const bankCode = String(body.bankCode ?? "").trim();
    const fields: Record<string, string> = {};
    if (!NUMBER.test(accountNumber)) fields.accountNumber = "Must be 10 digits.";
    if (!BANK_CODE.test(bankCode)) fields.bankCode = "Must be your bank's code, 3 to 6 digits.";
    if (Object.keys(fields).length) throw AppError.validation(fields);

    const creator = await this.db.creator.findUnique({ where: { accountId }, select: { id: true } });
    if (!creator) throw AppError.forbidden("Open a creator page first.");
    try {
      await this.provider.resolveAccount({ bankCode, accountNumber });
    } catch (e) {
      if (e instanceof AccountNotFound) throw AppError.validation({ accountNumber: "We could not find that account at that bank." });
      throw e;
    }

    const made = await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await tx.$queryRaw`SELECT id FROM creator WHERE id = ${creator.id}::uuid FOR UPDATE`;
      const now = await tx.bankAccount.findFirst({ where: { creatorId: creator.id, accountNumber: { not: null } }, orderBy: { id: "desc" } });
      if (now && now.accountNumber === accountNumber && now.bankCode === bankCode) return null;
      const id = this.ids.id();
      await tx.bankAccount.create({ data: { id, creatorId: creator.id, accountNumber, bankCode } });
      return { id, replaced: now !== null };
    });
    if (made) await this.notify(accountId, made.id, bankCode, accountNumber, made.replaced);
    return { accountNumber: maskNumber(accountNumber), bankCode };
  }

  /**
   * The notice of a change: plain words, the last four digits only, to the account's email. Sent after the change is saved: a mail
   * that fails never undoes a bank change, and is logged. The key makes a second send of one change a no-op at the provider.
   */
  private async notify(accountId: string, bankRowId: string, bankCode: string, accountNumber: string, replaced: boolean): Promise<void> {
    try {
      const a = await this.db.account.findUnique({ where: { id: accountId }, select: { contact: true, erasedAt: true } });
      const to = a && !a.erasedAt ? normaliseEmail(a.contact ?? "") : null;
      if (!to) return;
      const last4 = accountNumber.slice(-4);
      await this.email.send({
        to,
        subject: replaced ? "Your payout bank account was changed" : "Your payout bank account was added",
        text: `Payouts will now go to the account ending ${last4} at bank ${bankCode}. If this was not you, sign in and change it back, then write to us.`,
        idempotencyKey: `bank-change:${bankRowId}`,
      });
    } catch (e) {
      this.log.error(`bank change notice not sent: ${String(e)}`);
    }
  }
}
