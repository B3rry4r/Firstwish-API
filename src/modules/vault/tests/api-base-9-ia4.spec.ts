import { useKit } from "./ab9-kit";

describe("API-BASE-9 case 1 (IA4): a reveal's passcode holds for every link to those files", () => {
  const k = useKit();
  const copy = async (o: { token: string }, shoot: string, set = "proofs") => {
    const r = await k.post(`/v1/business/reveal-links/${shoot}/copy-link`, o.token, { set });
    expect(r.status).toBe(200);
    return JSON.parse(r.text) as string;
  };
  const read = (link: string, token?: string) => k.t.http().get(`/v1/r/${k.codeOf(link)}`).set(token ? { "x-unlock-token": token } : {});
  const send = (o: { token: string }, wish: string, shoot: string, reveal: object, set = "proofs") =>
    k.post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot, set, reveal });

  it("copy-link after a passcode reveal answers a link that still asks for the passcode, and the passcode opens it", async () => {
    const o = await k.owner();
    const { shoot } = await k.shootWith(o);
    const wish = await k.clientWish(o);
    expect((await send(o, wish, shoot, k.revealBody({ passcode: "blue-door" }))).status).toBe(200);
    const link = await copy(o, shoot);
    expect((await read(link)).body).toEqual({ state: "passcode" });
    const bad = await k.t.http().post(`/v1/r/${k.codeOf(link)}/unlock`).send({ passcode: "nope-nope" });
    expect(bad.body.ok).toBe(false);
    const good = await k.t.http().post(`/v1/r/${k.codeOf(link)}/unlock`).send({ passcode: "blue-door" });
    expect(good.body.ok).toBe(true);
    const open = await read(link, good.body.token);
    expect(open.body.state).toBe("open");
    expect(open.body.photos).toHaveLength(2);
    // a second copy gives the same link, still gated
    expect(await copy(o, shoot)).toBe(link);
    expect((await read(link)).body.state).toBe("passcode");
  });

  it("a link copied BEFORE the reveal is gated when the passcode reveal is sent; a link switched off and made again is gated too", async () => {
    const o = await k.owner();
    const { shoot } = await k.shootWith(o);
    const first = await copy(o, shoot);
    expect((await read(first)).body.state).toBe("open");
    const wish = await k.clientWish(o);
    expect((await send(o, wish, shoot, k.revealBody({ passcode: "red-door" }))).status).toBe(200);
    expect((await read(first)).body.state).toBe("passcode");
    const id = (await k.db.$queryRaw<{ id: string }[]>`SELECT "linkId"::text AS id FROM reveal_access WHERE code = ${k.codeOf(first)}`)[0].id;
    expect((await k.post(`/v1/business/reveal-links/${id}/off`, o.token)).status).toBe(200);
    const again = await copy(o, shoot);
    expect(again).not.toBe(first);
    expect((await read(again)).body.state).toBe("passcode");
    const unlock = await k.t.http().post(`/v1/r/${k.codeOf(again)}/unlock`).send({ passcode: "red-door" });
    expect(unlock.body.ok).toBe(true);
  });

  it("every route that returns a link for a shoot, a reveal or a client wish gives only ways in that ask for the passcode", async () => {
    const o = await k.owner();
    const { shoot } = await k.shootWith(o, "finals");
    const wish = await k.clientWish(o);
    const sent = await send(o, wish, shoot, k.revealBody({ passcode: "gold-door" }), "finals");
    expect(sent.status).toBe(200);
    const links: string[] = [await copy(o, shoot, "finals")];
    const row = (await k.db.$queryRaw<{ id: string; link: string }[]>`SELECT a."linkId"::text AS id, l.link FROM reveal_access a JOIN reveal_link l ON l.id = a."linkId" WHERE a."wishId" = ${wish}::uuid`)[0];
    const byId = await k.get(`/v1/business/reveal-links/${row.id}`, o.token);
    expect(byId.body.passcode).toBe(true);
    links.push(byId.body.link);
    const wishRead = await k.get(`/v1/business/client-wishes/${wish}`, o.token);
    const shootRead = await k.get(`/v1/business/shoots/${shoot}`, o.token);
    // none of these reads carries a link address or a code: the reveal marks hold the link's id only
    expect(JSON.stringify([wishRead.body, shootRead.body, sent.body])).not.toContain(k.codeOf(row.link));
    const copyId = await k.get(`/v1/business/reveal-links/${(await k.db.$queryRaw<{ id: string }[]>`SELECT "linkId"::text AS id FROM reveal_access WHERE code = ${k.codeOf(links[0])}`)[0].id}`, o.token);
    expect(copyId.body.passcode).toBe(true);
    for (const l of links) expect((await read(l)).body).toEqual({ state: "passcode" });
    // another business cannot ask for the link of this shoot
    const other = await k.owner();
    expect((await k.post(`/v1/business/reveal-links/${shoot}/copy-link`, other.token, { set: "finals" })).status).toBe(404);
    expect((await k.get(`/v1/business/reveal-links/${row.id}`, other.token)).status).toBe(404);
  });

  it("a shoot with no passcode reveal still copies a link that opens at once (nothing changes for it)", async () => {
    const o = await k.owner();
    const { shoot } = await k.shootWith(o);
    const wish = await k.clientWish(o);
    expect((await send(o, wish, shoot, k.revealBody())).status).toBe(200);
    const link = await copy(o, shoot);
    expect((await read(link)).body.state).toBe("open");
  });
});
