# Owner rulings (exact words, who, when). These outrank code comments.

R1 (owner, 15 Nov 2026): "front end Next.js, which is what it is currently. Back end Nest.js."
   Covers: the API is NestJS. Does not cover: the database or ORM (lead default: PostgreSQL + Prisma).
R2 (owner, 15 Nov 2026): "for the storage. If Cloudflare are to accept cards ... on the end of the month ... We'll be going with Cloudflare.
   Then if not, we are just going to use DigitalOcean for everything. DigitalOcean spaces, and probably have the Cloudflare integration
   for later when we want to probably switch ... pre-launch or on launch time, or even after launch"
   Covers: storage sits behind one interface with two adapters (Cloudflare R2, DigitalOcean Spaces), chosen by configuration; hosting on
   DigitalOcean unless told otherwise. Does not cover: which one is live on day one (owner decides at the end of November).
R3 (owner, 15 Nov 2026): "the front end is deployed on Vercel. Yeah, I just have to connect the domain name."
R4 (owner, 15 Nov 2026): "The admin dashboard, I've not seen what it looks like ... Please design the whole dashboard thing and let me see.
   Then proceed with the integration. Proceed with full build the backend."
   Covers: admin screens are designed and shown to the owner first; the backend build follows. Does not cover: what each admin screen
   holds (lead default from the documents' operations needs, build/tasks/ADM.md; owner may override).
R5 (owner, 15 Nov 2026): "App and web please" (asked which is right, the documents or the app and website).
   Covers: where documents and the app/website differ on a price, term, limit, name or rule, the app/website is the truth.
R6 (owner, 15 Nov 2026): "We can't call it done when it's just ... basically still UI."
   Covers: nothing is reported done until it works against the real backend. Front-end-only work is called "screen built".
R7 (owner, 13 Nov 2026): "Don't use fable agents ... a model that is not too expensive but can still get the job done and will not mess things up."
   Covers: builders and verifiers run on Opus or Sonnet, never Fable.
R8 (owner, standing): plain short words; say "kind" (never format, category, type) for kinds of wish; never "forever", "launch", "coming soon",
   "abroad", "diaspora" in customer copy; no emojis; no native browser controls; Portrait and Landscape (never "sideways"); orientation never
   tied to money; no dead controls; nothing faked: where a server will answer, an API-seam file; AI is never faked.
R9 (owner, 15 Nov 2026): "Use the Aisha copper" (brand accent #c8693a). "leave the preview videos quality as is". Levels table approved "for now",
   changeable in the admin dashboard.
