import { readFileSync } from "node:fs";
import { join } from "node:path";
import { account, B12App, b13App, bearer, liveWish } from "./b13-kit";

const flat = (x: string) => x.replace(/\s+/g, " ").replace(/\{ /g, "{ ").replace(/ \}/g, " }");
const dts = flat(readFileSync(join(__dirname, "../../../../contracts/firstwish-contracts.d.ts"), "utf8"));
const block = (name: string) => dts.slice(dts.indexOf(`export interface ${name} {`), dts.indexOf("} export", dts.indexOf(`export interface ${name} {`)));

/** API-BASE-4 HP4 and HP10: the contract says what the server sends. */
describe("API-BASE-4 contract matches the server (HP4, HP10)", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b13App();
  });
  afterAll(() => t.close());

  it("HP4: the link read answers {link, slug} and the contract says so; Wish.no is nullable; the state values are the server's", async () => {
    const owner = await account(t, ["person"]);
    const w = await liveWish(t, owner);
    const r = await t.http().get(`/v1/wishes/${w.id}/link`).set(bearer(owner.token));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ link: `/w/${w.slug}`, slug: w.slug });
    expect(dts).toContain("export type GetWishesByIdLinkResponse = { link: string; slug: string; };");
    expect(block("Wish")).toContain("no?: string | null;");
    expect(block("Wish")).toContain('state: "draft" | "sealed" | "live" | "resting" | "taken_down" | "erased";');
    expect(block("Wish")).toContain('video: "none" | "asked" | "rendering" | "ready" | "failed";');
    const got = (await t.http().get(`/v1/wishes/${w.id}`).set(bearer(owner.token))).body as { state: string; status: string };
    expect(["draft", "sealed", "live", "resting", "taken_down", "erased"]).toContain(got.state);
  });

  it("HP10: the follow routes take no body (a body handle is refused) and the contract has none; the loose fields are typed", async () => {
    const owner = await account(t, ["person"]);
    const r = await t.http().put("/v1/creators/someone/follow").set(bearer(owner.token)).send({ handle: "someone" });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain("handle");
    expect(dts).toContain("export type PutCreatorsByHandleFollowBody = Record<string, never>;");
    expect(dts).toContain("export type DeleteCreatorsByHandleFollowBody = Record<string, never>;");
    expect(block("PublishedWish")).toContain("creator: { handle?: string; name: string; } | null;");
    expect(block("PublishedWish")).toContain("counts: { reactions: number; saves: number; };");
    expect(block("PublishedWish")).toContain("mine: { reaction?: \"love\" | \"joy\" | \"clap\" | \"wow\" | null; saved?: boolean; };");
    expect(block("PlayWish")).toContain("receiverName: string | null");
    expect(block("DateRow")).toMatch(/for\?: string \| null;/);
    expect(block("Style")).toContain("kinds: Array<string>;");
    expect(block("Style")).toContain("creator: { handle: string; name: string; } | null;");
    expect(block("Reaction")).toContain("wish: string;");
    expect(block("ReactResponse")).toContain("reaction: Reaction | null;");
  });
});
