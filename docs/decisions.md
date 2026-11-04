# Decisions on record

Settled by the user. Do not reopen one without the user. Dates are when the user decided.
The full build history (phases, lanes, reviews) is in git: `git show 735be7f:docs/plan.md` and
`git show 735be7f:reviews/` hold the last copies before the 2026-11-02 prune.

| Decision | Choice | Date |
| --- | --- | --- |
| Purpose | A polished profile mockup tool: create, iterate and brief counter-UAS test profiles. It plans tests; it does not run or score them. The v3 mockup `legacy/mockup-v3.html` is the direction | 2026-11-01 |
| Measures | DroneScore rows only (`docs/reference/dronescore-measures.md`), each under one F2T2EA step; F2T2EA over DroneScore `stage_reached` for the kill chain display | 2026-10-30 |
| Design | First principles (`docs/design-principles.md`). rangeboard (`~/projects/rangeboard`) is a source of parts, never a template | 2026-10-30 |
| Sources | Local only, `~/Desktop/MASTER/VALKRYN`. No downloads without the user | 2026-10-30 |
| Run and score code | Deleted on the pivot; tag `pre-pivot` (d1f56d1) keeps it one checkout away | 2026-11-01 |
| Modes | Library, Build, Brief. The mockup's Collect, Compose, Brief set the direction, not the words | 2026-11-01 |
| Inspector | The whole-scene inspector: every object under its section, the selected row expands | 2026-11-01 |
| Palette | Warm paper and graphite with affiliation inks (`legacy/css/tokens.css` and the mockup `:root`); one accent marks selection | 2026-11-01 |
| Hint grey | `--text-subtle` is #696b61 in the light theme (4.97:1 on the panel, 4.55:1 on the board), the nearest warm grey at WCAG AA | 2026-11-01 |
| Typeface | Geist for text, Geist Mono for numbers (`@fontsource/geist`, `@fontsource/geist-mono`, OFL). The brief: an operator command and control panel, elegant and modern, not "military" | 2026-11-01 |
| Words | "Envelopes" stays for the hull layer and "C2 and TSPI" for the rail group (allowed exceptions in the `stat-te-terminology` skill); "MAX RG" is "Max range" | 2026-11-01 |
| Timeline | The strip is the plan's clock: time state persists per profile; one selection and hover across strip, board and inspector; a card is a frame or a slice; one glyph vocabulary with state colour | 2026-11-01 |
| Site files | KML and KMZ polygons import as `range` areas at true scale about the site; the sample files (TST Ranch, UAS Fly Area) stay out of the repo and the tests use synthetic fixtures | 2026-11-02 |
| JIOPs profiles | The four JIOPs four-camera test profiles (JIOP-1 to JIOP-4) and their generator live in `profiles/jiop/`; they embed the site polygon coordinates, the KMZ files still stay out | 2026-11-02 |
| Site origin | A site file whose centre lies more than 50 km from the profile's site moves the site to the file's centre in the same undo step, and the toast says so | 2026-11-02 |
| Branches | `main` is the only branch. Commit, push and merge only on the user's word | 2026-11-02 |
| Scope hold | Not built, and not planned: the vos port, the domain fields the UI dropped (`chainTime`, sensor `model`, `entered`), beats, caption tokens, the chart display, attachments, the debrief overlay, a basemap | 2026-11-01 |
