VERIFIER B10 | TIER T2 full | Budget 95 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B10.md (the cases are the contract),
rulings EE3, EE7, EE8, JJ2, LL1-LL5 in build/rulings-phase3.md, owner ruling R10.
Under test: local branch `b10-receiver-link` (head 74c8eee) of /home/user/Firstwish-API; base local branch int-3 (f39149a). Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b10 (detached at the branch; `npm ci`); ports 4610-4619; TEST_DB_PREFIX=vb10 for every run; remove both when done; kill by PID.
Known and NOT findings: `npm run build` fails on src/modules/purchases/grants.ts(84) (another bundle's file, being fixed): use
typecheck of the module's own files and createTestApp with supertest and the clock port; LL1-LL5 (raw SQL tables; the unlock
token and files fields are beyond the registry; E-133 not built; limits are provisional).
CLAIMS: each numbered line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b10/CLAIMS.md: PASS or FAIL with what you saw.
Attacks (this is the one door strangers use: spend your steps here):
 - Before its time: every way to get the content early: a header, a query, the phone's clock in the body, a token made for
   another link, an unlock call before the open time, HEAD and OPTIONS, the feed's play route with the slug, a signed file link
   guessed from a pattern, the opening data (does it leak the letter, names beyond the receiver's, a file key?).
 - After its end: resting, taken down, removed, erased, owner erased: 410 and NOTHING of the wish in the body or headers; a
   signed file link issued one minute before the wish rested: for how long does it still read? (say; over 10 minutes is a finding).
 - The passcode: 40 wrong tries from one address (locks; says when); 40 wrong tries from 40 addresses at once (the per-link
   lock holds: at most 30 are checked, counted in one statement: prove with the right code sent in the same burst); the right
   code while locked (refused); timing of right against wrong (20 each: within noise); the hash and the passcode never in any
   response, error or log line; an unlock token replayed after the owner changed the passcode (dead); after 15 minutes (dead).
 - Enumeration: 100 wrong slugs: 404 then 429; the same time for an unknown slug and a gone one (20 each); a slug with
   %00, unicode look-alikes, 200 characters, SQL characters: 404, never 500. X-Forwarded-For forged with TRUST_PROXY_HOPS=0.
 - First opening: 30 first reads at once: one first=true, openedAt once, one transition, endsAt = openedAt + the ticket's term;
   a read one second before the open time does not start the term; a countdown read never starts it.
 - Files: links only for the wish's own wish_file rows; a file of a rejected screening, a deleted file, another wish's file id
   planted in content: no link; the link is for GET of one key for 10 minutes.
 - Privacy: search every public response (all states) for the sender's email, phone, account id, handle if not public, staff
   fields, internal ids of other tables; reactions and shares store no address (search the tables).
 - Reactions and favourites: 50 reactions at once from one session: one row; a 41-character and an empty reaction; a script
   tag as a reaction (stored as text; say); writes while sealed, locked, gone: refused.
 - Errors: the envelope; no 500 anywhere; 429s carry Retry-After.
Checks (quiet logs, EXIT lines): typecheck, lint on the module, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/public-wishes` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b10/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
