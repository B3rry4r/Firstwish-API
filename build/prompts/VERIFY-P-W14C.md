VERIFIER P-W14C | TIER T1, lean | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; notes to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/p-w14c/NOTES.md; stop only PIDs you started.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and P-W14C.md (same folder: items 1-5 are the contract, plus item 6: the
Thread screen sends `expectedAssignee` and says the server's 409 thread_changed_hands in words, showing the new
holder; plus: the header column sort on the Support and Concierge lists must still be there and work as on the
base).
Under test: /home/user/Firstwish-web local branch `p-w14c` (the head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pw14c (`npm ci`) and an API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pw14c-api at the API
commit in your spawn line; ports 5500-5519; stack prefix vpw14c; BUILT. Probes under the verify folder.
In a real browser at 360 first, as owner and as support:
 1. A 300-character unbroken word in the search of every staff list (styles, wishes, support, concierge, people,
    businesses, payments): no side scroll at 360, 390, 1440; what each screen says.
 2. The Support and Concierge placeholders are whole at 360.
 3. Search word, filter chips, "mine" and the page are in the address: Back from a thread or an order, Forward and
    a reload give the same list and page; a pasted address opens the same list; nothing in browser storage (R10);
    the header column sort is there and sorts as on the base (compare with the base build or its source), also
    after Back; any other staff list that shares the Table (wishes, people, payments, team) behaves as on the base
    (sort and paging: one check each).
 4. The order's wishes read failed (500, offline): error words and Try again, not the empty words.
 5. The search field takes at most 100 characters; the request and the echo carry the same 100.
 6. Two staff on one thread: A opens the hand-over sheet, B hands the thread to someone, A confirms: A sees words
    that someone else took it and the new holder; the server row is B's choice. A hand-over with nothing changed
    still works. A removed member: still refused in words.
 Then: typecheck, gates (no new entry; baseline, wired.json, tsconfig.json equal the head's), test:client,
 check:css, build exit 0; w14b.mjs and w14.mjs alone: totals (do NOT run the whole driver: the harness is being
 fixed by another agent).
Write VERDICT.md in the verify folder (25 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees, stack and databases. Hand back ONCE in 12 lines or fewer.
