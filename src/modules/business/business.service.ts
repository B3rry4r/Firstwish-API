import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Business, PatchBusinessBody } from "../../contracts";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { linkProblem, normaliseLink } from "../../common/normalise/link";

type Brand = NonNullable<Business["brand"]>;

const TEXT_MAX = { business: 48, line: 80 } as const;
const COLOUR = /^#[0-9a-f]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * E-26: the business's brand (its name on wishes, line, two colours, logo, booking link). Only the owner's own business is
 * changed: the owner check is the query condition (accountId). The write runs under the kernel's account lock (AA1). Free text is
 * stored as typed (the web app always shows it as text, never HTML, AA5); the booking link is stored as the parsed URL's own
 * text (AA4); the logo is the id of a stored file the account uploaded with purpose "brand" (AA5), never a data URL.
 */
@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async patchBrand(accountId: string, body: PatchBusinessBody): Promise<Brand> {
    const { patch, logo } = this.readBrand(body.brand ?? {});
    return this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM business WHERE "accountId" = ${accountId}::uuid ORDER BY id ASC LIMIT 1 FOR UPDATE`;
      if (!rows[0]) throw AppError.notFound("Set up your business first.");
      if (logo) {
        const file = await tx.storedFile.findFirst({
          where: { id: logo, purpose: "brand_logo", status: "ready", OR: [{ ownerAccountId: accountId }, { businessId: rows[0].id }] },
          select: { id: true },
        });
        if (!file) throw AppError.validation({ "brand.logo": "Must be a logo you uploaded with purpose brand." });
      }
      const current = await tx.business.findUniqueOrThrow({ where: { id: rows[0].id }, select: { brand: true } });
      const brand: Brand = { ...((current.brand as Brand | null) ?? {}), ...patch };
      for (const [k, v] of Object.entries(brand)) if (v === "") delete brand[k];
      await tx.business.update({
        where: { id: rows[0].id },
        data: { brand: brand as Prisma.InputJsonObject, version: { increment: 1 } },
      });
      return brand;
    });
  }

  private readBrand(raw: Record<string, unknown>): { patch: Brand; logo: string | null } {
    const fields: ErrorFields = {};
    const out: Brand = {};
    let logo: string | null = null;
    for (const [k, v] of Object.entries(raw)) {
      const at = `brand.${k}`;
      switch (k) {
        case "business":
        case "line": {
          const max = TEXT_MAX[k];
          if (typeof v !== "string" || v.trim().length > max) fields[at] = `Must be text of ${max} characters or fewer.`;
          else out[k] = v.trim();
          break;
        }
        case "booking": {
          if (typeof v !== "string") fields[at] = "Must be a link or empty.";
          else if (v.trim() === "") out[k] = "";
          else {
            const link = normaliseLink(v);
            if (link === null) fields[at] = linkProblem(v) ?? "Must be a link starting https://.";
            else out[k] = link;
          }
          break;
        }
        case "colours": {
          const ok = Array.isArray(v) && v.length === 2 && v.every((c) => typeof c === "string" && COLOUR.test(c.trim().toLowerCase()));
          if (!ok) fields[at] = "Must be two colours like #c8693a.";
          else out[k] = (v as string[]).map((c) => c.trim().toLowerCase());
          break;
        }
        case "logo": {
          if (typeof v !== "string") fields[at] = "Must be a stored file id or empty.";
          else if (v === "") out[k] = "";
          else if (!UUID.test(v.trim())) fields[at] = "Must be the id of an uploaded logo.";
          else {
            logo = v.trim().toLowerCase();
            out[k] = logo;
          }
          break;
        }
        default:
          fields[at] = "Not a known field.";
      }
    }
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { patch: out, logo };
  }
}
