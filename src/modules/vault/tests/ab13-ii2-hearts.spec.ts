import { uniqueAddress } from "../../../../test/kit/app";
import { useKit } from "./ab9-kit";

/* API-BASE-13 case 2 (II2, IB1, IC2): a heart is only for a photo that is still one of the shoot's ready files; an old heart can always be cleared. */
describe("API-BASE-13 case 2 (II2): hearts and files that are gone or not this shoot's", () => {
  const k = useKit();
  const setup = async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 3);
    const wish = await k.clientWish(o);
    const sent = await k.post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot: s.shoot, set: "proofs", reveal: k.revealBody() });
    expect(sent.status).toBe(200);
    const [link] = await k.db.$queryRaw<{ id: string; code: string }[]>`SELECT "linkId"::text AS id, code FROM reveal_access WHERE "wishId" = ${wish}::uuid`;
    return { o, ...s, wish, ...link };
  };
  const mark = (code: string, position: number, marked: boolean) => k.t.http().post(`/v1/r/${code}/favourites`).set("x-forwarded-for", uniqueAddress()).send({ position, marked });
  const stored = async (linkId: string) => (await k.db.$queryRaw<{ hearts: string[] }[]>`SELECT hearts::text[] AS hearts FROM reveal_access WHERE "linkId" = ${linkId}::uuid`)[0].hearts;

  it("a file removed from the shoot cannot be marked: 422 in words, nothing stored on the link, the client wish or the shoot", async () => {
    const x = await setup();
    expect((await mark(x.code, 0, true)).body).toEqual({ hearts: [0] });
    const gone = await k.t.http().delete(`/v1/uploads/${x.files[1]}`).set("authorization", `Bearer ${x.o.token}`).send({});
    expect(gone.status).toBeLessThan(300);
    // the link still lists the removed file's place; marking that place is refused
    expect((await k.t.http().get(`/v1/r/${x.code}`).set("x-forwarded-for", uniqueAddress())).body.index).toEqual([0, 2]);
    const r = await mark(x.code, 1, true);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("validation_failed");
    expect(r.body.error.fields.position).toMatch(/not in this shoot any more/);
    expect(await stored(x.id)).toEqual([x.files[0]]);
    expect((await k.get(`/v1/business/client-wishes/${x.wish}`, x.o.token)).body.hearts).toEqual([0]);
    expect((await k.get(`/v1/business/shoots/${x.shoot}`, x.o.token)).body.hearts).toEqual([x.files[0]]);
    // the photos that remain still mark
    expect((await mark(x.code, 2, true)).body).toEqual({ hearts: [0, 2] });
  });

  it("a file of another shoot (or another business) in the link's list is refused the same way", async () => {
    const x = await setup();
    const other = await k.shootWith(x.o, "proofs", 1);
    const foreign = await k.owner();
    const strange = await k.vaultFile(foreign);
    await k.db.$executeRaw`UPDATE reveal_access SET "fileIds" = ${JSON.stringify([...x.files, other.files[0], strange])}::jsonb WHERE "linkId" = ${x.id}::uuid`;
    for (const position of [3, 4]) {
      const r = await mark(x.code, position, true);
      expect(r.status).toBe(422);
      expect(r.body.error.fields.position).toMatch(/not in this shoot any more/);
    }
    expect(await stored(x.id)).toEqual([]);
    expect((await mark(x.code, 0, true)).body).toEqual({ hearts: [0] });
    // a file of the shoot that is no longer ready (refused by the screening) is refused too
    await k.db.$executeRaw`UPDATE stored_file SET status = 'rejected' WHERE id = ${x.files[2]}::uuid`;
    expect((await mark(x.code, 2, true)).status).toBe(422);
    expect(await stored(x.id)).toEqual([x.files[0]]);
  });

  it("unmarking the old heart of a removed file clears it, on the link, the client wish and the shoot", async () => {
    const x = await setup();
    expect((await mark(x.code, 1, true)).body).toEqual({ hearts: [1] });
    expect((await mark(x.code, 2, true)).body).toEqual({ hearts: [1, 2] });
    // older data: the file is gone but its heart was left behind
    await k.db.$executeRaw`DELETE FROM stored_file WHERE id = ${x.files[1]}::uuid`;
    expect([...(await stored(x.id))].sort()).toEqual([x.files[1], x.files[2]].sort());
    const cleared = await mark(x.code, 1, false);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ hearts: [2] });
    expect(await stored(x.id)).toEqual([x.files[2]]);
    expect((await k.get(`/v1/business/client-wishes/${x.wish}`, x.o.token)).body.hearts).toEqual([2]);
    expect((await k.get(`/v1/business/shoots/${x.shoot}`, x.o.token)).body.hearts).toEqual([x.files[2]]);
    // unmarking it again changes nothing and is not an error
    expect((await mark(x.code, 1, false)).body).toEqual({ hearts: [2] });
  });
});
