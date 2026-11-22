import { useKit } from "./ab9-kit";

/** IC6: a name is plain text. */
describe("IC6: names lose control and direction-override characters; dots alone are refused", () => {
  const k = useKit();

  it("a shoot and a file name are stored without control or direction-override characters (a C0 control is refused outright), and dots alone are 422", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 1);
    const hidden = "Ada\u202e\u0085 \u2066Obi\u200f\u009f";
    const r = await k.patch(`/v1/business/shoots/${s.shoot}`, o.token, { title: hidden, client: `\u202eBola\u202d Eze` });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: "Ada Obi", client: "Bola Eze" });
    const stored = await k.db.shoot.findUniqueOrThrow({ where: { id: s.shoot } });
    expect(stored.title).toBe("Ada Obi");
    expect(stored.client).toBe("Bola Eze");
    for (const body of [{ title: ".." }, { title: "..." }, { client: " . . " }, { client: ".\u202e." }, { title: "\u202e\u2066" }]) {
      const bad = await k.patch(`/v1/business/shoots/${s.shoot}`, o.token, body);
      expect(bad.status).toBe(422);
    }
    const made = await k.post("/v1/business/shoots", o.token, { client: "\u202eZed Ola", date: "2027-02-20", title: "Sea\u202eside" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ client: "Zed Ola", title: "Seaside" });
    expect((await k.post("/v1/business/shoots", o.token, { client: "Zed", date: "2027-02-20", title: ".." })).status).toBe(422);
    const f = await k.patch(`/v1/business/vault-files/${s.files[0]}`, o.token, { name: "Photo\u202egpj.exe\u200b.jpg" });
    expect(f.status).toBe(200);
    expect(f.body.name).toBe("Photogpj.exe.jpg");
    for (const name of ["..", "...", " .. ", "\u202e.."]) expect((await k.patch(`/v1/business/vault-files/${s.files[0]}`, o.token, { name })).status).toBe(422);
    // a C0 control character is refused for every text by the app's one global check; the same name with it left out is accepted
    expect((await k.patch(`/v1/business/vault-files/${s.files[0]}`, o.token, { name: "bad\u0001name" })).status).toBe(422);
  });
});
