# W15C plan: the old rule breaks still accepted in the web gate

Read-only audit (T0). Source: Firstwish-web scripts/gates/baseline.json (386 entries), the gate code in scripts/gates/checks/, rulings R10, IH5, IJ1, and .pipeline/registry.json. No file changed.

## What the gate really flags
- fake_data: any identifier like sampleX / SAMPLE_X / fixture in a non-test file, by name. It cannot tell real geometry or copy from fake data.
- deferrals: words such as "belongs to the", "for now", "once", in a comment. It cannot tell a promise from plain English.
- forks: the same class name in two files, by name only.
- hardcoded_signals: a hex colour outside styles/** (the only token layer in gates.config.json), and a true/false literal in a state hook or prop whose name has ready, active, etc.

## Counts by way to clear (138 rows below, plus 248 style-package colours)
A delete: 5. B read from server: 18 (one NEW read). C designed content or no truthful edit: 100 (colour tokens 70, state flags 17, maker hints 7, sample link 4, samplePath 2). D fork: 4 (checked, none is a real duplicate). E deferral: 11 (none owes work).

## Style-package colours (wait for the owner), by package: 248 entries
| style package | entries |
|---|---|
| components/styles/film/aso-ebi | 17 |
| components/styles/film/bloom | 1 |
| components/styles/film/cap-toss | 19 |
| components/styles/film/cinema | 8 |
| components/styles/film/midnight | 6 |
| components/styles/film/milestone | 7 |
| components/styles/stage/constellation | 3 |
| components/styles/stage/contact-sheet | 7 |
| components/styles/stage/gallery | 10 |
| components/styles/stage/gold-card | 11 |
| components/styles/stage/invitation | 8 |
| components/styles/stage/mosaic | 13 |
| components/styles/stage/owambe | 22 |
| components/styles/stage/pinboard | 12 |
| components/styles/stage/polaroid-table | 11 |
| components/styles/stage/showroom | 1 |
| components/styles/stage/the-question | 6 |
| components/styles/stage/tinsel | 8 |
| components/styles/stories/first-day | 19 |
| components/styles/stories/group-chat | 5 |
| components/styles/stories/pidgin-gist | 2 |
| components/styles/swipe/before-and-after | 6 |
| components/styles/swipe/boarding-pass | 16 |
| components/styles/swipe/lookbook | 1 |
| components/styles/swipe/mixtape | 6 |
| components/styles/swipe/quiet | 7 |
| components/styles/swipe/scrapbook | 8 |
| components/styles/swipe/tailored | 7 |
| components/styles/swipe/the-aisle | 1 |

(components/styles/film/cap-toss/stage.ts:312 is a Color(0x56627c) literal, counted in cap-toss.)


## Bundles (at most five; files disjoint)
| bundle | rows | needs server first | size | files |
|---|---|---|---|---|
| S1 sample wishes from the server | 18 | YES: NEW GET /v1/sample-wishes/:kind/:occasion returns the model wish content, the sample photo urls, and an already-passed opening date (reference data, IJ1); a builder in the API repo first | large | lib/engine/adapt.ts, components/app/studio/Live.tsx, Start.tsx, Editor.tsx, layout/mount.tsx, components/engine/Preview.tsx |
| S2 delete the style lab | 5 (+ _fixtures.ts, no rows) | no; owner confirms the lab may go (O1) | small | app/lab/**, components/styles/_fixtures.ts. Do after or with S1 (MomentPlayer calls sampleWish) |
| S3 maker hints and sample link | 11 | no (sample link needs owner O3) | small | components/app/maker/Fields.tsx (plus a new hint table), lib/config.ts, components/site/CategoryPage.tsx. Lands before S1 deletes sampleContent, or imports the new table at once |
| S4 colours into the token layer, app side | 41 | no | medium | lib/studio.ts (22), components/app/studio/{Tools,kit-motion,nodes,paint,rig,three}, components/engine/**, components/moments/** |
| S5 colours into the token layer, site and engine side | 29 | no | medium | components/cinema/{Hero,How}.tsx, components/site/posters.tsx, lib/engine/motion/** |

Not in a bundle: the 34 entries where the gate is wrong about the code (17 state flags, 11 deferrals, 4 forks, 2 samplePath). Clearing them honestly needs the owner (O2). The 248 style colours wait for the owner (O4).

## Only the owner can decide
- O1: may the style lab (/lab, /lab/motion) be deleted, or is it a tool the team wants to keep? It is in the production build, unlinked.
- O2: for the 34 entries where the code is right and the gate is wrong (17 ready/active flags, 11 comments, 4 same-name classes, 2 samplePath): keep them accepted with that reason, or have the gate itself learn the difference. A builder must not rename or reword only to hide them, and the brief forbids editing the gate or baseline.
- O3: the "Watch the sample" link is a claude.ai artifact. Which real sample reveal on Firstwish (/r/code) should it be?
- O4: the 248 colours inside style packages (each style owns its palette): accept as design, or move into per-style tokens.
- O5: whether a house style's sample photos (aisha-n.webp, the model "Aisha") may stay as served reference data.

## Could not classify with certainty
- forks 'Stage': the baseline says five files; I found four classes named Stage (gold-card, invitation, mosaic, owambe). The fifth is not in the evidence I read.
- Which exact registry endpoint a lab or Studio caller would use: no existing endpoint (E-195, E-196, E-198, E-284 are styles) serves a sample wish, so B is a NEW read.

## Rows (one per entry outside styles/**; sorted by gate, then file)
A delete, B read from the server, C designed content (or no truthful edit), D fork, E deferral.

| gate | file:line | what the code is | way | how to clear |
|---|---|---|---|---|
| fake_data | app/lab/[slug]/Lab.tsx:12 | style lab (typed-URL page) plays a sample wish | A | Delete app/lab/** and components/styles/_fixtures.ts: nothing imports them but the lab, no link reaches /lab (page comment says so; grep of app, components, lib finds no href). |
| fake_data | app/lab/motion/MomentPlayer.tsx:34 | style lab (typed-URL page) plays a sample wish | A | Delete app/lab/** and components/styles/_fixtures.ts: nothing imports them but the lab, no link reaches /lab (page comment says so; grep of app, components, lib finds no href). |
| fake_data | app/lab/motion/MomentPlayer.tsx:7 | style lab (typed-URL page) plays a sample wish | A | Delete app/lab/** and components/styles/_fixtures.ts: nothing imports them but the lab, no link reaches /lab (page comment says so; grep of app, components, lib finds no href). |
| fake_data | components/app/maker/Fields.tsx:100 | maker field hint text taken from the model wish | C | Designed hint copy: keep as a plain hint table (per chapter, no sample person: no Aisha or Tunde), not a call to sampleContent. |
| fake_data | components/app/maker/Fields.tsx:122 | maker field hint text taken from the model wish | C | Designed hint copy: keep as a plain hint table (per chapter, no sample person: no Aisha or Tunde), not a call to sampleContent. |
| fake_data | components/app/maker/Fields.tsx:141 | maker field hint text taken from the model wish | C | Designed hint copy: keep as a plain hint table (per chapter, no sample person: no Aisha or Tunde), not a call to sampleContent. |
| fake_data | components/app/maker/Fields.tsx:34 | maker field hint text taken from the model wish | C | Designed hint copy: keep as a plain hint table (per chapter, no sample person: no Aisha or Tunde), not a call to sampleContent. |
| fake_data | components/app/maker/Fields.tsx:35 | maker field hint text taken from the model wish | C | Designed hint copy: keep as a plain hint table (per chapter, no sample person: no Aisha or Tunde), not a call to sampleContent. |
| fake_data | components/app/maker/Fields.tsx:69 | maker field hint text taken from the model wish | C | Designed hint copy: keep as a plain hint table (per chapter, no sample person: no Aisha or Tunde), not a call to sampleContent. |
| fake_data | components/app/maker/Fields.tsx:7 | maker field hint text taken from the model wish | C | Designed hint copy: keep as a plain hint table (per chapter, no sample person: no Aisha or Tunde), not a call to sampleContent. |
| fake_data | components/app/studio/Editor.tsx:13 | Studio editor plays the style on a sample wish | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/Editor.tsx:96 | Studio editor plays the style on a sample wish | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/Live.tsx:14 | style preview card plays sampleWish | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/Live.tsx:19 | style preview card plays sampleWish | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/Live.tsx:39 | style preview card plays sampleWish | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/Live.tsx:6 | style preview card plays sampleWish | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/Start.tsx:60 | Studio start page previews a house style on a sample | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/Start.tsx:8 | Studio start page previews a house style on a sample | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/layout/mount.tsx:15 | Studio checks mount a sample wish off screen | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/layout/mount.tsx:41 | Studio checks mount a sample wish off screen | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/app/studio/live-motion.ts:138 | real SVG path geometry named samplePath | C | Gate matches the word "sample"; the code samples points on a path, not data. No truthful edit; owner item O2. |
| fake_data | components/app/studio/live-motion.ts:142 | real SVG path geometry named samplePath | C | Gate matches the word "sample"; the code samples points on a path, not data. No truthful edit; owner item O2. |
| fake_data | components/engine/Preview.tsx:110 | style tile plays its sample live when not recorded | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/engine/Preview.tsx:27 | style tile plays its sample live when not recorded | B | Read the same NEW sample-wish read (bundle S1); reached by /app/creator/studio and the public /styles pages. IJ1: no new use meanwhile. |
| fake_data | components/site/CategoryPage.tsx:14 | link to the sample reveal (a claude.ai artifact) for photographers | C | Designed marketing link; name says "sample". Truthful change only when the owner picks a real reveal on Firstwish itself (/r/:code, E-248). Owner item O3. |
| fake_data | components/site/CategoryPage.tsx:30 | link to the sample reveal (a claude.ai artifact) for photographers | C | Designed marketing link; name says "sample". Truthful change only when the owner picks a real reveal on Firstwish itself (/r/:code, E-248). Owner item O3. |
| fake_data | components/site/CategoryPage.tsx:82 | link to the sample reveal (a claude.ai artifact) for photographers | C | Designed marketing link; name says "sample". Truthful change only when the owner picks a real reveal on Firstwish itself (/r/:code, E-248). Owner item O3. |
| fake_data | lib/config.ts:4 | link to the sample reveal (a claude.ai artifact) for photographers | C | Designed marketing link; name says "sample". Truthful change only when the owner picks a real reveal on Firstwish itself (/r/:code, E-248). Owner item O3. |
| fake_data | lib/engine/adapt.ts:15 | defines the 8 sample photos (aisha-n.webp) | B | NEW read needed: GET /v1/sample-wishes/:kind/:occasion (reference data: content, sample photo urls, opening-passed seal date); then delete these definitions. (IJ1; E-195/E-196 give styles only, none gives a sample wish.) |
| fake_data | lib/engine/adapt.ts:156 | build() falls back to sample photos when a wish has none | B | NEW read needed: GET /v1/sample-wishes/:kind/:occasion (reference data: content, sample photo urls, opening-passed seal date); then delete these definitions. (IJ1; E-195/E-196 give styles only, none gives a sample wish.) |
| fake_data | lib/engine/adapt.ts:258 | defines sampleContent (model words per kind) | B | NEW read needed: GET /v1/sample-wishes/:kind/:occasion (reference data: content, sample photo urls, opening-passed seal date); then delete these definitions. (IJ1; E-195/E-196 give styles only, none gives a sample wish.) |
| fake_data | lib/engine/adapt.ts:269 | sample "your-finals" link and 64 MB download | B | NEW read needed: GET /v1/sample-wishes/:kind/:occasion (reference data: content, sample photo urls, opening-passed seal date); then delete these definitions. (IJ1; E-195/E-196 give styles only, none gives a sample wish.) |
| fake_data | lib/engine/adapt.ts:277 | defines sampleWish (model wish for an occasion) | B | NEW read needed: GET /v1/sample-wishes/:kind/:occasion (reference data: content, sample photo urls, opening-passed seal date); then delete these definitions. (IJ1; E-195/E-196 give styles only, none gives a sample wish.) |
| fake_data | lib/engine/adapt.ts:279 | sampleWish reads sampleContent | B | NEW read needed: GET /v1/sample-wishes/:kind/:occasion (reference data: content, sample photo urls, opening-passed seal date); then delete these definitions. (IJ1; E-195/E-196 give styles only, none gives a sample wish.) |
| deferrals | components/app/studio/Panels.tsx:160 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/film/aso-ebi/Scene.tsx:122 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/film/cinema/Scene.tsx:26 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/scroll/banter/manifest.ts:3 | comment says the style was first named Pidgin Gist | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/scroll/gele/manifest.ts:3 | comment says the style was first named Owambe | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/scroll/marquee/manifest.ts:3 | comment says the style was first named Cinema | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/stage/gold-card/Still.tsx:236 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/stage/lullaby/views.tsx:12 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/stage/tinsel/Scene.tsx:490 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/swipe/quiet/Scene.tsx:236 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| deferrals | components/styles/swipe/the-aisle/Scene.tsx:500 | explains how a move or part is shared, in plain English | E | No work is owed; "belongs to" / "for now" are ordinary words here. Not a task. Comment is true, so it stays; owner item O2. |
| forks | components/styles/stage/contact-sheet/gl.ts:169 | two Table classes, one per style | D | Checked: not a duplicate. Same name, different code (lines shared are under 25 of 500-1500); each file is imported only by its own style (./room, ./world, ./stage). Nothing to fold. Owner item O2. |
| forks | components/styles/stage/gold-card/stage.ts:266 | four-five 3D Stage classes, one per style | D | Checked: not a duplicate. Same name, different code (lines shared are under 25 of 500-1500); each file is imported only by its own style (./room, ./world, ./stage). Nothing to fold. Owner item O2. |
| forks | components/styles/stage/lullaby/room.ts:57 | two 3D Room classes, one per style | D | Checked: not a duplicate. Same name, different code (lines shared are under 25 of 500-1500); each file is imported only by its own style (./room, ./world, ./stage). Nothing to fold. Owner item O2. |
| forks | components/styles/stage/the-question/world.ts:136 | two 3D World classes, one per style | D | Checked: not a duplicate. Same name, different code (lines shared are under 25 of 500-1500); each file is imported only by its own style (./room, ./world, ./stage). Nothing to fold. Owner item O2. |
| hardcoded_signals | app/lab/[slug]/Lab.tsx:18 | lab theme / lab confetti colour | A | Goes with the lab delete (A above). |
| hardcoded_signals | app/lab/motion/MotionLab.tsx:29 | lab theme / lab confetti colour | A | Goes with the lab delete (A above). |
| hardcoded_signals | components/app/studio/Tools.tsx:135 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/Tools.tsx:154 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/Tools.tsx:261 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/kit-motion.ts:260 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/kit-motion.ts:305 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/nodes.tsx:310 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/nodes.tsx:311 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/nodes.tsx:312 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/paint.ts:22 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/rig.ts:308 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/app/studio/three.ts:103 | default colour in a Studio tool or effect map | C | Design token: read from the look, with the default from styles/ tokens. |
| hardcoded_signals | components/cinema/Hero.tsx:12 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/Hero.tsx:13 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/Hero.tsx:14 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/Hero.tsx:51 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/Hero.tsx:55 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/How.tsx:20 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/How.tsx:21 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/How.tsx:22 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/How.tsx:59 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/cinema/How.tsx:63 | wax-seal / flame illustration colour on Home or How | C | Designed art: draw the seal with CSS variables from styles/ (--seal, --flame) instead of hex. |
| hardcoded_signals | components/engine/endings/Scratch.tsx:24 | default look or frame colour | C | Design token: move into styles/ tokens (BLANK_LOOK is the blank style's palette). |
| hardcoded_signals | components/engine/endings/Scratch.tsx:26 | default look or frame colour | C | Design token: move into styles/ tokens (BLANK_LOOK is the blank style's palette). |
| hardcoded_signals | components/engine/made/doc.ts:19 | default look or frame colour | C | Design token: move into styles/ tokens (BLANK_LOOK is the blank style's palette). |
| hardcoded_signals | components/engine/made/nodes.tsx:79 | default look or frame colour | C | Design token: move into styles/ tokens (BLANK_LOOK is the blank style's palette). |
| hardcoded_signals | components/moments/ending/gift-box/Scene.tsx:110 | fallback colour in a moment (flame, wax, confetti) | C | Fallback already reads a CSS variable first; move the fallback into styles/ tokens. |
| hardcoded_signals | components/moments/ending/ring-box/Scene.tsx:118 | fallback colour in a moment (flame, wax, confetti) | C | Fallback already reads a CSS variable first; move the fallback into styles/ tokens. |
| hardcoded_signals | components/moments/opening/fuse/Scene.tsx:93 | fallback colour in a moment (flame, wax, confetti) | C | Fallback already reads a CSS variable first; move the fallback into styles/ tokens. |
| hardcoded_signals | components/moments/opening/wax-seal/Scene.tsx:50 | fallback colour in a moment (flame, wax, confetti) | C | Fallback already reads a CSS variable first; move the fallback into styles/ tokens. |
| hardcoded_signals | components/site/posters.tsx:12 | drawn poster art colour for a style card | C | Designed art: colours as variables in styles/ poster tokens. |
| hardcoded_signals | components/site/posters.tsx:15 | drawn poster art colour for a style card | C | Designed art: colours as variables in styles/ poster tokens. |
| hardcoded_signals | components/site/posters.tsx:18 | drawn poster art colour for a style card | C | Designed art: colours as variables in styles/ poster tokens. |
| hardcoded_signals | components/site/posters.tsx:21 | drawn poster art colour for a style card | C | Designed art: colours as variables in styles/ poster tokens. |
| hardcoded_signals | components/site/posters.tsx:24 | drawn poster art colour for a style card | C | Designed art: colours as variables in styles/ poster tokens. |
| hardcoded_signals | components/site/posters.tsx:27 | drawn poster art colour for a style card | C | Designed art: colours as variables in styles/ poster tokens. |
| hardcoded_signals | components/site/posters.tsx:9 | drawn poster art colour for a style card | C | Designed art: colours as variables in styles/ poster tokens. |
| hardcoded_signals | components/styles/film/aso-ebi/Scene.tsx:67 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/film/bloom/Scene.tsx:92 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/film/cap-toss/Scene.tsx:74 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/film/harvest-light/Scene.tsx:91 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/film/midnight/Scene.tsx:74 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/film/runway/Still.tsx:183 | prop pinned for a resting still frame | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/film/runway/views.tsx:576 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/film/screening/Still.tsx:297 | prop pinned for a resting still frame | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/stage/invitation/Scene.tsx:142 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/stage/mosaic/Scene.tsx:196 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/stage/owambe/Scene.tsx:92 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/stage/showroom/Scene.tsx:47 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/stage/showroom/Still.tsx:115 | prop pinned for a resting still frame | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/stage/tinsel/Scene.tsx:144 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/stories/first-day/Scene.tsx:92 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/swipe/before-and-after/Still.tsx:212 | prop pinned for a resting still frame | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | components/styles/swipe/quiet/Opening.tsx:59 | local flag set by the scene when fonts, images or its timeline are ready | C | Not a server fact: UI-only animation state. No truthful edit; gate cannot tell. Owner item O2. |
| hardcoded_signals | lib/engine/motion/atmosphere.ts:126 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/atmosphere.ts:127 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/atmosphere.ts:209 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/atmosphere.ts:217 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/atmosphere.ts:263 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/atmosphere.ts:404 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/image.ts:181 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/index.ts:131 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/index.ts:151 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/index.ts:153 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/index.ts:87 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/engine/motion/scene.ts:299 | default or fallback colour in an effect (confetti, rays, snow, grain) | C | Design token: effect default palette in styles/ tokens; the wish's own accent still wins. |
| hardcoded_signals | lib/studio.ts:132 | house look palette (ground, ink, accent...) | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:133 | house look palette (ground, ink, accent...) | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:134 | house look palette (ground, ink, accent...) | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:135 | house look palette (ground, ink, accent...) | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:136 | house look palette (ground, ink, accent...) | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:140 | house look palette (ground, ink, accent...) | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:146 | house look palette (ground, ink, accent...) | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:398 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:401 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:405 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:406 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:409 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:413 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:415 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:416 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:423 | effect tint (light, weather, nature) in the Studio effect list | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:81 | preset colour set in the Studio look picker | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:82 | preset colour set in the Studio look picker | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:84 | preset colour set in the Studio look picker | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:86 | preset colour set in the Studio look picker | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:88 | preset colour set in the Studio look picker | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
| hardcoded_signals | lib/studio.ts:89 | preset colour set in the Studio look picker | C | Design token: move the palette and tints into one module under styles/ (the gate's token layer) and import it. |
