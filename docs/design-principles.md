# Profile Studio design principles

Profile Studio lets a counter-UAS test planner build a vignette, run it, and read the result
against DroneScore measures. The planner then exports the result as an after action report (AAR)
that states a hypothesis and the evidence for it.

Be brilliant at the basics. A small set of things that work every time beats a large set that
works most of the time.

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
4. Every change can be undone. Nothing asks "are you sure" when undo can fix it.

## 3. Start from something that works

1. The first screen shows templates. Blank is the last choice.
2. A template opens ready to run. It has a threat, a sensor laydown, a defended asset and a
   question.
3. Library items carry real values and say where each value came from.

## 4. One question, one run, one answer

1. A vignette states its question and its hypothesis before it runs. The prediction is
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

## Sources

- Measures: `docs/reference/dronescore-measures.md`.
- JIATF-401 C4 and handbook notes: `docs/reference/jiatf-401.md`.
- rangeboard is a source of parts. Take a piece only when it serves a principle here, and change
  it to fit.
