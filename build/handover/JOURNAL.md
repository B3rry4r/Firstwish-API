# Journal of the Firstwish build (append only; newest LAST; rules in PROTOCOL.md)

## Branches in use
- `claude/sleepy-mayer-f0hkb8` in both repos: the work branch (first chat). Everything merged so far is here.

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
