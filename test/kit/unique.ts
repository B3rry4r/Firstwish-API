import { randomUUID } from "node:crypto";

/**
 * Values for columns with a unique constraint (wish.no, wish_link.slug, account.handle), made for tests.
 * Every one is built from a fresh random id (the whole of it where the column allows), so no two specs sharing one database can make the same value.
 * A test wish number starts with a letter and a dash: the product issues only digits (wishes.service issueNumber), so it never equals one.
 */
const fresh = () => randomUUID().replace(/-/g, "");

/** A wish number no customer is ever issued and no other call returns. `tag` is a short readable label (letters and digits). */
export function testWishNo(tag = "t"): string {
  // 24 characters is the longest number the staff routes accept (admin-wishes.service NO), so the random part fills what the tag leaves: 60 bits or more.
  return `${tag}-${fresh().slice(0, 24 - tag.length - 1)}`;
}

/** A wish link slug (letters, digits, dashes; 30 characters or fewer) that no other call returns. */
export function testSlug(tag = "t"): string {
  return `${tag}-${fresh()}`.slice(0, 30);
}
