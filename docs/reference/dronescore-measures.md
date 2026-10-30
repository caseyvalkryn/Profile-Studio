Source: /Users/caseytalbot/Desktop/DroneScore Metric List.md. This is the project's gold standard for DroneScore C4 measures; treat every row and ID below as authoritative.

DroneScore · C4 scorecard

# DroneScore Metric List

Every metric on the DroneScore C4 scorecard: 67 rows in 5 areas. "What is recorded" says in plain words what each value is. The small gray line under it is where the value is kept in the code. "Collected by" is the source of the value when DroneScore is fully connected. A dot marks the 10 rows the current build still assesses.

**Per run**

One value for each test run, kept in the run table. Names end in their unit: `_m` metres, `_s` seconds, `_pct` percent. Shown as `run:`

**Per test day**

One counter for each day, entered at closeout. Shown as `day:`

**Per interceptor**

One answer for each system, stored under its C4 row ID, so a new C4 row needs no database change. Shown as `profile:`

**Pass / fail check**

A Yes/No or Pass/Fail answer for each system, kept beside a written evidence note. Shown as `verdict:`

GCS log

Timestamped event log from the system's ground control station

TSPI

Range tracking of target and interceptor position over time

Scorer

Run form on the Score tab, filled at the range

Day closeout

Counters entered once per test day

Vendor sheet

Fillable vendor data sheet, stored in the system profile

Derived

DroneScore computes it from other values

Specialist test

Lab, certification or program review outside the range

## 1. Detection & Tracking 20 rows

| ID | Metric | What is recorded | Collected by | Now |
| --- | --- | --- | --- | --- |
| 1.1.1 | Probability of Detection | Was the target detected? run: stage_reached | GCS log |  |
| 1.1.2 | Detection Range (ground) | Ground distance to the target at first detection (m) run: detect_range_m | GCS log + TSPI |  |
| 1.1.3 | Detection Range (slant) | Straight-line distance at first detection (m), from ground distance and altitude run: detect_range_m, detect_alt_m | GCS log + TSPI |  |
| 1.1.4 | False Alarm Rate | False detections per operating hour run: false_alarms · day: operating_minutes | GCS log + Day closeout |  |
| 1.1 | Detection Range KPP | Mean detection range (km) same value as MOP 1.1.2 | GCS log + TSPI |  |
| 1.2 | Detection Accuracy | Detection rate (%) same value as MOP 1.1.1 | GCS log |  |
| 1.3 | Field of View | Sensor coverage (deg) profile: 1.3 | Vendor sheet |  |
| 1.4 | Min Altitude | Lowest altitude the sensor detects (m above ground) profile: 1.4 | Vendor sheet |  |
| 1.5 | Max Altitude | Highest altitude at first detection (m above ground) run: detect_alt_m (maximum) | GCS log + TSPI |  |
| 1.6 | Detection Quantity | Targets detected at the same time profile: 1.6 | Vendor sheet |  |
| 1.7 | Detection Automation | Does the system turn detections into tracks by itself? (Y/N) profile: 1.7 | Vendor sheet |  |
| 1.8 | Resolution | Closest spacing at which two targets show as two (m) profile: 1.8 | Vendor sheet |  |
| 1.2.1 | Probability of Track | Did the detected target become a track? run: stage_reached | GCS log |  |
| 1.2.2 | Track Continuity | Share of time the track was held (%) run: track_continuity_pct | GCS log |  |
| 1.2.3 | Track Accuracy | Track position error against true position (m, 3D) run: track_error_m | GCS log + TSPI |  |
| 2.1 | Track Range | Distance at which a continuous track is held (km) profile: 2.1 | Vendor sheet |  |
| 2.2 | Track Accuracy KPP | Error in reported position and speed (± %) profile: 2.2 | Vendor sheet |  |
| 2.3 | Track Quantity | Targets tracked at the same time profile: 2.3 | Vendor sheet |  |
| 2.4 | Track Automation | Does the system follow target maneuvers by itself? (Y/N) profile: 2.4 | Vendor sheet |  |
| 2.5 | Update / Revisit Rate | Track updates per second profile: 2.5 | Vendor sheet |  |

