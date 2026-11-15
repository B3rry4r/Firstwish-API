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
R10 (owner, 15 Nov 2026): "you kept on building it on the browser ... You don't just leave some things to be stored on the browser. Nothing should be
   stored on the browser. Follow the workflows, my workflows, properly and accurately."
   Covers: the web app keeps NOTHING in localStorage, sessionStorage or IndexedDB; every piece of data lives on the server. Phase 6 is not
   finished while one such call remains: a gate (exit code) fails the build on those words anywhere in app/, components/, lib/.
   Default (lead), owner may override: staying signed in uses one cookie the server sets and page code cannot read (httpOnly); the short
   access token lives in memory only; the light/dark choice is saved on the account and follows the device when signed out; a choice made
   before sign-in travels in the link. Does not cover: the browser's own cache of files (pictures, scripts, fonts).
R11 (owner, 15 Nov 2026): "we're not using SMS or WhatsApp providers for now. Their process is too messy, it's too long."
   Covers: every message Firstwish sends goes by email. Sign-in is a code to an email, or Google; a phone number is a plain detail, never
   verified, never the key of an account. The SMS and WhatsApp ports stay declared with no adapter ("deferred by owner").
   Consequence (named): a receiver gets the link because the sender shares it (share sheet, their own WhatsApp) or by email when the sender
   gives the receiver's email. Admin Support is an email inbox; WhatsApp is a plain link to the owner's number.
R12 (owner, 15 Nov 2026): "Email sending provider and domain. Yeah, so it's going to be resend."
   Covers: Resend is the email adapter. Does not cover: the sending address (default: a firstwish address on moxnafrica.com; needs DNS records the owner adds).
R13 (owner, 15 Nov 2026): "We're not using AI to, we're not selling audios to AI ... It's basically text to speech [speech turned to text by the device,
   as the Claude app and websites do]. Then the AI figures out what the user is saying accurately."
   Covers: speaking a letter uses the browser's own dictation; only the text goes to the AI; no audio is sent to any AI and no transcription
   provider is used. Default (lead): where a browser has no dictation, the person types. Does not cover: voices recorded to PLAY inside a
   wish; those are still kept as sound files in storage.
R14 (owner, 15 Nov 2026): "payout threshold for creators ... you have to suggest on that one. Suggest what is going to work properly."
   Default (lead), owner may override: ₦5,000. Paid on the 5th of each month for what was earned up to the end of the month before; less than
   ₦5,000 rolls on to the next month. PROVISIONAL until the owner says yes; changeable in admin Prices.
R15 (owner, 15 Nov 2026): contact on the site: email "motionafrica@gmail.com. You know the way I spell motion" = moxnafrica@gmail.com (owner confirmed
   the spelling in writing, 15 Nov 2026); WhatsApp "+234 810 534 0452".
R16 (owner, 15 Nov 2026): owner will give Paystack test keys "when that time has reached" and the Anthropic key; has a DigitalOcean account; needs a
   walkthrough to get the Google sign-in client. Until then: stand-ins behind the same ports, marked NOT RUN against the real provider.
