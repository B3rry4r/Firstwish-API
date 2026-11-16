import type { PrismaService } from "../../common/db/prisma.service";

/** X8: the house account's reserved handle. A wish it owns is a house wish (HS3): the house's own sample of a style. */
export const HOUSE_HANDLE = "firstwish";
export const HOUSE_WORDS = "This is a Firstwish sample. It cannot be kept, woken or reported.";
/** HU2: left out of staff Numbers: a condition on a wish row (the wish table's own "accountId"). */
export const NOT_HOUSE_SQL = `"accountId" NOT IN (SELECT id FROM account WHERE handle = '${HOUSE_HANDLE}')`;

type Db = Pick<PrismaService, "wish">;

/** HU2: true when the wish is owned by the house account. */
export async function isHouseWish(db: Db, wishId: string): Promise<boolean> {
  const w = await db.wish.findFirst({ where: { id: wishId, account: { handle: HOUSE_HANDLE } }, select: { id: true } });
  return w !== null;
}
