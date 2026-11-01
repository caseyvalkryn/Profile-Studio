# Profile Studio design principles

Profile Studio lets a counter-UAS test planner create, iterate and brief test profiles as
interactive, detailed mockups. A profile states one question, its data products and its
measures of performance by DroneScore ID. The planner briefs the profile from the app. Profile
Studio plans real tests. It does not run or score them.

Be brilliant at the basics. A small set of things that work every time beats a large set that
works most of the time. Simple does not mean less capable. The planner gets what the v3 mockup
does, polished and on a sound engine. The denser legacy app (`docs/reference/artifact-study.md`)
is a source of parts, and a part returns only when the planner asks for it.

Amended 2026-10-31 from the artifact study: sections 2, 3, 5, 7 and the new section 8. Amended
2026-11-01 in lane 10.1 (the opening paragraph, item 3.2 and section 4) and in the handoff of
the same day (items 1.1, 1.2, 5.8, 7.3 and sections 6 and 8, pruned to the pivot).

## 1. DroneScore is the standard

1. Every measure the app shows is a DroneScore measure. Show its ID and name, for example
   "1.1.2 Detection Range (ground)". The app does not invent measures. Live readouts such as
   range, altitude and time stay on the board and the scrub, never in the measures list.
2. The kill chain is Find, Fix, Track, Target, Engage, Assess (F2T2EA). Each measure sits under
   one step. The step names are the same on the board, the scrub, the inspector and the brief.
3. Store metres and seconds, as DroneScore does. Show nm, ft AGL and kt by default. One toggle
   changes the display units everywhere.
4. Follow the JIATF-401 C4 conventions that DroneScore follows. See `docs/reference/`.

## 2. The map is the workspace

1. Drag an asset from the library onto the map. It lands where the cursor is.
2. Right-click anything to see what you can do to it. Right-click empty map to add an asset there.
3. Change things by touching them. Drag a ring to set range. Drag a waypoint to move it. Drag a
   sector edge to set the field of view.
4. Every change can be undone. Nothing asks "are you sure" when undo can fix it. The undo
   control names the change it will revert.
5. Three views of one scene: Plan, Elevation and 3D. Plan and Elevation are for editing. 3D is
   for seeing: it orbits, it animates, and it prints its vertical exaggeration. A drag in 3D
   offers the editing view in one line.
6. A drag reports its result, not only its geometry: the value under the cursor and the largest
   change it causes downstream, such as a detection window that shrinks.

## 3. Start from something that works

1. The first screen shows New and the templates. New opens a blank profile at once, named and
   ready to edit. Blank is the last template.
2. A template opens ready to edit and brief. It has a threat, a sensor laydown, a defended
   asset and a question.
3. Library items carry real values and say where each value came from.

## 4. One question, one profile, one brief

1. A profile states one question. Every other part of the profile serves that question.
2. The profile names its data products: the data the test must collect to answer the question.
3. The profile states its measures of performance by DroneScore ID and name, each under one
   F2T2EA step, with its threshold.
4. The brief carries the question, the data products and the measures to the test team. The
   app plans the test. It does not run or score it.

## 5. Quiet interface

The model is the Cursor editor and the Tesla screen: the content is the interface, and the
controls stay out of the way until you need them.

1. The map and the data take the space. Chrome is thin and quiet.
2. Color means state. One accent marks the selection and the current time.
3. A tooltip appears after a short pause. It says what the control does and its shortcut, in one
   line. It never covers what you point at.
4. Every command is in the command palette (Cmd+K) with its shortcut shown. The mouse and the
   keyboard can each do every task.
5. Motion is short and only shows a change. Nothing moves for decoration.
6. Use the words a test engineer uses. Do not show internal names.
7. Numbers use the mono font and always carry a unit.
8. Progressive disclosure. The default Build screen shows the board with its bar, the scrub
   and the two thumbnails, the asset library, the whole-scene inspector and the top bar. The
   five layer toggles sit in the bar. Every other control opens by its key or from the palette.
   A hidden control is never a missing feature.
9. Two typefaces: Geist for text and Geist Mono for numbers, both bundled, weights 400
   and 500 only. Five sizes, each with its line height: 11/14, 12/16, 13/18, 14/20, 17/24 px.
   Tabular numerals. Three stroke weights: 0.75, 1.25 and 2.25 px. Nothing else.
10. One icon set, Lucide. An icon sits beside its label. An icon alone has a tooltip. Board
    symbols are not icons; they follow the symbology in `legacy/js/41-symbols.js`.

## 6. Cards are findings

1. Each card answers one question about the profile. Its caption states what the viewer must
   see.
2. A card prints as it shows on screen, in the light theme, one page per card.
3. The brief is in this order: the question, the data products, the measures, then the cards.

## 7. Fast enough to forget

1. A drag on the map stays smooth at 60 frames per second.
2. A measure updates within 100 ms of an edit.
3. The preview recomputes within 100 ms of an edit, and the board rewrites only the layers
   whose inputs changed.
4. The 3D view is the same board under a third camera. It holds the map drag budget.

## 8. The brief is the plan, told

1. A card is a saved way of looking: camera, layers, time, focus. One key saves it. Opening a
   card restores it, and leaving Brief restores Build as it was.
2. A card shows the live scene at its time, the focus drawn strong and the rest dim, with a
   caption and presenter notes.
3. The presenter moves with one key: next card, previous card.
4. The profile stores the card, never a picture.
5. Clips and beats, caption tokens, presenter aids and captures are deferred. Each returns only
   when the planner asks for it.

## Sources

- Measures: `docs/reference/dronescore-measures.md`.
- JIATF-401 C4 and handbook notes: `docs/reference/jiatf-401.md`.
- rangeboard is a source of parts. Take a piece only when it serves a principle here, and change
  it to fit.
