PATCH SCHEMA, two new findings | TIER T2 | Budget 30 steps. Fix only these; change nothing else. Keep the diff small.
Read /home/user/Firstwish-API/build/common-rules.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-schema/VERDICT-R2.md.
Branch `api-schema` (head e30b8ba) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p3-api-schema (`npm ci`); ports 4090-4099; database prefix p3sch.
 NEW-1 (high) src/common/http/wire-json.ts:29-41: toWire must turn BigInt into a JSON integer ONLY inside plain objects and arrays
   (Object.getPrototypeOf(x) === Object.prototype or null, or Array.isArray). It returns every other value untouched: Buffer,
   typed arrays, Date, Map, Set, StreamableFile, Readable, class instances with their own toJSON. Tests: a Buffer, a StreamableFile
   and a Readable come back identical (same reference); a Date serialises as before; nested plain objects still convert; 2^53 still answers 500.
 NEW-2 (medium) src/contracts/dto/account.ts:64-66 and src/contracts/types.ts:1701: PATCH /v1/me `bio` is validated as
   IsIn(["string","undefined"]) because registry type text leaked in as a literal. Fix it in tools/pipeline/gen_schema.py (the
   generator), regenerate, and grep the whole of src/contracts for the same leak (a union of type NAMES used as values: "string",
   "number", "boolean", "undefined", "null", "object", "array"): list every place fixed. Test: bio "Loves jollof." passes; bio 5 is refused.
   The registry itself is not changed (its sha must still equal the lock).
Checks (quiet logs, EXIT lines): build, typecheck, lint, check-contracts, gates.sh, gen_schema.py run twice gives the same output,
the affected specs. Commit on `api-schema` (do not push); remove your worktree and databases.
Hand back in 6 lines: head sha; NEW-1 and NEW-2 closed with proof; every other leak found; diff size (git diff --stat, last line); EXIT lines.
