# Sweep list: API (lows; drained in one sweep bundle, never a fix round)
- .pipeline/env-manifest.json: add NODE_ENV, PORT, PROVIDERS, INTERNAL_TOKEN; then move INTERNAL_TOKEN from RUNTIME_VARS to MANIFEST_VARS in src/common/env/env.schema.ts and revert the runtime list in env.spec (from Patch API-0 round 1).
- 422 field errors and the 500 no-leak filter are proven only by specs until the first DTO route exists: the first Phase 5 module's verifier proves both live (Verify API-0, low).
