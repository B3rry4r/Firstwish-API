BUILDER T0 | CI: the drift step, with a baseline | Budget 30 steps. Machine: 4 CPUs, 15 GB.
Read /home/user/Firstwish-API/build/common-rules.md and .github/workflows/ci.yml.
The fact: the CI step "No drift between migrations and schema" (`prisma migrate diff --from-url ... --to-schema-datamodel
prisma/schema.prisma --exit-code`) has failed since wave 3 because bundles add tables by raw SQL that have no Prisma model yet
(they become models at the next shared base, rulings OO4, QQ6, WW4, XX4, YY3, CA2). The failure also skips the seed and the
full test run. The lead owns the baseline; you write the check.
Work: local branch `t0-ci-drift` from claude/sleepy-mayer-f0hkb8 (its head) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/t0-ci-drift
(`npm ci`); TEST_DB_PREFIX=t0drift; your own database for the check (see scripts/db.mjs).
 1. scripts/check-drift.mjs: migrate a fresh database, run `prisma migrate diff --from-url <db> --to-schema-datamodel
    prisma/schema.prisma --script`, and read the statements. Allowed: only DROP TABLE (and the drops of their own indexes,
    constraints, sequences and enum types used by nothing else) for tables named in build/baselines/drift-tables.txt. Anything
    else (a changed column, a missing index on a modelled table, a table not in the baseline) fails with the statement
    printed. A table in the baseline that no longer drifts also fails ("remove it from the baseline"), so the list only shrinks.
 2. build/baselines/drift-tables.txt: one line per table: name | the migration that made it | "model at the next shared base
    (INT-5)" | owner: lead. Fill it from what the check finds on this head; list the tables in your hand-back.
 3. ci.yml: the drift step runs `node scripts/check-drift.mjs`; nothing else in the workflow changes. Add the same command
    to the README's checks list if it has one.
 4. If the check finds drift that is NOT a raw-SQL table (a real mismatch), do not baseline it: HALT AND REPORT the statements.
Checks (quiet logs, EXIT lines): the new script on this head (EXIT 0 with the baseline, EXIT 1 with one line removed, EXIT 1
with a made-up line added), lint on the script, gates.sh. Commit on t0-ci-drift; do not push; remove your worktree and
database. Hand back in 8 lines: the head, the baseline's tables, EXIT lines, any real mismatch.
