# Journal of the Firstwish build (append only; newest LAST; rules in PROTOCOL.md)

## Branches in use
- `claude/sleepy-mayer-f0hkb8` in both repos: the work branch (first chat). Everything merged up to 24 Nov is here.
- `ccr-91b3ed11-fx445c` in both repos: the second chat's push branch, made from `claude/sleepy-mayer-f0hkb8` (2e861d1 server, 2f45b9d web). Newer merges land here.

---

### 2026-11-24 17:10 UTC · first chat (session_01Ji5DsgbRbxW8JX4EbGEa5o) · claude/sleepy-mayer-f0hkb8
Heads: server = the commit holding this entry; web 2f1cdc8 (plus a pointer file).
Did: stopped at the owner's word (weekly limit nearly spent). Wrote HANDOVER.md, PROTOCOL.md, this journal;
copied the owner's six skills to build/handover/skills/; the full older log is working-log.md. Today's merges:
real photo resizing (round 22), photo, voice and clip privacy (round 23), test isolation (P-CI-10), the web's
clock change (W18) and the contract sync. Last full server suite: 224 suites, 1,734 tests, green.
Running: nothing. The hourly scheduled check of the first chat is switched off.
Unmerged: server `r5` (the video recorder, 725d21c, base 992efe4): build/handover/branches/api-r5-from-992efe4.patch;
web `r4c` (the 43-style recording test, a770810, base 88bcd46): build/handover/branches/web-r4c-from-88bcd46.patch.
Next: (1) a short re-check of r5's last fix round by a separate Sonnet verifier, then merge (ruling IK6h);
(2) one fix round on r4c for the cues its check found (ruling IK8a), re-check by looking at frames, merge;
(3) a web task: the render page becomes ready with no time passing (Studio) and every entrance starts from the
stepped clock; (4) R6 (build/prompts/R6.md); (5) WEB-10D (build/prompts/WEB-10D.md) after r4c merges.
For the owner: the list in HANDOVER.md section 8 (keys, server, bucket, domain, GitHub billing; open questions).

### 2026-11-25 · second chat (https://claude.ai/code/session_01VNvA3zNK8bJENArUhDXHfa) · ccr-91b3ed11-fx445c
Heads: server 2e861d1, web 2f45b9d (both = claude/sleepy-mayer-f0hkb8). This chat may push only `ccr-91b3ed11-fx445c` (both repos).
Did: started. Read HANDOVER, PROTOCOL, JOURNAL, rulings; loaded the six skills by name. Machine: 4 CPUs, 15 GB, 60 GB free; PostgreSQL 16 and
Redis started, role firstwish made; npm ci in both clones. Re-applied the patches: server `r5` = e5a56ad (same content as 725d21c), web `r4c` =
847b3fd (same as a770810); both merge clean onto the heads. common-rules.md: new scratch path, session link, machine line (2 browser jobs + 1 other).
Briefs: build/prompts/VERIFY3-R5.md (IK6h (a)), build/prompts/P-R4C.md (IK8a).
Running: VERIFY3-R5 (T2 re-check, Sonnet, server r5 e5a56ad on 79c74fe); P-R4C (T2 fix round, Sonnet, web r4c 847b3fd + head 2f45b9d).
Unmerged: r5 e5a56ad, r4c 847b3fd (patches in build/handover/branches/).
Next: (1) VERIFY3-R5, then merge r5; (2) P-R4C, then a re-check that looks at frames, then merge r4c; (3) the web render-page task (Studio ready at
clock 0; entrances from the stepped clock), then R6; (4) WEB-10D after r4c.
For the owner: nothing new.
