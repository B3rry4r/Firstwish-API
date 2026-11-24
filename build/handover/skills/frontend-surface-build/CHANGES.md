# Changes (review A, 16 Oct 2026). SKILL.md 322 -> 328 lines.

- FS-1 (must): measurement.md "Cleaning up": pkill block and `ps` check replaced by kill-by-PID and an `ss -ltnp` check on your ports; law 11 says the same.
- FS-2 (must): "Parallel agents in one repository" replaced by "Parallel agents: a worktree each" (own worktree, ports, db prefix, profile, cache; builder pushes its branch, lead merges by PR; about 3 heavy agents; stack script; grep the build for `localhost:`). measurement.md fixed ports 4455, 9333 and /tmp/cdp-profile replaced by per-agent variables from the brief.
- FS-2 (must): short-form COST RULES and VERIFY blocks added under "Parallel agents"; new references/briefs.md holds the build and verify brief templates.
- FS-3 (must): law 8, Phase 5 and the viewport table: `phone-min` 360 x 740 first where phones are primary, overflow check at 360 and 390 on pages that take money or input, overflow is a blocker.
- FS-4 (must): Autonomous table row "purpose is unclear: keep it" replaced by "task not built: not drawn, recorded as blocked"; Phase 6 item 7 added.
- FS-5 (should): Phase 4 "Briefs and records": exact cases, file map, step budget, no extras; task files hold open findings only.
- FS-6 (should): Phase 5 "Scope": task agent measures changed routes plus shared chrome; one agent or CI runs the full sweep once per wave; print counts and `tail -n 15`.
- FS-7 (should): Phase 3 gets a `role` field per control; a control shown to a role that cannot use it is dead.
- FS-8 (should): Verify block and Reporting: verdict `merge`/`fix`, lows to the sweep list, a small UI task still gets an independent checker (law 2 cites the 13 px payment page).
- FS-9 (should): measurement.md: a jest worker SIGKILL or a silent server death is a memory kill; wait for `free -g` at 5 GB, rerun, keep one browser and one dev server.
- Fix: removed the pointer to `qa-audit` and to `contract-driven-backend` (not shipped here); the independent-verifier rule is now in this skill. All em-dashes removed from SKILL.md and both references.
- Skipped (nice): FS-10, FS-11.
- Machine budget block added by the checker (16 Oct 2026 owner rule): measure the machine, heavy-agent cap, 5 GB start rule, memory-kill symptoms, disk, CI for full suites.

## Fixer pass (16 Oct 2026, from the two checkers)
- Fix (medium): measurement.md example starts `node node_modules/next/dist/bin/next dev` (not `npx`), waits until the port listens and records the PID read from the socket (`ss -ltnp`, `lsof` if ss is missing); the cleanup block says dev.pid is that PID, not a wrapper's.
- Fix (low): REVIEW.md for the owner is a visual board with short labels (artifact tree line and Autonomous mode paragraph).
- Consistency: "about 3 heavy agents" in Parallel agents replaced by a pointer to the Machine budget; its cap is min(CPUs + 1, available GB / 2.5) measured at the start (WMT example kept); idle rule is "look again within 4 minutes (the cache lapses at 5)". One Machine budget block.
- Machine budget, housekeeping (owner, 16 Oct 2026): the one Machine budget block gains the dispatcher's housekeeping rule (after every merge, every few hours, and at once under about 20% or 5 GB free disk or 5 GB available memory: df/free/process list, remove merged or abandoned worktrees and scratch folders, delete large leftovers, stop orphan servers by PID; never touch a running agent's folder or evidence an open task cites; no new heavy agent while under the line) with the WMT example (108 folders cleared, 3.9 GB to 9.5 GB free, 12 agents running).

## 27 Oct 2026: tiered workflow
- New "Tiers and bundles" paragraph in Phase 4 (one place): T0/T1/T2 with step budgets, bundles of 2 to 5 screens of one area, rounds by severity (max 2, then the lead rules; a fix of 30 lines or fewer accepted on the diff read), batch PRs, and what the lead stops doing; law 1 is now one agent per scope or bundle.
- Law 2 and Verify: a separate verifier per T1 or T2 bundle (lean vs full), none for T0; "every task, however small" is gone. Cost rules: affected specs only, full suite in CI on every push and never awaited, 10-line hand-back. Full measurement sweep runs once per batch (merge agent or CI), not per wave.
- Pictures: one light/dark pair per changed screen at the narrowest width (T2 pay screens every drawn state); measurements at 360 and 390 stay (numbers, not pictures). briefs.md templates are tier-aware, 25 lines, 10 and 20 line hand-backs.
- Autonomous mode: owner asked in six cases only; defaults recorded "Default (lead), owner may override" and listed, never asked. Machine budget kept, unwrapped. Net 393 -> 365 lines.
