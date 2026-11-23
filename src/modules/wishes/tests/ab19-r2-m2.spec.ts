import { PrismaService } from "../../../common/db/prisma.service";
import { uniqueAddress } from "../../../../test/kit/app";
import { boot } from "../../concierge/tests/kit";

const NOW = new Date("2027-03-08T09:00:00.000Z");
const letter = { letter: { paras: ["Happy birthday."] } };
const PASSCODE = { id: "passcode", values: { hint: "Our street" } };
const QUESTION = { id: "question", values: { question: "Where did we meet?" } };
const WORDS = "Use 4 to 64 characters. Spaces at the start and the end do not count.";

/** API-BASE-19 round 2, M2, L4 (IK2a): outer spaces are cut when a secret is set and when it is tried; 4 to 64 after the cut; an answer is matched NFKC then lower case; a passcode keeps its case. */
describe("API-BASE-19 r2 M2, L4 (IK2a): the receiver's secret, spaces and letters", () => {
  let k: Awaited<ReturnType<typeof boot>>;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("ab19m2", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  const version = async (id: string) => (await db.wish.findUniqueOrThrow({ where: { id } })).version;
  const patch = async (auth: string, id: string, body: Record<string, unknown>) => http().patch(`/v1/wishes/${id}`).set("Authorization", auth).send({ version: await version(id), ...body });
  const draft = async (kind: "passcode" | "question") => {
    const u = await k.account();
    const id = await k.wish(u.id, { status: "draft", name: "Ada", styleSlug: "noir", ticket: "keepsake", content: { ...letter, opening: kind === "passcode" ? PASSCODE : QUESTION } });
    return { u, id };
  };
  async function sealedWith(kind: "passcode" | "question", secret: string) {
    const { u, id } = await draft(kind);
    expect((await patch(u.auth, id, { passcode: secret })).status).toBe(200);
    expect((await http().post(`/v1/wishes/${id}/seal`).set("Authorization", u.auth).send({ version: await version(id), openNow: true })).status).toBe(200);
    return (await db.wishLink.findFirstOrThrow({ where: { wishId: id } })).slug;
  }
  /** one address for each try batch, so the hourly limit of one address never stands in the way */
  const tryIt = async (slug: string, body: Record<string, unknown>) => (await http().post(`/v1/w/${slug}/unlock`).set("x-forwarded-for", uniqueAddress()).send(body)).body.ok === true;

  it("set: outer spaces are cut; what is left is 4 to 64 characters; spaces only is 422 with words and keeps nothing", async () => {
    for (const kind of ["passcode", "question"] as const) {
      const { u, id } = await draft(kind);
      for (const bad of ["        ", "   abc   ", "   　 ", "x".repeat(65), ` ${"x".repeat(65)} `]) {
        const r = await patch(u.auth, id, { passcode: bad });
        expect(r.status).toBe(422);
        expect(r.body.error.fields.passcode).toBe(WORDS);
        expect(r.body.error.message).toBe(WORDS);
        expect((await db.wish.findUniqueOrThrow({ where: { id } })).passcodeHash).toBeNull();
      }
      for (const good of ["  abcd  ", ` ${"x".repeat(64)} `]) expect((await patch(u.auth, id, { passcode: good })).status).toBe(200);
      expect((await db.wish.findUniqueOrThrow({ where: { id } })).passcodeHash).not.toBeNull();
    }
  });

  it("set and try: a passcode is cut of outer spaces in both, and keeps its case", async () => {
    const slug = await sealedWith("passcode", "  Sesame7  ");
    for (const t of ["Sesame7", " Sesame7 ", "\tSesame7\n"]) expect(await tryIt(slug, { passcode: t })).toBe(true);
    for (const t of ["sesame7", "SESAME7", "Sesame 7", "   ", ""]) expect(await tryIt(slug, { passcode: t })).toBe(false);
    // a passcode is not folded to one unicode form: only the case and the outer spaces are its rules
    const fw = await sealedWith("passcode", "Cafe-1234");
    expect(await tryIt(fw, { passcode: "Ｃａｆｅ-1234" })).toBe(false);
  });

  it("set and try: an answer is cut of outer spaces and matched in NFKC then lower case (a spaces-only try is wrong)", async () => {
    const slug = await sealedWith("question", "  Baobab  ");
    for (const t of ["baobab", "BAOBAB", "  BaObAb ", "ＢＡＯＢＡＢ"]) expect(await tryIt(slug, { answer: t })).toBe(true);
    for (const t of ["baobabs", "bao bab", "    ", ""]) expect(await tryIt(slug, { answer: t })).toBe(false);
  });

  it("L4: \"Café\" typed two ways opens either way; \"Straße\" and \"STRASSE\" do not match (lower case, not a full case fold), \"STRAßE\" does", async () => {
    const nfc = "Café";
    const nfd = "Café";
    expect(nfc).not.toBe(nfd);
    const a = await sealedWith("question", nfc);
    for (const t of [nfc, nfd, "CAFÉ", "CAFÉ", " café "]) expect(await tryIt(a, { answer: t })).toBe(true);
    expect(await tryIt(a, { answer: "Cafe" })).toBe(false);
    const b = await sealedWith("question", nfd);
    for (const t of [nfc, nfd, "café"]) expect(await tryIt(b, { answer: t })).toBe(true);
    const s = await sealedWith("question", "Straße");
    for (const t of ["STRAßE", "straße"]) expect(await tryIt(s, { answer: t })).toBe(true);
    for (const t of ["STRASSE", "strasse"]) expect(await tryIt(s, { answer: t })).toBe(false);
    const u = await sealedWith("question", "STRASSE");
    expect(await tryIt(u, { answer: "Straße" })).toBe(false);
    expect(await tryIt(u, { answer: "strasse" })).toBe(true);
  });

  it("wrong tries still count on the link", async () => {
    const slug = await sealedWith("question", "Baobab");
    const link = await db.wishLink.findFirstOrThrow({ where: { slug } });
    const before = link.tries;
    expect(await tryIt(slug, { answer: "   " })).toBe(false);
    expect(await tryIt(slug, { answer: "nope" })).toBe(false);
    expect((await db.wishLink.findUniqueOrThrow({ where: { id: link.id } })).tries).toBe(before + 2);
  });
});
