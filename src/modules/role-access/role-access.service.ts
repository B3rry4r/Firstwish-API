import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { StaffRole } from "../../common/auth/principal";
import type { RoleAccess } from "../../contracts";

/** The Team access table (seeded): which admin sections each staff role opens. Read on every check, never cached. */
@Injectable()
export class RoleAccessService {
  constructor(private readonly db: PrismaService) {}

  async all(): Promise<RoleAccess[]> {
    const rows = await this.db.roleAccess.findMany();
    return rows
      .filter((r) => typeof r.role === "string")
      .map((r) => ({ role: r.role, sections: Array.isArray(r.sections) ? r.sections.filter((s) => typeof s === "string") : [] }));
  }

  /** True when one of these roles opens the section. The owner opens every section. */
  async opens(roles: readonly StaffRole[], section: string): Promise<boolean> {
    if (roles.includes("owner")) return true;
    if (roles.length === 0) return false;
    const table = await this.all();
    return table.some((r) => roles.includes(r.role as StaffRole) && r.sections.includes(section));
  }

  /**
   * HP1: the sections these roles open, from the same table `opens` reads (one source). Several roles give the union; the owner
   * opens every section the table names. Sorted, so the answer is stable.
   */
  async sectionsFor(roles: readonly StaffRole[]): Promise<string[]> {
    return sectionsOf(await this.all(), roles);
  }
}

/** The sections of `roles` in an already-read table (the Team read reads the table once for all its rows). */
export function sectionsOf(table: readonly RoleAccess[], roles: readonly StaffRole[]): string[] {
  if (roles.length === 0) return [];
  const every = roles.includes("owner");
  const out = new Set<string>();
  for (const r of table) if (every || roles.includes(r.role as StaffRole)) for (const s of r.sections) out.add(s as string);
  return [...out].sort();
}
