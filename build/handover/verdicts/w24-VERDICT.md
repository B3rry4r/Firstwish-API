W24 verdict: MERGE (T1). Head 27ffd4e on 82315b7; API 1878592; stack vw24 (5760/5761) built.
1. Sheet X, 3 sheets (video on sealed wish, Delete, Your spaces), light+dark, 360+390: rest has no ground; hover = line-2 bg (1.94:1 light, 1.85:1 dark vs sheet ground), icon 8.7/10.4:1; active = ink bg (16.9/19.3:1). Box identical in all states; no side scroll.
2. .fl-rows focus-visible by Tab: 2px accent outline + card bg + ink icon on 4 rows (video, Delete on the wish page; People and dates, Pass on /app/you), light+dark, 360+390; row w/h unchanged (328x68), no overflow.
3. check:css pass; gates 0 fail/0 warn (289 accepted, none new); build exit 0; diff = styles/app.css and styles/app-life.css only; tokens only, no raw colour.
NOT run: tsc, lint (outside brief); "Publish to Now Showing" row/sheet (not shown for the seeded wish); active state of rows; real-device touch.
Evidence: build/verify/w24/m.mjs, m2.out. Stack stopped by PID; worktrees removed.
