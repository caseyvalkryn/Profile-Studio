# JIATF 401 Common Criteria for C-UAS Characterization (C4)

Reference for agents working on this project. Sources:
- C4: "Joint Interagency Task Force 401 Common Criteria for CUAS Characterization (C4)," 1 May 2026, 25 pages. Cited as (C4 p. N). Page numbers follow the document's own table of contents, not the printed footer codes, which repeat confusingly across sections.
- Handbook: "Small Drones, Big Problems: A First Principles Approach to Countering-UAS," JIATF 401, 100 pages. Cited as (Handbook p. N).
- DroneScore: `docs/reference/dronescore-measures.md` in this repo.

## a. What C4 is

C4 is JIATF 401's standard for testing and evaluating Counter-small Unmanned Aircraft Systems (C-sUAS). Its purpose is to give evaluators a common, repeatable set of measures.

That purpose is explicit: so test data from different ranges, services, and vendors can be aggregated and compared (C4 p. 1). It is not a replacement for existing developmental or operational test programs or safety certifications. It is a baseline that evaluators can extend with their own criteria (C4 p. 3).

Structure. C4 organizes measures under five criteria: Detection & Tracking, Classification & Identification, Threat Defeat & Denial, System Interoperability & Reliability, and Operational Viability (C4 p. 3-4).

Each criterion holds one or more Measures of Effectiveness (MOEs). Each MOE holds one or more Measures of Performance (MOPs). The ID scheme is `{criterion}.{MOE}` for an MOE and `{criterion}.{MOE}.{MOP}` for a MOP. Example: MOE 1.1 is under Criterion 1. MOP 1.1.1, 1.1.2, 1.1.3, and 1.1.4 sit under MOE 1.1.

The five criteria and their MOE/MOP IDs (C4 p. 3-4):
- Criterion 1, Detection & Tracking: MOE 1.1 (MOP 1.1.1-1.1.4), MOE 1.2 (MOP 1.2.1-1.2.3).
- Criterion 2, Classification & Identification: MOE 2.1 (MOP 2.1.1-2.1.4).
- Criterion 3, Threat Defeat & Denial: MOE 3.1 (MOP 3.1.1-3.1.4).
- Criterion 4, System Interoperability & Reliability: MOE 4.1 (MOP 4.1.1-4.1.2), MOE 4.2 (MOP 4.2.1-4.2.2).
- Criterion 5, Operational Viability: MOE 5.1 (MOP 5.1.1), MOE 5.2 (MOP 5.2.1), MOE 5.3 (MOP 5.3.1-5.3.2).

Separately, section 4.2 defines Key Performance Parameters (KPPs) and Key System Attributes (KSAs). These are numbered by topic area, not by criterion: KPP1.x Detect, KPP2.x Track, KPP3a.x Classify, KPP3b.x Identify, KPP4.x Target Quality, KPP5.x Defeat, KPP6.x Automation, KPP7.x C2, KPP8.x Survivability, KPP9.x Ancillary System Characteristics, KPP10.x Cost (C4 p. 5-10). A KSA is a KPP-adjacent attribute. The document uses the two labels for items in the same numbered lists, for example KSA1.7 and KSA3a.3.

One defect to flag: the printed table repeats the ID "KPP 5.5" for two different rows, Launcher Capacity and Cyclic Rate (C4 p. 7). That is a defect in the source document, not in this project's copy.

Required data sources. C4 does not name specific instruments. It never uses terms like "GCS log" or "TSPI." It requires that "every test event... capture sets of core data points" in "a common, standardized format" so results aggregate across the enterprise (C4 p. 1, p. 16). It leaves the exact instrumentation to evaluators. DroneScore's own collection buckets (GCS log, TSPI, Scorer, Day closeout, Vendor sheet, Derived, Specialist test) are DroneScore's implementation choice, not a C4 requirement.

Scoring and reporting rules. Each KPP has a Threshold, the minimum acceptable performance, and an Objective, the desired performance. Both must be defined and documented before test execution. The final assessment must state whether the system met Threshold, fell short, or achieved Objective (C4 p. 5). Section 7 requires evaluations to follow "stringent reporting and data management protocols" and to coordinate with JIATF 401 on data collection resources (C4 p. 16).

