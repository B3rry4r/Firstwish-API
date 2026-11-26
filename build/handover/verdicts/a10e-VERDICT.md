# VERDICT API-10E / WEB-10E: MERGE (no HIGH found)
Heads: API a10e b4b544c, web w10e e9c49e4. Own worktrees, own stack va10e (5500/5501, built), 2400 px JPEGs with EXIF and GPS.
Passed: API typecheck, WHOLE lint, scripts/gates.sh, check-contracts/drift/routes (0 mismatch); 349 of 349 specs in the touched modules.
Web: tsc, gates (0 fail), test:client 12/12, lint 770 warnings 0 errors (<=863), build; no tsconfig/gates/baseline file in either diff.
1 Registry: no id, name or field removed; only added fields. DEC-330 and DEC-331 present.
2 Access: signed-out 401, other account 403, wrong code 404; each changed read keeps its old Reader (signedPhoto = signedRead + sizes,
  signed-urls.service.ts:108-124); sizes share the full copy's expiresAt; a tampered size signature gives 404.
3 Bytes: w320 (vault), w1600 (shoot), w768 (reveal), w768 (me), w320 (logo): 0 EXIF tags, 0 GPS, no camera serial.
4 Stack, 390@2x and 1440@1x: shoot 4 of 4 at w320 (0 full); reveal 3 of 3 at w1600 (stage size); brand logo w320; 0 broken; no overflow.
5 An mp4 in the Vault carries no variants.
Findings:
 LOW .pipeline/registry.json: Shoot.files/proofs/finals and Account.picture type text went from "array"/"object" to a shape (typeBy DEC-330);
   Report.heldPhoto typeBy DEC-226 to DEC-330. A tightening, no field lost; the brief said "no type changed": lead to accept.
 INFO the stack's stand-in image-sizes does not clean (standins.ts:389, unchanged by a10e): the FULL copy keeps EXIF/GPS on this stack, so
   IM1's real clean copy is not proved here (needs SharpImageSizes). Sizes are clean either way.
NOT RUN: moderation heldPhoto, /showing, /play-wishes/:id files, concierge order files, Studio style files on the real stack (specs and diff
  only); no screen draws the creator or Me picture (creators read gives imgVariants by API); base-vs-head access run (read from code);
  reconcile twice (log only).
