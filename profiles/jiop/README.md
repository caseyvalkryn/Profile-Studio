# JIOPs four-camera test profiles

Four profiles for the JIOPs four-camera drone detection test at the TST Ranch, Carthage NC,
12 to 13 November 2026 (sources: the JIOPs plan of 31 October 2026 and the Valkryn TST fusion
event deck, version 7). Built 2026-11-02.

| Id     | Profile                                       | Aircraft          | Runs |
| ------ | --------------------------------------------- | ----------------- | ---- |
| JIOP-1 | Range ladder by distance band                 | Mavic 3           | 3    |
| JIOP-2 | One-way attack, direct run                    | Tanq FPV          | 3    |
| JIOP-3 | Swarm, seven aircraft with crossings          | 2 Mavic 3, 5 Tanq | 2    |
| JIOP-4 | Controlled repeat, optical zoom 1x against 5x | Mavic 3           | 6    |

Run order: ladder, one-way attack, controlled repeat, swarm.

The site origin is the centre of the UAS Fly Area file (lat 35.289972, lon -79.385599). Both
site polygons are embedded as `range` areas; the KMZ files themselves stay out of the repo.
Ground elevation 150 m and every threshold and camera reach are planning values.

- `JIOP-1.json` to `JIOP-4.json`: one profile each, schema `profile-studio/8`.
- `jiop-library.json`: the four as one library import.
- `gen.py`, `profiles.py`: the generator. `gen.py` reads `geom.json` (the origin and the two
  polygons in the local frame, from the KMZ files); `profiles.py` writes the JSON and prints
  each camera's coverage windows and a point-in-polygon check.
- `page.py`: writes `val-test-profiles.html`, the customer page for the four profiles, from the
  JSON files and `gen.py`, so its maps, bands, paths and measures are the profiles'. The page
  is generated output and is excluded from Prettier.

Camera planning model (`gen.py`, review of 2026-11-02): the sensor (2560 × 1920, 4:3, the
Appendix B example; confirm the purchased model, 16:9 narrows the vertical FOV), the lens
settings (80° at 1×, 45.5° at 2× derived from the 80° lens, 17.6° at 5× spec value), the tilt
per camera (CAM-1, CAM-2 10° up, CAM-3 8°, CAM-4 6°), the aim (each camera yawed to the axis
100 m before the camera line) and the pixel thresholds (cue 3 px, confirmed 5 px, identified
8 px) are constants. Every reach, elevation limit, expected event and page figure derives from
them; the attack and the swarm use the 0.25 m Tanq width, the ladder and the repeat the 0.4 m
Mavic 3. Change a constant, then run `python3 profiles.py` and `python3 page.py`.

Import through the app: Library, Import, paste or pick a file. A record with the same id
replaces the stored one.
