VERIFIER W4 | TIER T2 full, measured in a browser on a real API stack | Budget 110 steps. Machine: 4 CPUs, 15 GB; a heavy
job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W4.md.
Under test: /home/user/Firstwish-web local branch `w4-maker1` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w4-maker1 (web) and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w4-maker1-api (API); stack prefix vw4; ports 5320-5339; verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w4-maker1/ (pictures in shots/).
Besides the common list, attack:
 - One draft per start: 10 fast taps on the first screen make ONE draft on the server (count rows); every step's answer
   is in the server's row after it is given (read the row after each step); nothing about the draft in any browser store.
 - Resume: reload at each of the eight steps, open the link in a second profile signed in as the same person, and come
   back from Wishes: same draft, same step, same answers; the back button never loses a saved answer.
 - Conflict: two tabs on one draft answer the same step differently: the second save shows the server's words and the
   draft's true state, never a silent overwrite; a save while the API is stopped shows could-not-save and a retry that
   lands once when it is back; going on waits for the save.
 - Choices come from the server: change a reference value through the API (or compare with the reference read) and see
   it on the step; a value the server refuses (send one by editing the request) shows on its field.
 - Before sign-in: /sign-in?next=/app/new&kind=<kind>&style=<style> ends in a draft holding that kind and style.
 - Another person's draft id and a removed draft's link: the designed state, no data. The later steps (cover onward,
   not wired yet): opening one from this draft does not crash and does not write identity or the draft to a browser
   store beyond what the baseline already lists for W5/W6 (print the keys you see and compare with the base branch).
