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
- `gen.py`, `profiles.py`: the generator. `gen.py` reads `geom.json` (the two polygons in the
  local frame, made from the KMZ files by `geom.py` in the original session); `profiles.py`
  writes the JSON and prints each camera's coverage windows and a point-in-polygon check.

Import through the app: Library, Import, paste or pick a file. A record with the same id
replaces the stored one.
