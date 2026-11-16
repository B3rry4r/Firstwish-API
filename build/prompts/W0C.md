BUILDER W0c | TIER T1 | The owner's rules that the live site breaks today: native browser controls, two words, three controls that do nothing, the home page too wide on a small phone. No data wiring.
Budget 150 steps. Machine: 4 CPUs, 15 GB; heavy agent (a browser): a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-web/AGENTS.md, /home/user/Firstwish-web/.pipeline-ui/invariants.md and surface-map.json, and
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/frontend-surface-build/SKILL.md (Core laws; Phase 5 Measure; references/measurement.md).
Owner's words: > no native browser controls > no dead controls > Portrait and Landscape (never "sideways") > no emojis.
Work: the WEB repo /home/user/Firstwish-web, local branch `w0c-rules` from claude/sleepy-mayer-f0hkb8 in your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w0c-rules
(`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; ports 5140-5159. Do NOT edit scripts/gates/baseline.json (the lead
removes the entries your work clears: list them).
The findings (`npm run gates` lists them as ACCEPTED with their lines): product_invariants [R-native] at app/app/pro/brand
(2 colour inputs), pro/people (2 dates, a datalist), pro/reveal/new (select, date, datalist), pro/vault (date, datalist),
pro/wishes (select, date), components/app/AuthFlow.tsx (select), Welcome.tsx (date), life/DateForm.tsx (date),
maker/Maker.tsx (date), maker/Seal.tsx (date, time), app/lab (selects, a range); [R-words] "sideways" in lib/studio.ts:265,
:270 and app/lab; [R-emoji] lib/account.ts:137; dead_controls at components/app/maker/Ways.tsx:174 and
components/app/studio/layout/mount.tsx:62-63; and the live driver's overflow on / at 360 (div.sign 365px in a 328px wrap,
styles/cinema.css:364).
Cases:
 1. One family of the app's own controls for a date, a time, a choice from a list, a list with typing (the datalist's job),
    a colour and a range: look first for what the repo already has (the staff screens under components/admin have their own
    pickers: reuse or lift them into a shared place, never a second copy: law 3). Each works by touch and by keyboard
    (arrow keys, Enter, Escape, Tab order), has a visible hover, focus and disabled state (measured), fits a 360 px screen,
    uses the design tokens, and gives the same value shape the page used before (yyyy-mm-dd, hh:mm, the option's value).
 2. Every native control above is replaced by it; behaviour and layout otherwise unchanged; the gate shows 0 [R-native].
 3. "sideways" becomes Landscape (and Portrait where the pair is named); the emoji goes; no other copy changes.
 4. The three handlers: read what each is for. A control a person can use must do its job; a callback slot that no control
    reaches is not a control: then make that plain in code so the gate is right, never an empty handler behind a button.
 5. No public route is wider than the screen at 360 and 390 (`documentElement.scrollWidth <= innerWidth`): fix the home
    page's sign and measure all 15 website routes plus the app shell routes you touched.
Measure in a real browser (Playwright is on this machine) and write numbers, not adjectives, to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w0c-measure.txt: per
changed screen at 360x740, 390x844 and 1440x900: scrollWidth against innerWidth, console errors (0), each new control's
hover and focus contrast against its surface, keyboard walk result; one light and one dark picture per changed screen at
360 into /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/shots/.
Checks (quiet logs, EXIT lines): typecheck, lint, check:css, `npm run gates` (exit 0; list the baseline entries that are now
stale), `npm run build` (restore tsconfig.json after). Commit on w0c-rules; do not push; remove your worktree. Hand back in
12 lines of claims (one per line, each testable), the stale baseline entries by where, and what was NOT measured and why.
