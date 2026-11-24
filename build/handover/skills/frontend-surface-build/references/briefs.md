# Agent briefs

A brief is short: 25 lines or fewer, from a template, no rule text or history. Cost is steps times context, so every extra line is re-read on every step. Put the cost rules (SKILL.md, "Cost rules") at the head of each brief, then one of the two templates below. Fill every `{{...}}`; leave out anything optional. The first line names the tier (T0 lean, T1 plain, T2 money and identity).

## Build brief

```
Tier {{T0|T1|T2}}. You build {{bundle: 1 to 5 tasks of one area}}: {{routes or component families}} only. Edit only the files in the file map.
Worktree {{path}} (detached), ports {{ports}}, database prefix {{prefix}}, browser profile {{dir}},
bundler cache {{dir}}. Boot with {{the repo's stack script}} only if a seam is claimed; do not hand-build a stack.
File map: {{files you may edit}}; import-only: {{shared components, contract types}}.
Cases to build and test, exactly these: {{numbered cases, each with the state that enters it}}.
Show only what is built: a control or section whose task is not built is not drawn; list it as blocked.
Run only the affected specs, typecheck and lint on changed files; the full suite is CI's. Never wait on CI.
Measure the routes you changed plus shared chrome, narrowest width first; overflow at 360 or 390 is a blocker.
One light/dark picture pair per screen (T2 pay screen: every drawn state).
Step budget {{T0 25 | T1 90 +30 per extra task | T2 130 +40}}. At the budget, finish, push your branch, hand back what remains.
Hand-back, 10 lines: claims one per line, each testable; the numbers you measured; what was NOT run and why;
branch and head shas; confirm no process of yours is still listening (ss -ltnp on your ports).
```

## Verify brief

```
Tier {{T1|T2}}. You verify {{bundle}}. You built none of it and change no product code.
Builder's claims, read as one list (test them, do not trust them): {{claims, one per line}}.
Compare with {{base_ref}}: a failure also there is pre-existing; report it apart (one users hit gets its own small fix).
Attack, do not re-run the builder's suite: the exact cases in the brief, a wrong role, double submit,
old-shape input, empty and error states, 360 and 390 px width. Run only affected specs; never wait on CI (the lead reads it).
T2 adds the money attacks (twice, double tap, wrong PIN, short balance, webhook replay, reversal), every drawn state of a pay screen, a local stack.
Own worktree, ports and bundler cache {{...}}; stop what you start by PID.
Hand-back, 20 lines or fewer: verdict `merge` or `fix`; findings by severity (blocker, high, medium, low); claims tested;
what was NOT run and why. Blocker, high and medium need a round; low goes to the sweep list. A re-check covers named ids only (~15 steps).
Budget {{T1 35 +10 per extra task | T2 90 +20}} steps.
```

T0 has no verifier: the lead reads the diff and the test line.