Test conditions. Evaluations use an Engagement Timeline Analysis (ETA) that breaks the kill chain into measurable time gates. It runs first against a Most Likely Course of Action (MLCOA) for baseline performance, then against a Most Dangerous Course of Action (MDCOA) for stress performance (C4 p. 11-12). A sample test matrix varies launch point, flight path, speed, and altitude across named profiles (C4 p. 14). The evaluation environment should be operationally representative: urban clutter, RF-dense spectrum, and weather effects, not a sterile open range (C4 p. 15). Operator and system usability is assessed with accepted human-factors tools: NASA Task Load Index (TLX), Situation Awareness Global Assessment Technique (SAGAT), and the System Usability Scale (SUS) (C4 p. 10).

Threat classes. C4's baseline MOEs/MOPs are written against "Group 1-2 UAS threats." A footnote points evaluators to the DoD Unmanned Aircraft Categorization Review Report to Congress, November 2022, for the group definitions themselves (C4 p. 3). Section 5.1, on testing against a credible and diverse threat, calls for including "Groups 1-3, fixed-wing, multi-rotor" platforms (C4 p. 12). C4 does not define Group 1/2/3 itself. It defers to that external report.

## b. DroneScore to C4 traceability

The DroneScore MOP and MOE IDs (1.1.1-1.1.4, 1.1-1.2, 1.2.1-1.2.3, 2.1, 2.1.1-2.1.4, 3.1.1-3.1.4, 4.1.1-4.1.2, 4.2.1-4.2.2, 5.1.1, 5.2.1, 5.3.1-5.3.2) match C4 MOE/MOP IDs exactly.

The DroneScore KPP IDs (1.3-1.8, 2.1-2.5, 3a.1-3a.3, 3b.1-3b.2, 5.1-5.8 including 5.2e and 5.4e) match C4 KPP/KSA IDs in section 4.2. DroneScore drops the "KPP"/"KSA" prefix and keeps the number.

Gaps, DroneScore missing C4 rows:
- All of KPP6.1-6.3 and KSA6.2(a-g), the Automation workload KPPs (C4 p. 8).
- All of KPP7.1-7.3 and KSA7.4-7.5, the C2 KPPs (C4 p. 9).
- Most of KPP8.1-8.11, the Survivability KPPs, except the collateral-effects concept, which DroneScore keeps as KSA 5.7 (C4 p. 9).
- All of KPP9.1-9.4, Ancillary System Characteristics: battery life, weight, labor cost, setup time (C4 p. 9-10).
- KPP10.1-10.4, the Cost KPPs, except Cost per Engagement, which DroneScore keeps as row 5.8 (C4 p. 10).
- The KPP5.2a-d and KPP5.4a-d variant rows (electronic takeover, narrowband RF, laser, HPM), kept in C4 but not in DroneScore; DroneScore keeps only the kinetic variants, 5.2e and 5.4e (C4 p. 7-8).

Gaps, DroneScore rows with no C4 ID:
- INT-1 through INT-14, fourteen interceptor-characterization rows (max speed, G-load, seeker performance, fuse performance, debris, and so on). C4 has no "INT-" prefixed measures; these are DroneScore additions.
- 2.1.3t, Identification Time. C4's MOP 2.1.3 is a single measure, "Identification Range & Time" (C4 p. 4). DroneScore splits it into a range row (2.1.3) and a time row (2.1.3t).
- The disambiguated "5.5b" label for Cyclic Rate, which fixes the duplicate "KPP 5.5" ID in the C4 source noted above.

## c. Kill chain names

C4 structures its core capability areas as Detect, Track, Identify, Defeat (C4 p. 3). Within that, Criterion 3 further distinguishes engagement from defeat: MOP 3.1.1 Probability of Engagement, then MOP 3.1.2 Probability of Kill/Defeat (C4 p. 4).

DroneScore's own source note, at the bottom of the DroneScore list, names the full stage list its `stage_reached` field tracks: detect, track, classify, identify, engage, defeat.

The handbook names a different, five-part sequence for defenders: Detect, Deny, Disrupt, Defeat, with Discipline running through all of them, not as a fifth sequential step (Handbook p. 43-44).

Neither source uses the term "kill chain" as a defined label with that exact phrase. C4 uses "kill chain" informally in prose, for example describing Mission Engineering as analyzing "the entire end-to-end kill chain from detection to defeat" (C4 p. 16), without naming its steps there. Neither source uses "F2T2EA" or its expansion anywhere.

Project rule (user decision, confirmed 2026-10-30): Profile Studio groups its views by F2T2EA (Find, Fix,
Track, Target, Engage, Assess). F2T2EA is a display grouping only. Neither C4 nor the handbook
uses it. The stored value stays the DroneScore `stage_reached` field, and every measure keeps its
DroneScore ID and its C4 criterion. Do not merge or rename measures to fit a step.

