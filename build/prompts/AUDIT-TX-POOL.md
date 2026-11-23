AUDIT TX-POOL | TIER T1, text only (no server, no jest, no database, no npm ci) | Budget 60 steps. You change no src file. One output file.
Read /home/user/Firstwish-API/build/common-rules.md and the last entry of /home/user/Firstwish-API/build/sweeps/api.md (P-CI-6: the fault and its fix in
src/modules/support/support.service.ts assign and role-access.service.ts: a read on the connection POOL from inside an open
transaction that holds a row lock; twenty at once held every connection and the pool read timed out: 503).
Work read-only in /home/user/Firstwish-API at the head in your spawn line (do not switch its branch; do not make a worktree).
Task: find EVERY place in src (not tests) where code that runs INSIDE a `$transaction(async (tx) => ...)` callback (or
inside a function that is given a `tx` and called from one) reaches the database through the pool instead of `tx`:
`this.prisma.`, `this.db.`, an injected service's method that reads or writes with its own client and takes no
transaction argument, a helper that opens a second `$transaction`, a guard or a setting or price-book read, an
audit-log or outbox write, a queue add that writes a row. Follow calls two levels deep. There are about 166
`$transaction(` call sites in about 66 files: cover all of them; say so if you could not.
For each finding one row: file:line of the transaction; file:line of the pool call; what it reads or writes; does the
transaction hold a row lock or a `FOR UPDATE` before that call (yes, no, cannot tell); how many at once could meet it
(a public or webhook route, a signed-in person, staff only, a job); the fix in one line (pass `tx`, move the read
before the transaction, or leave: why). Rank: HIGH = holds a lock and is reachable by many at once (payment settle and
webhooks, ticket start, wish seal, refunds, payouts, group contributions, limited places); MEDIUM = holds a lock,
few at once; LOW = no lock held, or staff only.
Also list (separately, short): transactions with a network call inside (a provider, a queue, storage, email) and
transactions with no timeout set that do more than five statements.
Output: /home/user/Firstwish-API/build/tasks/TX-POOL-AUDIT.md, 150 lines or fewer: the count of call sites read, a table of findings by rank, then a
cut into fix bundles of 2 to 5 files each by module (money first), each with the specs that already cover it. Do not
commit; do not push. Hand back ONCE in 10 lines: counts by rank, the three worst with file:line, the bundles.
