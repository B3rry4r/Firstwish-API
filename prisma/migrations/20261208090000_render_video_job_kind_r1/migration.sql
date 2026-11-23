-- R1: a video render needs more than the 60 seconds every job kind gets: the render-video kind runs up to 20 minutes (EE1 reads this row;
-- RENDER_TIME_LIMIT_SECONDS sets it at boot when the environment names another figure). Data only: no column or table changes.
INSERT INTO "job_kind_config" ("id", "kind", "timeLimitSeconds")
VALUES (gen_random_uuid(), 'render-video', 1200)
ON CONFLICT ("kind") DO NOTHING;