| F2T2EA step | DroneScore `stage_reached` | DroneScore areas | C4 area |
| --- | --- | --- | --- |
| Find | detect | 1.1.x, 1.1 to 1.8 | Detect |
| Fix | track, classify | 1.2.1, 1.2.3, 2.1.1, 3a.x | Track, Identify |
| Track | identify | 1.2.2, 2.1 to 2.5, 2.1.2 to 2.1.4, 3b.x | Track, Identify |
| Target | none (no stored stage) | inputs only: operator decision and assignment time | not stated |
| Engage | engage | 3.1.1, 3.1.3, 3.1.4, INT-x | Defeat |
| Assess | defeat | 3.1.2, 5.1 to 5.8 | Defeat |

Target has no DroneScore stage. Show it as the decision time between Track and Engage. Do not
invent a measure for it. Areas 4 and 5 (interoperability, operational viability) sit outside the
chain. Show them as system-level results.

## d. Handbook first principles

The Five Ds (Handbook p. 29, 32-38, 43-44), in order:
- Detect: find the threat as early as possible.
- Deny: take away what the drone's operator is trying to achieve.
- Disrupt: force the operator into harder decisions or lost control.
- Defeat: physically or functionally neutralize the drone. The handbook calls this the "last resort," used only after the earlier steps.
- Discipline is not a fifth sequential step. It is the deliberate, trained mindset that "allows everything else to work," running through all four actions (Handbook p. 37, 43-44).

The Four Ps (Handbook p. 20-23):
- Person: the operator.
- Platform: the drone itself.
- Process: how the drone is controlled and flown.
- Payload: what the drone carries and why, which is its purpose.

The handbook frames these as the four factors to assess before a threat can be understood.

The three terrains (Handbook p. 59-60):
- Physical terrain: the ground, buildings, and line-of-sight that shape what sensors can see.
- Spectrum terrain: the electromagnetic environment, including noise floor and congestion, that shapes what links and detectors can do.
- Network terrain: how data moves, or fails to move, between sensors, operators, and effectors in time to matter.

The handbook argues these three must be modeled as one combined problem, not three separate ones.

Automation versus autonomy (Handbook p. 67). Automation is "the creation and application of technology to monitor and control... with no or limited manual tasks." It is used for continuous routine tasks like tracking and cross-referencing. It does not remove human decision-making.

Autonomy is a system's ability to "act independently or without human oversight within defined limits." The handbook says it is "rarely absolute" and is deliberately bounded by risk, confidence, and trust judgments.

## e. Glossary

- Adversary: a party acknowledged as potentially hostile, against which force may be used (Handbook p. 77, citing JP 3-0).
- Automation: technology that monitors and controls tasks with no or limited manual activity (Handbook p. 77, citing DoDI 5000.94).
- Autonomy: the level of independence a system is granted to execute a task, based on its own situational awareness and decision-making (Handbook p. 77-78).
- Common Operational Picture (COP): a single shared display of relevant information used for collaborative planning (Handbook p. 78, citing JP 3-0).
- Defeat: physical or functional neutralization of a drone so it no longer poses a threat (Handbook p. 78).
- Denial: measures that remove or reduce the value of what a threat is trying to achieve (Handbook p. 78).
- Detection: discovering the presence of a potential threat using sensors (Handbook p. 78).
- Engage: a fire control order to attack a designated target (Handbook p. 80, citing JP 3-01).
- Group 1-2 / Groups 1-3 UAS: the DoD's size/weight/altitude UAS categories; C4 tests against Group 1-2 as its baseline and recommends Groups 1-3 for diverse-threat testing (C4 p. 3, 12), but defers the actual category definitions to the DoD Unmanned Aircraft Categorization Review Report to Congress, Nov 2022 (not stated in C4 or the handbook).
- KPP (Key Performance Parameter): a system attribute with a Threshold and Objective; failing Threshold means the system cannot fulfill its mission (C4 p. 5).
- KSA (Key System Attribute): a KPP-adjacent attribute tracked the same way as a KPP (C4 p. 5).
- MLCOA / MDCOA: Most Likely / Most Dangerous Course of Action, the two threat scenarios used to baseline and then stress-test a system (C4 p. 11-12).
- MOE / MOP: Measure of Effectiveness / Measure of Performance, C4's two-level measure hierarchy (C4 p. 3).
- Pk: Probability of Kill, the proportion of engaged drones successfully defeated (C4 p. 4).
- RMF / ATO / ATC: Risk Management Framework compliance and the Authority to Operate / Authority to Connect it grants (C4 p. 4, 10).
- sUAS: small Unmanned Aircraft Systems (C4 Appendix A).
