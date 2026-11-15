Admin screens: an addition to /home/user/Firstwish-API/build/prompts/EXTRACT.md. Read that file first and follow it, with these changes.
- The admin screens are not in .pipeline/scan-map.json. For each of your screens FIRST write its scan-map entry to
  /home/user/Firstwish-API/.pipeline/scan-map-admin/<screen_id>.json, in the same shape as an existing entry (print one:
  `python3 -c "import json;print(json.dumps(json.load(open('/home/user/Firstwish-API/.pipeline/scan-map.json'))['screens'][40],indent=1))"`),
  with area "admin" and dataProvenance as the code shows (a seam file returning marked sample data from fixtures held in memory).
- Your screens' files: the route under /home/user/Firstwish-web/app/admin/<section>/**, its components under components/admin/**
  (find them from the route's imports), and the seam they call: lib/admin-api.ts, lib/admin-types.ts, lib/admin-fixtures.ts,
  lib/admin/<letter>-api.ts, <letter>-types.ts, <letter>-fixtures.ts. Read only the functions and types your screens use.
- Each seam function's header comment names the request it will make under /v1/admin. Record it word for word in that action's or
  read's `evidence` (it is as-built evidence, not your design). Still describe needs as entities and fields.
- authContext: staff, with the staff role(s) the code or the Team section's role table says may open the screen (owner, ops, moderator,
  reviewer, support, finance, maker). Every action carries a `reason` string: record it in the payload.
- Money in the admin code is naira numbers or "₦" text; record as written. Every sample figure is fixture data: say so.
- Fragment ids: admin-<section> (and admin-<section>-detail for a detail route). stubsObserved: the in-memory seam itself is one stub per
  screen ("sample data until /v1/admin exists"); list anything beyond that.
Hand back in at most 8 lines, as EXTRACT.md says.
