PATCH P-W3 | TIER T2 | Budget 110 steps. Close the verifier's findings on bundle W3; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules; how to wire, measure, check), /home/user/Firstwish-API/build/prompts/W3.md, rulings
HO4, HO5, HO6 in /home/user/Firstwish-API/build/rulings-phase3.md, and the verifier's files /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w3-app/VERDICT.md and
ui-align.txt (the six NOT DONE ids and the partly done one are cases here).
Work: branch `w3-app` (d4d8168) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w3 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w3 w3-app`). FIRST merge the web branch head (commit in your spawn line; it now holds W4, the maker
on the server, and W11) into w3-app with a merge commit (no rebase); resolve conflicts keeping both sides' work (W4 owns
app/app/new and lib/maker.ts and lib/draft.ts; W3 owns lib/account.ts: where the maker still needs a name you removed,
keep the smallest thing that makes both work and say so); `npm ci`. API for your stack: a detached worktree at the
commit in your spawn line, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w3-api; ports 5240-5259; stack prefix pw3.
 F1 (high, HO4) Home: bring back, wired to the server, every control the base Home had that the API serves: react
    (PUT/DELETE /v1/feed/wishes/:id/reaction), save, share (POST .../shares and the link), the creator (GET
    /v1/creators/:handle) and follow, open and play; the list is /v1/showing. Look at the base's Home (git show of the
    base commit c223c96: Feed, Cards, Rail, Aside) for the design. For each base part with NO server read (stories, a
    Following tab, creators to follow: check the registry with show.py first) do not draw it and list it under
    REQUESTS with the endpoint it would need. Each control: one request per tap, the server's answer shown, signed out
    or refused shows the server's words.
 F2 (high) Continue and Change it open the maker at /app/new?id=<id>: with W4 merged the maker reads the server's
    draft: prove a draft made on Wishes' side opens in the maker at its step, and that a sealed wish's "Change it" does
    what the server allows (if a sealed wish cannot be changed, the control is not drawn).
 F3 (HO5) Removing a draft asks first (the app's own sheet), then goes to Wishes; a failed or left payment shows the
    server's reason where the payment read gives one; Wake: one request for a double tap.
 F4 (HO6) lib/person.ts: every shape the contract has is imported from lib/contracts (PaginatedList and the rest);
    where the contract is wrong keep ONE named cast with a comment naming the API request (list them under REQUESTS:
    the link read answers {link, slug}; Wish.content is an object; Wish.no nullable; state values).
 F5 Wish cards and detail show a picture when the server gives one for the owner; if the owner's wish read gives no
    signed url (only photoId), do NOT call the public link read for it: list the API request and keep the mark.
 F6 (low, same files) No call to GET /wishes/:id/video unless the wish read says a video exists or was asked for (no
    console error on a plain live wish); Home does not offer a paid wake while a Pass is live; a resting wish draws
    Video only when the server allows it.
Measure and check as P6-COMMON says (your measure file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w3-measure.txt, pictures
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w3-pics/: Home light and dark at 360 with a wish reacted, saved and followed; the remove sheet; a
failed payment's words). Commit on w3-app; do not push; do not commit .pipeline-ui/wired.json or the baseline; remove
your worktrees, stack and databases. Hand back ONCE in 12 lines: head; F1-F6 closed or not with file:line and what you
saw; the seven ui-align ids; stale baseline ids; REQUESTS; NOT RUN.
