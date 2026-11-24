# Scars: the stories behind each law

SKILL.md keeps one clause per law. These are the observed failures that wrote them. Read a
story when you doubt a law or need an example for a report; you do not need them to run the audit.

## Redesign audit (Aug 2026, a finance app)

1. **No agent audits its own work.** Every "matches the artboard, element-by-element" claim
   in the redesign came from the agent that had just written that screen. The owner found ten
   defects the pipeline had missed within an hour of opening the app.
2. **Assert capability, never the absence of errors.** "No `KErrorView` is present on any
   surface" passed while a sign-up field was dead, transactions asked for no PIN, and a
   release build could not reach the network at all.
3. **Coverage from outside the code.** 34 buy/sell/add-money/withdraw artboards, a third of
   the product, were never in any screenshot harness's denominator. "75 screens, 0
   unrenderable" said nothing about their absence because they are modal sheets, not routes.
4. **A pairing is not a verification.** An inventory paired 47 of 56 artboards to screens
   and reported the product "covered". Conformance had been checked on 17; the other 39
   were paired and assumed. An entire tab (eight artboards, one never built at all) passed
   through four waves and a full audit because it was mapped. The number said covered,
   nobody asked what covered meant, and the owner found it by opening the app.
5. **Pictures against pictures.** Nobody rendered the canvas for the whole life of the
   project. When it was finally rendered, the very first artboard showed each row as a card
   with a tinted icon plate and a chevron, where the built screen had plain rows. Four waves
   of careful source-reading had not surfaced it.
6. **A citation is not evidence.** `navigation.dart` opened with a comment citing artboard
   `#s22`. Someone had read it for the tab list and never checked the container: a floating
   pill with a shadow where the design draws a flat bar with a top hairline. The citation
   told every later reader the screen was verified, so the missing hairline shipped.
7. **Enumerate what you could not reach.** A withdrawal branch is chosen by the real
   `DateTime.now().weekday` with no injectable clock, so which of two designed sheets is
   reachable depends on the day the audit runs. Recorded as unreachable with that exact
   mechanism, rather than capturing whichever branch the day hit and calling it complete.
8. **Flow scenarios, not screen checks.** A ruling to move a KYC step earlier was reported
   done. Half the wiring had landed. It survived four waves because every agent read the
   route table instead of following the path.
9. **States behind interaction.** The Order Book tab and the whole buy/sell/add-money/withdraw
   journey were unreachable by any route-walk: none are routes, they exist behind a tap or a
   `showKSheet` call.
10. **False captures.** (See the WMT section for the second kind, a build pointing at another
    agent's ports.)
11. **Severity respects recorded decisions.** A follow-up audit found 9 of 11 apparent
    divergences in one area were already-ruled, filed decisions. Reporting them as bugs would
    have spent the owner's hour re-litigating settled things and trained them to distrust
    the report. A circle shipped where the design specified an oval, defended by a code
    comment that turned out to be false: check the rulings file, not the comment.
12. **Only the real thing proves the seam.** A live-gate assertion a mock adapter is
    structurally incapable of producing (a real seeded account's first name, a real holding,
    a pending-KYC banner) passed, while the same mock answered a shape it did not recognise
    with a plausible, wrong, silently passing object.
13. **Release-on-device.** `android.permission.INTERNET` was declared only in the debug and
    profile manifests (Flutter's template default), so every release APK was denied every
    socket by the OS. Two releases shipped that way. 29 tests, 188 screenshots, nine gates and
    a passing live gate all missed it, because each runs in debug or on web.
14. **A number or promise with no writer.** A hardcoded chart for one ticker while every other
    ticker was live; a screen promising a 24-hour security hold no backend mechanism implements.

## Task-check mode (WMT build, 1 to 15 Oct 2026, four repos, 126 agent runs)

- **Cost is steps x context.** About $0.04 a step under 100 steps, $0.10 at 300+; 66% of spend
  was re-reading old command output. A lean verifier cost $1 to $5 (median $13); a 300-step
  audit about $30. A lean brief (exact cases, a file map, a step budget) took a full
  payment-path task, two builds and two verifies, to $28 against $93 to $201 for comparable tasks.
- **Fix rounds:** round 1 was 50% of the spend, round 2 22%, round 3 11%, rounds 4 to 6 17%;
  round 3 onward mostly fixed lows and test gaps. Hence severity decides rounds.
- **What independent verifiers caught before anything went live:** two blockers (two deletes at
  the same instant freed extra places; erasing an account left its phone marked verified), a
  high (a phone number released before it was proven), mediums (a double charge when a read
  failed between charge and record; a provider webhook ignoring the amount of the charge it
  reported).
- **The one user-facing bug that went live** came from a payment page merged without a
  verifier "for speed": it ran 13 px past the screen on every phone for about 2 days.
- **Three deploys were stopped by the full suite**, which ran only after merge (a contract spec
  on a kobo field, a real regex stack overflow, an undeclared rate-limit entry). Live stayed on
  the old build; each needed a hotfix and blocked other merges. Hence: read the pushed head's CI.
- **Gates already failed on main** (16 FAIL lines). The check is the same FAIL lines as main.
- **A capture from another agent's ports:** a shared bundler cache baked one agent's API ports
  into another's web export, so pictures came from the wrong backend. Own cache dir, grep the
  bundle for `localhost:`.
- **UI shown to roles that cannot use it** (create and edit controls for a read-only admin) is
  a dead control.
- **Builder self-reports are claims to test.** A verifier brief lists them and says "test, do
  not trust".
