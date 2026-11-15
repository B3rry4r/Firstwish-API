import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Business, PatchBusinessBody } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";

type Brand = NonNullable<Business["brand"]>;

const TEXT_MAX = { business: 48, line: 80 } as const;
const BOOKING_MAX = 300;
const COLOUR = /^#[0-9a-f]{6}$/;
/** The logo as the web app sends it: a data URL of an image it shrank to 280px, or '' to clear it. Default (lead) size cap. */
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const LOGO_MAX = 300_000;

/**
 * E-26: the business's brand (its name on wishes, line, two colours, logo, booking link). Only the owner's own business is
 * changed: the owner check is the query condition (accountId).
 */
@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async patchBrand(accountId: string, body: PatchBusinessBody): Promise<Brand> {
    const patch = this.readBrand(body.brand ?? {});
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM business WHERE "accountId" = ${accountId}::uuid ORDER BY id ASC LIMIT 1 FOR UPDATE`;
      if (!rows[0]) throw AppError.notFound("Set up your business first.");
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

  private readBrand(raw: Record<string, unknown>): Brand {
    const fields: ErrorFields = {};
    const out: Brand = {};
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
          else if (v.trim().length > BOOKING_MAX || !this.isHttpsLink(v.trim())) fields[at] = "Must be a link starting https://.";
          else out[k] = v.trim();
          break;
        }
        case "colours": {
          const ok = Array.isArray(v) && v.length === 2 && v.every((c) => typeof c === "string" && COLOUR.test(c.trim().toLowerCase()));
          if (!ok) fields[at] = "Must be two colours like #c8693a.";
          else out[k] = (v as string[]).map((c) => c.trim().toLowerCase());
          break;
        }
        case "logo": {
          if (typeof v !== "string") fields[at] = "Must be an image or empty.";
          else if (v === "") out[k] = "";
          else if (v.length > LOGO_MAX || !LOGO.test(v)) fields[at] = "Must be a PNG, JPEG or WebP image under 300 KB.";
          else out[k] = v;
          break;
        }
        default:
          fields[at] = "Not a known field.";
      }
    }
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return out;
  }

  private isHttpsLink(v: string): boolean {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname.includes(".");
    } catch {
      return false;
    }
  }
}
