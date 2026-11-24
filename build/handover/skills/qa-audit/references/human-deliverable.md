# The human-facing deliverable

Every visual defect ever found in this project's redesign - tofu-box glyphs
from a missing font, a double period, a screen rendering completely blank,
hazard-stripe overflow on the order-confirmation screen - was found by a human
looking at a picture. None of it was caught by an assertion. This deliverable
exists to put pictures in front of a person as efficiently as possible; a
table of pass/fail booleans is not that, no matter how complete.

Load the `artifact-design` skill before building the page - this instruction
does not substitute for it, it only says what the page must contain once
designed. When the reader is the product owner, the page is visual and in the
product's own design system: a bar for "17 of 56 compared", a board of the
unverified screens, a severity chip per finding, short labels, no paragraphs.
(Owner rule, 9 Oct 2026: an ugly or text-heavy progress page is a defect.)

## Contents, in this order

**1. Header: independence and scope.** One line confirming Phase 0's check
(who audited, confirmation nothing in scope was self-built), and one line
stating the coverage denominator with its source - "N screens: M from the
route table, M′ from the design canvas, M″ from the rulings sheet, reconciled
to N" - never a bare number with no stated source.

**2. The compared count, as its own headline.** "17 of 56 screens compared to
their design." This is the single most important number on the page and it is
NOT the coverage denominator above - coverage says something exists to check,
this says somebody checked it (SKILL.md law 4). When the two are far apart, say
so in the same breath, because that gap bounds what everything below is worth:
a report that leads with "56 covered" while 39 were never opened has told the
reader the opposite of the truth, and that is precisely how an entire unbuilt
tab survived four waves and a full audit.

**3. The `unverified` screens, listed by name.** Not a count - names. The
reader is looking for whether the screen they care about is in it, and a count
cannot answer that. Put it here, above the findings, not in an appendix.

**4. Coverage gaps, before any cosmetic finding.** The reconciliation
table's `needs-ruling` and `covered-but-unrendered` rows, and the flow-driving
pass's `unreachable` rows - each with its mechanical reason. This section
leads even when it contains no defects of its own, because an honest "we
could not check this" is more valuable up top than buried after forty
screenshots of things that were fine. The actual 2026-08 conformance audit's
own structure is the model: its "five worst things" list opened with the
uncovered buy/sell journey, not with the two real defects found in screens
that *were* covered.

**5. Renders grouped by flow**, not by screen-alphabetical order - a reviewer
thinking "does buy work" should see the whole buy journey in one scroll.
Within a flow, light and dark side by side. Each capture is captioned with:

- the design element/artboard id it should match (or "no design source -
  judged for internal consistency" if none exists),
- the specific capability the pass asserted for it ("a user can review a buy
  order and is asked for their passcode" - never "renders correctly"),
- the verdict (`match` / `defect` / `divergence-with-reason` + citation /
  `unclear`).

**6. Findings, ranked worst-first**, each with: kind and severity (blocker, high,
medium, low), owning file, a
one-line description in the same voice as the evidence beside it, and for
`divergence-with-reason`, the exact ruling id. Do not alphabetize or group by
file - rank by what the defect costs a real user or the business, the way the
conformance audit put "the entire revenue-generating flow has never been
looked at" above "a swapped button order" above "an extra icon that might be
intentional."

**7. Release-artifact check result**, explicitly, including "NOT RUN -
[reason]" if that's what happened. This row must be visually as prominent as
a pass, never smaller text at the bottom - the reason release checks get
skipped is exactly that they're easy to de-emphasize.

**8. "Could not verify this here, and why"**, collected as its own labeled
section - not scattered as asides inside other sections, not omitted. Every
row here is a legitimate, complete result. Example from this project: a legal
disclaimer's rendered body reads as placeholder copy rather than real
statutory text, but the *mechanism* (scroll-gating, live fetch from the
backend's legal-document endpoint) checks out from the code - the honest
verdict is "needs checking against the real backend's seeded content, not
against this screenshot," not a guess in either direction.

## What not to do

- Do not present a single aggregate "N/M passed" number without the gap
  section immediately above or below it - an aggregate score is exactly the
  shape of thing that let "75 screens, 0 unrenderable" read as complete.
- Do not let a `divergence-with-reason` verdict appear without its citation
  visible in the same caption - a reader should never have to go find the
  rulings file to know whether a difference was decided or missed.
- Do not bury the worst finding under a chronological or alphabetical
  ordering. Worst-first, every time.