## 2. Classification & Identification 10 rows

| ID | Metric | What is recorded | Collected by | Now |
| --- | --- | --- | --- | --- |
| 2.1.1 | Probability of Correct Classification | Was the tracked target classified as a drone? run: stage_reached | GCS log |  |
| 2.1.2 | Probability of Correct Identification | Was the drone type identified correctly? run: stage_reached, identified_ok | GCS log |  |
| 2.1.3 | Identification Range | Distance to the target at correct identification (m) run: id_range_m | GCS log + TSPI |  |
| 2.1.3t | Identification Time | Time to correct identification (s) run: id_time_s | GCS log |  |
| 2.1.4 | Mis-Identification Rate | Share of identifications that were wrong (%) run: identified_ok | GCS log |  |
| 3a.1 | Classification Range | Distance for positive classification as a drone (km) profile: 3a.1 | Vendor sheet |  |
| 3a.2 | Classification Accuracy | Classification rate (%) same value as MOP 2.1.1 | GCS log |  |
| 3a.3 | Classification Automation | Does sensor fusion classify by itself? (Y/N) profile: 3a.3 | Vendor sheet |  |
| 3b.1 | Identification Range KPP | Mean identification range (km) same value as MOP 2.1.3 | GCS log + TSPI |  |
| 3b.2 | Identification Automation | Does sensor fusion identify the type by itself? (Y/N) profile: 3b.2 | Vendor sheet |  |

## 3. Threat Defeat & Denial 29 rows

