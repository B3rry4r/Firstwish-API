# Sweep list: API (lows; drained in one sweep bundle, never a fix round)
- .pipeline/env-manifest.json: add NODE_ENV, PORT, PROVIDERS, INTERNAL_TOKEN; then move INTERNAL_TOKEN from RUNTIME_VARS to MANIFEST_VARS in src/common/env/env.schema.ts and revert the runtime list in env.spec (from Patch API-0 round 1).
- 422 field errors and the 500 no-leak filter are proven only by specs until the first DTO route exists: the first Phase 5 module's verifier proves both live (Verify API-0, low).
- Schema (Verify round 2, low): an account hard delete is still possible at the database (payments SET NULL): the erase path (B02) only blanks; add a trigger refusing DELETE on account once B02 lands.
- Schema (low): NumbersTarget.setBy is a plain string with no foreign key (an earlier spec stores a target with no staff row): give it the FK and fix that spec in B21.
- Schema: *FileId columns are not linked to stored_file: B09 (Files) adds the foreign keys in its own migration.
- Audit (Q9, verifier disputes keeping the IP): the audit helper (B03) stores the address cut to its network (IPv4 /24, IPv6 /48), never the full address.
