VERIFIER W14 | TIER T2 full (staff identity, emails to customers, Concierge money links), measured in a browser on a real API stack | Budget 120 steps.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W14.md; rulings A9,
HG1, HP1, HX5, R10, R11 in /home/user/Firstwish-API/build/rulings.md and rulings-phase3.md; the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w14-staff4-claims.txt.
Under test: /home/user/Firstwish-web local branch `w14-staff4` (head in your spawn line; base c3c29e6). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w14 (web) and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w14-api (API at the commit in your spawn line); stack prefix vw14; ports 5500-5519; the stack BUILT
(`npm run live:up -- --built`); verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w14-staff4/ (pictures in shots/). Run every command
with your own worktree as the working directory. Two other browser stacks share the machine: rerun a failed step
once alone before you call it.
Besides the common list, attack:
 - Drawn against built: open the design's staff screens for these six (the design source P6-COMMON names) and list
   every control the DESIGN draws that this branch does not (the builder names: refuse a submission, the Concierge
   quote, saved-reply add/edit/delete, a Concierge search, "Hand to someone" for a support member): for each, is
   there a server route (then it is owed: MEDIUM), or none (then say so: the lead rules)? And the reverse: any
   control drawn that does nothing.
 - Who: each of owner, moderator, finance, support, ops on every read and write of the six screens, from the screen
   (is the control drawn?) and by direct call: the screen offers exactly what the server allows (the session read's
   actions, HX5); a support member with no hand-over offered: can they still be handed a thread and work it?
 - Emails to customers (R11): a support reply and a template edit: the email in the stand-in outbox is the server's
   template with the staff member's words, goes to the thread's customer only, and a template with an unknown
   variable can never be saved or sent; resend never offered for a sign-in code (try by direct call too); an edited
   receipt template is what the next settled payment sends.
 - Two staff: one thread (both replies kept, order right), one submission (second decision refused in words), one
   Concierge order (give by A while B gives to another maker: 409 order_changed, the screen shows the order as it
   now is); a maker opening another maker's order by address.
 - Styles: a level moved on a style with live wishes: what changes for a buyer mid-draft (the server's rule) and
   that the screen says nothing false; a creator's style offered only the levels the server allows; switch off a
   style that wishes use.
 - Concierge: the "Payments and refunds" link lands where a refund can really be made for THAT order (the builder
   says the wire has no payment reference): how many taps and can staff refund the wrong payment by mistake?
   Delivery by typed wish ids: a wrong id, another buyer's wish id, an id of a wish not in the order.
 - What it deleted: grep the whole web tree for any import of the deleted staff seam and fixture files; every
   OTHER staff screen (the 17 wired earlier) still opens and reads (walk them once, console errors 0).
 - R10: storage as the page sees it after every screen; the builder's ui-align lines: check all 8 it marks done.
 - The flow scripts/live/flows/w14.mjs alone: 0 FAIL; typecheck, gates, test:client EXIT 0.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove your worktrees, stack and databases; leave no background jobs.
