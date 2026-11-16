PATCH P-W0a | TIER T0 | Budget 25 steps. Two small fixes to the web repo's gates. No screen changes.
Read /home/user/Firstwish-API/build/common-rules.md and the verifier's file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0a/VERDICT.md.
Work: the WEB repo /home/user/Firstwish-web: commit on local branch `w0a-harness` (42a9020) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w0a (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w0a w0a-harness`; `npm ci` only if a check needs it). Touch only scripts/gates/**, .gitignore and the gates' own tests.
 1. The 15 tracked scripts/gates/**/__pycache__/*.pyc files leave the repository (`git rm --cached`) and .gitignore keeps them
    out; a gate run leaves `git status` clean.
 2. product_invariants: (a) the native-control rule for alert, confirm and prompt is case-sensitive and matches a call on
    window or a bare call, not a component named Confirm; (b) the copy rule for "type" fires only where the word stands for
    a kind of wish, style or account in customer copy (for example "type of wish", "wish type", "types of", "account type",
    "style type", "choose a type") and not as a verb ("Type by the letter", "type your name"), an HTML or code attribute,
    or typography; "format" and "category" keep firing as they do. Fixtures for each: must fire, must stay quiet. Print the
    count before and after for the whole repo and list the findings that remain for "type".
 3. browser_storage: the docstring states its known limit plainly (a store reached through a computed name such as
    globalThis['local' + 'Storage'] is not seen); the Cache API with no /v1 address is a warning, not a failure.
Checks (quiet logs, EXIT lines): `npm run gates:test`; `npm run gates` (it still exits 1 on real findings: give the new
counts by gate). Commit on w0a-harness; do not push; remove your worktree. Hand back in 6 lines: head; counts by gate before
and after; the remaining "type" findings.
