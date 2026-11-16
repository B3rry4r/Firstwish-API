PATCH P-W0b | TIER T2 identity | Budget 30 steps. Close the named findings only; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules), ruling HL1 in /home/user/Firstwish-API/build/rulings-phase3.md, and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0b/VERDICT.md.
Work: commit on local branch `w0b-session` (53e76ef) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w0b (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w0b w0b-session`; `npm ci`); ports 5180-5199. No API stack is needed unless you choose to prove F3 live.
 F1 (medium, HL1) lib/maker.ts saveWish no longer writes "fw-account" (or any identity) to localStorage: the account lives
    in memory (lib/account.ts writeAccount) until W3/W4 wire it. Check the two readers of that key (lib/pro-api.ts:41,
    lib/vault-fixtures.ts:14) still behave (they fall back as on a fresh browser); do not touch fw-maker or the voice
    notes (W4, W5). Prove in a browser on a built web: sign in is not needed: call the maker's save path (or drive
    /app/new to the first save) and print localStorage keys: no fw-account.
 F2 (low, law 4) lib/session.ts: requestCode's answer is typed from lib/contracts/firstwish-contracts.d.ts, not
    Record<string, unknown>.
 F3 (low) After an erased (or banned) account's reload, the sign-up screen shows the server's own words when the refused
    refresh carries them, also when the tab was not signed in before; no made-up words when the server gives none.
Checks (quiet logs, EXIT lines): typecheck, lint, `npm run gates` (exit 0; no new finding; list baseline ids now stale),
`npm run test:client`, `npm run build`. Commit on w0b-session; do not push; remove your worktree. Hand back in 8 lines:
the new head; F1-F3 closed or not with file:line and what you saw; stale baseline ids; lines changed (git diff --stat).
