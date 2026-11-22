BUILDER WEB-API-9A | TIER T2 | The client's hearts at a reveal; the return path of every payment; the contact key; the Vault under the right business
Budget 170 steps. Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at
every closed case; stop only PIDs you started. If the branch, worktree or commits already exist, an earlier agent
was lost: read git log and carry on.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md FIRST and follow it. Then rulings IB1, IB2, IA4, IF1, IF2a, HU1, HR2, ID2, R10 in
/home/user/Firstwish-API/build/rulings-phase3.md, the contract's E-276 (POST /v1/r/:code/favourites), the `returnPath` field on the payment
starts (E-87, E-228, E-257), the idempotency-key header on E-254, and the audit rows UA-724, UA-831, UA-859, UA-976
in /home/user/Firstwish-API/build/owner/audit-ua-22nov.txt.
Screens (wired already; this adds to them): the client's page /r/<code>, pro-favourites, pro-vault and its pages,
the receiver's link /w/<slug> (keep and wake), the maker's ticket step and its return, pro-plan, site-contact.
Branch `web-api-9a` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line); worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-9a (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-9a-api (API at the commit in your spawn line); FIRST
`API_DIR=<your API worktree> npm run contracts:sync` and commit the contract file if it changed; ports 5620-5639;
stack prefix wa9a; the stack BUILT (`npm run live:up -- --built`, never next dev). Run every command with your own
worktree as the working directory.
You own: components/app/pro/RevealPlay.tsx, lib/vault-api.ts, app/app/pro/{vault,reveal,favourites}/**, app/r/**,
components/wish/link.ts (the keep and wake starts only), lib/seal.ts (startLine's body only), the plan page's start
call, components/site/ContactForm.tsx, scripts/live/flows/wa9a.mjs. Import-only: lib/api.ts, lib/session.ts.
Cases:
 1. Hearts (IB1, IB2): on /r/<code>, after the passcode where there is one, the client marks and unmarks a photo;
    the mark is the server's (by file), survives a reload and another device with the code; the limits and their
    words are the server's; a proof that may not be downloaded offers no download. The business's Favourites page
    and the shoot show the client's hearts as they arrive (read again on focus), and "waiting" only when none.
 2. The return path (IF1): every payment start the web makes sends `returnPath`: the link's own path for a keep
    and a wake at /w/<slug>; the maker's return for a ticket and an extra; the Plan page for a plan and a pack;
    the wish's page for the owner's keep. With the stand-in provider the person comes back to exactly that page
    and the result is read there (pending, paid, failed, refund due). No screen builds a provider address itself.
 3. The contact form sends an Idempotency-Key made for the form's intent (the same while the person retries the
    same words; a new one when the words change): two tabs and a double tap make one thread; the server's 409 for
    a reused key with other words is said plainly.
 4. The Vault's requests carry x-business-id (lib/vault-api.ts and the Vault, reveal and favourites pages), as the
    other business pages do: a person in two businesses sees each business's own shoots, reveals and hearts.
 5. Attacks you run yourself: hearts before the passcode; the 61st mark in an hour; a mark on a removed file; two
    devices marking at once; a typed returnPath to another site in the browser (the server refuses: the screen
    says so and does not go there); the contact key reused with other words; the second business's Vault by a
    typed address while the first is selected.
The live flow (wa9a.mjs) makes and removes only its own data and joins `npm run live:drive`; alone on a FRESH
stack 0 FAIL; then the whole driver ONCE (the spawn line names what may fail). Checks (quiet logs, EXIT lines):
typecheck, lint on changed files, check:css, gates, test:client, contracts:check, build; measure /r/<code> with
hearts and the Favourites page at 360, 390 and 1440. Commit; do not push; do not edit .pipeline-ui/wired.json or
scripts/gates/baseline.json; remove YOUR worktrees, stack and databases; leave no background jobs. Hand back ONCE in
10 lines: head; the claims one per line; the ui-align ids you close; the driver's totals; stale baseline ids.

ADDED 22 Nov (from the business re-check): Case 6. As a LOGIN of a business the Vault's "New shoot" sheet
(app/app/pro/vault/page.tsx:139) and the new-reveal page (app/app/pro/reveal/new/page.tsx:106) call readPeople and
get 403 GET /business/people. A login sends no request the server refuses: read what the server lets a login do in
the Vault (the roles in the contract) and draw exactly that: where a login may make a shoot or a reveal, the client
is chosen without the People read (the server's own way for a login, or typed), and where a login may not, the
control is not drawn. Then tap EVERY control on the Vault, reveal and favourites pages as a login: zero 401 or 403.
