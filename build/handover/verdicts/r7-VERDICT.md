# VERDICT R7 (check; API 5ce4192, code of 09b1c54; run on the stand-in stack, real HTTP routes)

R7 DONE (nothing to build), with two LOWS to log. No high, no medium.

Cases (scratch spec kept at build/verify/r7/vr7.spec.ts.txt; typecheck EXIT 0; `npm test -- src/modules/render-jobs src/modules/wishes` 29 suites, 245 tests pass):
1 PASS (one gap, L1). Finished video, then POST /wishes/:id/erase 204: render file row and object gone after the upload-cleanup job
  (before: 1 file, object present; after: 0 files, object gone), GET video 404 "Not found.", POST video 404, the old address no longer serves.
  Second run of the job: ran 0, nothing changed.
2 PASS (one gap, L2). Refund SENT: GET video 404 "Not found."; POST video 402 payment_required "This wish needs the portrait video. Get it to make
  the video."; same after refund.processed (adds empty). Refund during a render (twice now, R6 once): run ends failed, outputFileId null,
  0 files stored before and after, abort seen, GET 404.
3 PASS. Owner 200 with a 600 s address; other account 404 (GET and POST); signed out 401; at +601 s and +1 h the address is refused (404) and the
  owner gets a fresh one. The address is a signed bearer link: whoever holds the text can fetch it for its 10 minutes (the file host checks the
  signature, not the account); the other account cannot get one. Same as every signed read here. Passcode wish: wish read says hasPasscode;
  web components/app/life/sheets.tsx:91 shows "This video shows your wish without its passcode." (read in the code, web not built or run).
4 PASS. /v1/w/<slug>, unlock, opens, reaction, keep, render/<token>/wish, showing: no file id, object key, signature or downloadUrl in any body.
5 PASS. Account erase with one finished video and one render in flight: the in-flight run ends failed with no file; after the erase-files job
  (eraseFilesOf, file-jobs.ts:287) 0 files and 0 objects of the account remain; nothing written after (waited 400 ms).

L1 (low) RenderJob rows are not deleted on a wish or account erase, only outputFileId is nulled (file-jobs.ts:319 and :403 in
  wish-lifecycle.service.ts; no renderJob delete anywhere). The row (status, wishId, kind, size, failure words; no letter text, token hash cleared)
  stays. RENDERER-PLAN section 3 and the R7 row say "and the RenderJob row". Holds no wish content; owner to rule keep or delete.
L2 (low) A refunded video's file is never removed: it stays stored and the row stays "done" until the wish or account is erased; an address
  given before the refund still serves for up to 10 minutes (sent and processed). API gives no read or ask meanwhile (IK4a met).
Not run: web build, real Chromium (no case needed a real file), passcode ask screen in a browser.
Cleaned: worktree removed, no processes left, test databases dropped by the runner.
