# Profile Studio design principles

Profile Studio lets a counter-UAS test planner build a profile, run it, and read the result
against DroneScore measures. The planner then briefs the result from the app and exports it as
an after action report (AAR) that states a hypothesis and the evidence for it.

Be brilliant at the basics. A small set of things that work every time beats a large set that
works most of the time. Simple does not mean less capable. The planner gets the full capability
of the legacy app (`docs/reference/artifact-study.md`), and the interface stays quiet because
each capability waits out of sight until the planner asks for it.

Amended 2026-10-31 from the artifact study: sections 2, 3, 5, 7 and the new section 8.

## 1. DroneScore is the standard

1. Every measure the app shows is a DroneScore measure. Show its ID and name, for example
   "1.1.2 Detection Range (ground)". The app does not invent measures. Live readouts such as
   range, altitude and time stay on the map and the timeline, never on the scorecard.
2. The kill chain is Find, Fix, Track, Target, Engage, Assess (F2T2EA). Each measure sits under
   one step. The step names are the same on the map, the timeline, the charts and the AAR.
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
2. A template opens ready to run. It has a threat, a sensor laydown, a defended asset and a
   question.
3. Library items carry real values and say where each value came from.

## 4. One question, one run, one answer

1. A profile states its question and its hypothesis before it runs. The prediction is
   recorded first.
2. A run shows each measure against its threshold: the value, pass or fail, and the interval.
3. Two runs can sit side by side. The difference is the result.
4. A result applies only to the conditions tested. The app says so in the AAR.

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
8. Progressive disclosure. The default Build screen shows the map, the timeline, the asset
   library, the inspector and the top bar. Every other panel (layer chips, readout strip, chart
   strip, authored events, debrief) starts hidden and opens by its key, from the palette, or
   from a quiet toggle. A hidden panel is never a missing feature.
9. Two typefaces: Archivo for text and JetBrains Mono for numbers, both bundled, weights 400
   and 500 only. Five sizes, each with its line height: 11/14, 12/16, 13/18, 14/20, 17/24 px.
   Tabular numerals. Three stroke weights: 0.75, 1.25 and 2.25 px. Nothing else.
10. One icon set, Lucide. An icon sits beside its label. An icon alone has a tooltip. Board
    symbols are not icons; they follow the symbology in `legacy/js/41-symbols.js`.

## 6. Graphs are findings

1. Each chart answers one question. Its title states the hypothesis. Its subtitle states the
   result.
2. A chart exports as PNG, SVG or PDF and looks the same as on screen. Print uses the light
   theme.
3. The AAR is in this order: question, hypothesis, prediction, result, scope of inference,
   next test.

## 7. Fast enough to forget

1. A drag on the map stays smooth at 60 frames per second.
2. A measure updates within 100 ms of an edit.
3. A long simulation runs in the background with progress shown. It never blocks the map.
4. The 3D view loads only when asked and holds 30 frames per second at the map budget.

## 8. The brief is the result, told

1. A card is a saved way of looking: camera, layers, time, focus. One key saves it. Opening a
   card restores it, and leaving Brief restores Build as it was.
2. A card shows the live scene, its timeline strip and a caption. Captions carry live values by
   token, so the number on screen is the number at that time.
3. A clip plays a card from one time to another at one rate and stops at each beat. The
   presenter moves with one key: next beat, else next card.
4. The stage reads from the back of the room: a larger type scale, the card position, the time.
   Key hints show once and fade.
5. A capture is a picture of the stage for the deck. It lives for the session and leaves the
   app as PDF or PNG. The profile stores the card, never the picture.

## Sources

- Measures: `docs/reference/dronescore-measures.md`.
- JIATF-401 C4 and handbook notes: `docs/reference/jiatf-401.md`.
- rangeboard is a source of parts. Take a piece only when it serves a principle here, and change
  it to fit.
