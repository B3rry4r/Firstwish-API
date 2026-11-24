# How chats work together on this build (read after HANDOVER.md)

More than one Claude chat works on Firstwish, on different accounts, at different times. They never talk to each
other directly. The REPO is the only shared memory. A chat that does not write it down has not done it.

## 1. At the start of every chat (before spending anything)

1. Attach BOTH repos: `B3rry4r/Firstwish-API` (server) and `B3rry4r/Firstwish-web` (web).
2. In each repo: fetch, then check out the work branch `claude/sleepy-mayer-f0hkb8` and pull it. Also fetch every
   branch named at the top of `build/handover/JOURNAL.md` ("Branches in use") and merge what is finished there.
3. Read, in this order: `build/handover/HANDOVER.md` (what is built, where things are, what is next);
   `build/handover/JOURNAL.md` from its LAST entry upward until you reach an entry you already know;
   `build/rulings.md` (the owner's words) and the END of `build/rulings-phase3.md` (the lead's defaults).
4. Load the owner's skills before you plan or spawn anything. If the account has them, by name:
   `build-orchestration`, `contract-driven-backend`, `frontend-surface-build`, `verification-harness`, `qa-audit`,
   `project-analysis`. If it does not, read the same files in `build/handover/skills/<name>/SKILL.md` (and their
   `references/` and `assets/`): they are exact copies. Follow them as written: they are the workflow.
5. Write a first JOURNAL entry: "started", your session link, the branch you may push, the heads you found.

## 2. Which branch

- If your chat is allowed to push `claude/sleepy-mayer-f0hkb8`: work there, as before.
- If your chat is given a different branch to push: create it FROM `claude/sleepy-mayer-f0hkb8` in each repo,
  push only that, and write its name under "Branches in use" at the top of JOURNAL.md (in your own branch: the
  next chat finds it by fetching `claude/*`). Never force-push, rebase or rewrite a branch another chat made.
- No pull request unless the owner asks.

## 3. The workflow (the owner's skills; the short form)

- The lead chat orchestrates, rules and merges. It writes NO task code.
- Every agent runs on Sonnet, set on every spawn (owner ruling R17). Never a dearer model.
- A builder builds on a local branch from a brief in `build/prompts/` (25 lines or fewer, a tier T0, T1 or T2,
  a step budget). A SEPARATE verifier checks every T1 and T2 task ("test, do not trust") and writes a verdict
  file: MERGE or FIX FIRST. At most 2 fix rounds, then the lead rules (a ruling in `build/rulings-phase3.md`) or
  re-cuts the task. Low findings go to `build/sweeps/`.
- Agents never push. The lead merges with the full check (HANDOVER.md section 7) and pushes.
- On the build machine: at most TWO browser or stack jobs and ONE other heavy job at once.
- Never edit a gate, a gate's settings or a baseline entry to get green. Never work around a refused command;
  say NOT RUN and tell the owner.
- Messages to the owner: short, plain words. Questions to the owner only where the skills allow; otherwise pick
  the default, write "Default (lead), owner may override" as a ruling, and add it to the owner's list
  (`build/owner/website-copy-audit-16nov.md`).

## 4. What must be written down, and where (the build machine is temporary: its scratch folder is lost)

| when | write | where |
|---|---|---|
| a brief is written | the brief itself | `build/prompts/<TASK>.md` |
| an agent is started | one line: task, tier, branch, base commit | JOURNAL.md |
| an agent hands back | 2 to 4 lines: head, what it claims, what it did NOT run | JOURNAL.md |
| a verifier gives a verdict | the verdict file, copied | `build/handover/verdicts/<task>-VERDICT.md`; one line in JOURNAL.md |
| the lead rules | the ruling | END of `build/rulings-phase3.md` |
| a merge | one line: what, the new head, the suite's totals | JOURNAL.md |
| the owner says something | the exact words, the date | `build/rulings.md` (a rule) or the owner's list |
| a command is refused | what, by whom, that it was not worked around | JOURNAL.md, and tell the owner |
| before stopping, EVERY time | a "State at the stop" entry (below); unmerged local branches saved as patch files in `build/handover/branches/` (`git format-patch --stdout <base>..<branch>`), or pushed if the chat may push them | JOURNAL.md |

Commit and push `build/` after each of these. Small commits are fine. HANDOVER.md is the map: change it only
when the map changes (a phase ends, a table row moves). JOURNAL.md is the diary: append only, newest LAST.

## 5. A JOURNAL entry

```
### 2026-11-24 16:50 UTC · <which chat: account or session link> · <branch pushed>
Heads: server <sha>, web <sha>.
Did: <what changed since the last entry, in 1 to 6 lines>.
Running: <agents still running, or "nothing">.
Unmerged: <branch, head, where its patch is>.
Next: <the next 1 to 3 steps, in order>.
For the owner: <anything waiting on them, or "nothing new">.
```

## 6. When a chat comes back after another chat worked

Do section 1 again. Believe the repo, not your memory: heads, JOURNAL.md, the rulings' end, the verdicts. If two
chats' notes disagree, the newer JOURNAL entry wins, and say so in your own entry.
