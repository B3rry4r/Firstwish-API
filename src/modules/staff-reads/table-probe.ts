import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";

/** Says whether a table exists, so a part of the Overview whose bundle is absent is left out and never shown as zero. */
@Injectable()
export class TableProbe {
  constructor(private readonly db: PrismaService) {}

  async has(table: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ t: string | null }[]>`SELECT to_regclass(${`public.${table}`})::text AS t`;
    return rows[0]?.t != null;
  }
}
