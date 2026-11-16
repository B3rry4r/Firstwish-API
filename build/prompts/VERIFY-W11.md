VERIFIER W11 | TIER T2 full, measured in a browser on a real API stack | Budget 110 steps. Machine: 4 CPUs, 15 GB; a heavy
job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W11.md.
Under test: /home/user/Firstwish-web local branch `w11-staff1` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w11-staff1 (web) and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w11-staff1-api (API); stack prefix vw11; ports 5340-5359; verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w11-staff1/ (pictures in shots/).
Besides the common list, attack:
 - Sessions apart: a person's session cannot open any /admin screen or /v1/admin route (try each of the six); a staff
   session is not a person's; staff sign-out ends the server session (old token 401); the staff token is in no store.
 - Roles: for each staff role the contract has, each screen and each write in the bundle: a table role x action ->
   status and what the screen drew; a control the role cannot use is not drawn; a direct link shows the designed refusal.
 - Team: remove the last owner, demote yourself, invite an existing email, invite twice fast, two staff changing one
   member at once: the server's words each time; rows read back.
 - Numbers and Overview: every figure equals the server's (compare five figures with the API's answers, kobo exact);
   a target set on the screen is in the row and survives a reload; a period with nothing shows the empty state; no
   sample series anywhere (grep and look).
 - Settings: each key saved and read back from the API; the storage setting is read-only (FB3); a provider's state is
   the server's ping, not a guess; a value staff set survives a re-seed of the stack (HE1).
 - Audit: the actions you just took appear with who and when; filters and paging give what the API gives.
