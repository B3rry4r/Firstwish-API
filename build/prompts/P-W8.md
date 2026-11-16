PATCH P-W8 | TIER T2 money | Budget 110 steps. Close the verifier's findings on the business screens; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules; how to wire, measure, check), /home/user/Firstwish-API/build/prompts/W8.md, rulings HR1-HR5
and HF1, HF3, HH6 in /home/user/Firstwish-API/build/rulings-phase3.md, and the verifier's file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w8-business1/VERDICT.md.
Work: branch `w8-business1` (fb498a8) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w8. FIRST merge the web
branch head (commit in your spawn line: it holds the receiver's screens: /w/mine?id= now plays the server's draft)
into w8-business1 with a merge commit (no rebase), keeping both sides' work; `npm ci`; `API_DIR=<your API worktree> npm
run contracts:sync` if the contract file differs (commit it). If typecheck then fails in files that are NOT yours (the
staff Team screen, lib/staff-screens.ts, lib/person.ts, lib/admin/**), patch them LOCALLY to build and never commit
that (another builder is fixing them). API for your stack: a detached worktree at the commit in your spawn line,
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w8-api; ports 5460-5479; stack prefix pw8. Work ONLY inside your worktrees.
For this patch you may also edit app/app/wishes/return/page.tsx (W3's page) for F2 only.
 F1 (high, HR1, web side) The Plan screen says, before the pay sheet opens, what paying does, from what the server
    gives today (the live plan and its renewal day from GET /business/plan): the same plan: "You have Pro Studio until
    16 Dec. Paying now adds a month, to 16 Jan."; another plan: that it replaces the live one from now; after paying,
    the screen says what changed (the new renewal day), read from the server. While a plan payment of this business is
    pending (the payments read), the pay control says so and does not start another. List under REQUESTS what the API
    must add (a per-plan "what a payment now would do", the 409 on a second pending start).
 F2 (high, HR2) /app/wishes/return reads the payment from the server and, for the purposes pro-plan and wish-pack,
    goes to /app/pro/plan with the result said in words (paid: what the business now has; failed or left: nothing
    changed, the server's reason where it gives one); a wish's keep or wake and the Pass keep going where they do now.
 F3 (high) Preview and receiver links on a client wish: a draft's preview opens /w/mine?id=<id> (prove it plays for
    the owner after the merge); a sealed or opened wish's link is the server's link shown and copied as a full
    address (with the site's origin), and it opens the receiver's page on your stack.
 F4 (high, HR3, web side) Someone who is not this business's owner: the pages never offer "Add a business" on a
    403 from the business reads; they show the designed not-allowed state with the server's words. A person with no
    business side at all still gets the set-up form, which calls the server (SetUp.tsx's memory-only BusinessForm is
    the app shell's: list it under REQUESTS with what it must call). List what /me must carry for a login.
 F5 (mediums) A draft client wish is tagged Draft, not Sealed (lib/pro-api.ts:133: every state from the server's
    value); a removed draft says when its wish returns to the pack (HR4: the day from the server; if the server gives
    no day, say only that it returns when the draft can no longer be restored, and list the request); a field the
    server refuses shows the words ON that field (the phone); the import shows each refused row with the server's
    words and never says "201 added" when 3 were not (HR5: send every row; drop nothing in the client); "Logins" shows
    the true count against the limit (no Math.min) and a downgrade that the logins exceed says so before paying; a
    business that never paid does not read "PAID ONCE"; lib/pro-data.ts:19-21 hand-typed prices go (the price book).
Measure and check as P6-COMMON says (measure file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w8-measure.txt; pictures /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w8-pics/:
the Plan screen before paying with a live plan, after paying, with a payment pending; the return page for a pack; a
draft and a sealed client wish; the import's result with refused rows; the not-allowed state; light and dark at 360).
Commit on w8-business1; do not push; do not commit wired.json or the baseline; remove your worktrees, stack and
databases; leave no background jobs. Hand back ONCE in 12 lines: head; F1-F5 closed or not with file:line and what
you saw; stale baseline ids; REQUESTS; NOT RUN.