| ID | Metric | What is recorded | Collected by | Now |
| --- | --- | --- | --- | --- |
| 3.1.1 | Probability of Engagement | Was the identified target engaged? run: stage_reached | GCS log |  |
| 3.1.2 | Probability of Kill (Pk) | Was the engaged target defeated? (Success, Miss, No Attempt) run: outcome | Scorer |  |
| 3.1.3 | Defeat Range | Distance to the target at defeat (m) run: engagement_range_m | TSPI |  |
| 3.1.4 | Defeat Engagement Time | Seconds from engage command to defeat run: time_to_intercept_s | Scorer or GCS log |  |
| 5.1 | Defeat Range KPP | Mean defeat range (km) same value as MOP 3.1.3 | TSPI |  |
| 5.2 | Quantity (Simultaneous) | Targets defeated at the same time profile: 5.2 | Vendor sheet |  |
| 5.2e | Quantity (Kinetic) | Targets a kinetic system defeats at the same time profile: 5.2e | Vendor sheet |  |
| 5.3 | Quantity (Over Time) | Defeats per hour from one launcher, from Pk, reload time and engagement time computed | Derived |  |
| 5.4 | Effectiveness (Pk) | Pk (%) same value as MOP 3.1.2 | Scorer |  |
| 5.4e | Effectiveness (Kinetic) | Pk for a kinetic system (%) same value as MOP 3.1.2 | Scorer |  |
| 5.5 | Launcher Capacity | Interceptors loaded at one time profile: 5.5 | Vendor sheet |  |
| 5.5b | Cyclic Rate | Engagements per minute profile: 5.5b | Vendor sheet |  |
| 5.6 | Engagements per Interceptor | Engagements one interceptor can handle profile: 5.6 | Vendor sheet |  |
| 5.7 | Collateral Effects / Damage | Did effects stay inside the allowed limits? (Y/N) profile: 5.7 | TSPI |  |
| 5.8 | Cost per Engagement | Cost per defeat ($): unit cost × interceptors spent ÷ defeats computed | Derived |  |
| INT-1 | Interceptor Max Speed | Interceptor top speed (m/s) profile: INT-1 | Vendor sheet |  |
| INT-2 | Acceleration / G-Load | Sustained acceleration (g) profile: INT-2 | Vendor sheet |  |
| INT-3 | Intercept Envelope | Reach by altitude, checked against flight endurance (text) profile: INT-3 | Derived |  |
| INT-4 | Seeker Acquisition Range | Distance at which the seeker locks the target (km) profile: INT-4 | GCS log + TSPI |  |
| INT-5 | Probability of Lock | Seeker lock rate inside acquisition range (%) profile: INT-5 | GCS log |  |
| INT-6 | Terminal Guidance Accuracy (CEP) | Miss distance as circular error probable (m) profile: INT-6 | TSPI |  |
| INT-7 | Mid-Course Update Capability | Takes target updates in flight? (Y/N) profile: INT-7 | Vendor sheet |  |
| INT-8 | Kill Mechanism | How it kills, such as hit-to-kill (text, not scored) profile: INT-8 | Vendor sheet |  |
| INT-9 | Fuse / Detonation Performance | Fuse reliability and lethal radius (% / m) profile: INT-9 | TSPI |  |
| INT-10 | Multi-Interceptor Coordination | Can several interceptors work together? (Y/N or #) profile: INT-10 | GCS log |  |
| INT-11 | Reload / Magazine Cycle Time | Time to ready the next interceptor (s) profile: INT-11 | Vendor sheet |  |
| INT-12 | Abort / Self-Destruct Capability | Has a safe abort or self-destruct? (Y/N) profile: INT-12 | Scorer (abort runs) |  |
| INT-13 | Engagement Geometry Performance | Pk by approach: head-on, tail chase, crossing (%) profile: INT-13 | TSPI + Scorer |  |
| INT-14 | Debris Characterization | Debris field size and energy (text / m) profile: INT-14 | TSPI |  |

## 4. System Interoperability & Reliability 4 rows

| ID | Metric | What is recorded | Collected by | Now |
| --- | --- | --- | --- | --- |
| 4.1.1 | Impact on Co-located Systems | Does it harm nearby systems? (Pass/Fail) verdict: mop.4.1.1.verdict | Specialist test |  |
| 4.1.2 | HERO / HERP / HERF | Is it a hazard to ordnance, people or fuel? (Pass/Fail) verdict: mop.4.1.2.verdict | Specialist test |  |
| 4.2.1 | Mean Time Between System Abort | Operating minutes ÷ system aborts (min) day: operating_minutes, system_aborts | Day closeout or GCS log |  |
| 4.2.2 | Mean Time to Repair | Repair minutes ÷ system aborts (min) day: repair_minutes, system_aborts | Day closeout |  |

## 5. Operational Viability 4 rows

| ID | Metric | What is recorded | Collected by | Now |
| --- | --- | --- | --- | --- |
| 5.1.1 | RMF Compliance (ATO / ATC) | Has authority to operate and to connect? (Y/N) verdict: mop.5.1.1.verdict | Specialist test |  |
| 5.2.1 | Contested Environment Operation | Works under threat electronic attack? (Y/N) verdict: mop.5.2.1.verdict | Specialist test |  |
| 5.3.1 | Hazard Prevention | Meets military safety standards? (Pass/Fail) verdict: mop.5.3.1.verdict | Specialist test |  |
| 5.3.2 | Collateral Damage Mitigation | Shares no-fire sectors with C2? (Y/N) verdict: mop.5.3.2.verdict | Specialist test |  |

Source: DroneScore at commit bf9fa1a (server/c4.js, criteria.js, compliance.js, not-assessable.js). "Same value as MOP" means the KPP row reuses a measured MOP, so it is not recorded twice. The six "stage_reached" rows all read one field: the furthest kill chain step a run reached (detect, track, classify, identify, engage, defeat). INT-8 is a specification, so the build prints it and does not score it.