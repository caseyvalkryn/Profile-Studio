# Source library index

Index of the local library at `/Users/caseytalbot/Desktop/MASTER/VALKRYN` (201 files), plus three
sources outside it. Verified with `find`, `pdfinfo` (title, page count) and `pdftotext -l 2`
where the filename didn't make the title clear.

**Rule: agents use local sources only. Do not download from the internet.** Everything a
Profile Studio agent needs for doctrine, measures, test design, threat data or sensor physics is
already in this library or in the files listed below. If something seems missing, say so and
stop; don't fetch it.

## 00 - Start Here

| Path | Title | Pages | Use |
|---|---|---|---|
| `00 - Start Here/CUAS_Strategy_FactSheet.pdf` | Fact Sheet | 2 | C-UAS strategy framing, quick orientation |
| `00 - Start Here/Mission_Engineering_2023.pdf` | MEG 2.0 | 46 | Mission engineering vocabulary |
| `00 - Start Here/STAT COE Test Planning Handout Version 1.6 (Booklet).pdf` | STAT COE Test Planning Handout | 4 | Test design quick reference |
| `00 - Start Here/Survining_The_Swarm.pdf` | Surviving the Swarm (Army, CUI) | 46 | C-UAS TTPs, brigade and below; threat/doctrine vocabulary |
| `00 - Start Here/Avoiding_Categorical_Data.pdf` | (STAT) | 13 | duplicate of `STAT/Avoiding_Categorical_Data.pdf`; read the STAT translation instead |
| `00 - Start Here/Evaluating Delivered Test Plans for STAT Content.pdf` | (STAT) | 7 | duplicate of `STAT/Evaluation_Delivered_Test_Plans.pdf`; read the STAT translation instead |

## 01 - C-UAS Doctrine and Operations

| Path | Title | Pages | Use |
|---|---|---|---|
| `01 - C-UAS Doctrine and Operations/JIATF-401-PUBLISHES-TESTING-AND-EVALUATION-CRITERIA-TO-INFORM-FUTURE-DEMONSTRATIONS-AND-EXERCISES.pdf` | JIATF 401 Publishes T&E Criteria | 25 | **top 10.** Doctrine vocabulary, JIATF-401 criteria, the F2T2EA anchor Profile Studio's own `docs/reference/jiatf-401.md` already draws from |
| `01 - C-UAS Doctrine and Operations/CUAS TESTING METHEDOLOGY.pdf` | CEN CWA 18150: C-UAS Testing Methodology | 363 | **top 10.** Full CWA 18150 standard (the `CWA Testing/` chapter PDFs below are this same standard split by chapter); test design, scenario and measure definitions |
| `01 - C-UAS Doctrine and Operations/MethodsForAssessingCUASSystems.pdf` | Methods for Assessing the Effectiveness of Modern C-UAS Systems | 21 | **top 10.** Measures, effectiveness methodology |
| `01 - C-UAS Doctrine and Operations/Standardized Eval_CounterDrone.pdf` | Standardized Evaluation of Counter-Drone Systems | 27 | **top 10.** Measures and standardized test design |
| `01 - C-UAS Doctrine and Operations/AirDefense_FM_3_01.pdf` | FM 3-01 Air Defense | 218 | Air defense doctrine vocabulary |
| `01 - C-UAS Doctrine and Operations/Comprehensive-Approach-to-Counter-UAS.pdf` | JAPCC: A Comprehensive Approach to Countering UAS | 644 | C-UAS operational doctrine, threat taxonomy |
| `01 - C-UAS Doctrine and Operations/CUAS_OPS_ARMY_MAY25.pdf` | ATP 3-01.81 (Army C-UAS ops) | 106 | C-UAS operations doctrine vocabulary |
| `01 - C-UAS Doctrine and Operations/Small_UAS_Airspace_MGMT_Army.pdf` | Small UAS Airspace Management and Control | 34 | Airspace management vocabulary |
| `01 - C-UAS Doctrine and Operations/SmallDrones_BigProblems.pdf` | Small Drones, Big Problems | 100 | Threat data, small-UAS operational context |

## 02 - Conflict Lessons and Strategy

| Path | Title | Pages | Use |
|---|---|---|---|
| `02 - Conflict Lessons and Strategy/TacDev_Russo_Ukraine.pdf` | Tactical Developments During the Third Year of the Russo-Ukrainian War (RUSI) | 25 | Threat data: drone tactics observed in combat |
| `02 - Conflict Lessons and Strategy/Six_Key_Lessons_Ukraine.pdf` | Six Key Lessons from Ukraine's Drone War | 5 | Threat data, quick lessons |
| `02 - Conflict Lessons and Strategy/Combined_Arms_Warfare_UAS_CSIS.pdf` | Combined Arms Warfare and UAS: A New Era of Strategic Competition (CSIS) | 67 | Threat data, strategic context |
| `02 - Conflict Lessons and Strategy/Breaking the Shield_ Countering Drone Defenses.pdf` | Breaking the Shield | 10 | Threat data on countering C-UAS defenses (adversary perspective) |
| `02 - Conflict Lessons and Strategy/Strategic_Assessment_2025.pdf` | Strategic Assessment 2025 (NDU INSS) | 536 | Background strategic context; low priority for this project |

## 03 - AI, Modeling, and Experimentation

| Path | Title | Pages | Use |
|---|---|---|---|
| `03 - AI, Modeling, and Experimentation/DTE_OF_AI_FEB25.pdf` | Developmental T&E of AI-Enabled Systems Guidebook | 152 | Test design for AI-enabled systems, vocabulary for scoring/assessment |
| `03 - AI, Modeling, and Experimentation/Design_Eval_Experiements_D_Montgomery.pdf` | Design and Analysis of Experiments (Montgomery) | 749 | Statistical test-design reference, deep dive only |
| `03 - AI, Modeling, and Experimentation/DoD M&S Book of Knowledge.pdf` | DoD M&S Book of Knowledge | 182 | Modeling and simulation vocabulary |

## 04 - Systems and Technical Reference

| Path | Title | Pages | Use |
|---|---|---|---|
| `04 - Systems and Technical Reference/Air-and-Missile-Defense-Systems-Engineering.pdf` | Air and Missile Defense Systems Engineering | 268 | Sensor physics, engagement geometry reference |
| `04 - Systems and Technical Reference/Designing_Unmanned_Aircraft_Systems.pdf` | (untitled, UAS design textbook) | 856 | UAS performance/physics reference, deep dive only |
| `04 - Systems and Technical Reference/Principles-of-Naval-Weapon-Systems-Craig-Payne.pdf` | Principles of Naval Weapon Systems | 388 | Sensor/weapon system physics reference |
| `04 - Systems and Technical Reference/Test_Eval_WeaponSystems_R_McSheapdf.pdf` | Test and Evaluation of Aircraft Avionics and Weapon Systems (2nd ed.) | 1036 | T&E methodology for weapon systems, deep dive only |

## CWA Testing (CEN CWA 18150, split by chapter; same standard as the single file above)

| Path | Pages | Use |
|---|---|---|
| `CWA Testing/Chapter 1 - Scope.pdf` | 14 | Standard scope |
| `CWA Testing/Chapter 2 - Normative References.pdf` | 1 | References list |
| `CWA Testing/Chapter 3 - Terms and Definitions.pdf` | 2 | Doctrine vocabulary, terminology |
| `CWA Testing/Chapter 4 - Abbreviations and Symbols.pdf` | 1 | Abbreviations reference |
| `CWA Testing/Chapter 5 - Incidents Analysis and Identification of Gaps.pdf` | 11 | Threat data: incident analysis |
| `CWA Testing/Chapter 6 - Review of Current C-UAS Frameworks (Methods & Technologies).pdf` | 65 | Sensor physics, C-UAS technology survey |
| `CWA Testing/Chapter 7 - Development of Standard Scenarios.pdf` | 11 | **top 10.** Test design: standard scenario development, directly relevant to vignette building |
| `CWA Testing/Chapter 8 - Risk Analysis and Metrics Definition.pdf` | 13 | **top 10.** Measures: risk analysis and metric definitions |
| `CWA Testing/Chapter 9 - Operational Needs for C-UAS Coverage.pdf` | 26 | Operational requirements vocabulary |
| `CWA Testing/Chapter 10 - C-UAS System Performance Requirements and Metrics.pdf` | 28 | **top 10.** Measures: performance requirements and metrics, the closest standards match to DroneScore |
| `CWA Testing/Chapter 11 - C-UAS System Evaluation Framework.pdf` | 25 | **top 10.** Test design: evaluation framework |
| `CWA Testing/Chapter 12 - Test Environment.pdf` | 20 | Test design: range/environment conditions |
| `CWA Testing/Chapter 13 - Performance Evaluation of C-UAS Systems.pdf` | 19 | **top 10.** Measures and test design: performance evaluation methodology |
| `CWA Testing/Annexes A-H and Bibliography.pdf` | 128 | Reference annexes, consult on demand |

## STAT (statistical test and analysis techniques)

Has its own index at `STAT/README.md`. Rule stated there, and repeated here: **read the
Markdown translation in `STAT/Translations/`, not the PDF** — each translation carries the full
technical content of its source PDF in STAT COE corpus terminology. Open a PDF only to verify a
quote, table, or figure.

| Translation | Use |
|---|---|
| `STAT/Translations/01_Test_Planning_Guide.md` | **top 10.** Test design: SUMO objectives, the STAT COE test-planning spine |
| `STAT/Translations/02_Reqs_Effective_Test_Planning.md` | Test design: requirement-to-objective chain |
| `STAT/Translations/03_Controlling_Conditions.md` | Test design: environmental/nuisance factors |
| `STAT/Translations/04_Critical_Stat_Questions.md` | Test design: self-check questions for a plan |
| `STAT/Translations/05_Full_Factorial_Designs.md` | Test design: factorial experiment design |
| `STAT/Translations/06_Sequential_Experiments.md` | Test design: screen → characterize → stress → confirm sequencing |
| `STAT/Translations/07_Logistic_Regression.md` | Measures: binary-response analysis |
| `STAT/Translations/08_Avoiding_Categorical_Data.md` | Measures: prefer continuous responses |
| `STAT/Translations/09_Design_Tests_For_Prediction.md` | Test design: prediction-oriented designs |
| `STAT/Translations/10_Evaluation_Delivered_Test_Plans.md` | Test design: checklist for a finished plan |
| `STAT/Translations/11_Best_Practices_Autonomous_Systems.md` | Measures: autonomy-specific measures, directly relevant to drone/CUAS autonomy |
| `STAT/STAT_Study_Guide_5-Day.md` | Synthesis across the corpus; compresses, doesn't replace the translations |
| `STAT/Capstone/` | Worked capstone exercise (scripts + synthetic data), example only |

## ITEA Articles

Has its own index at `ITEA Artiles/README.md`. 21 articles on T&E methodology, converted to
Markdown in `ITEA Artiles/markdown/` (also duplicated under `notion-import/`). General T&E
methodology vocabulary; none individually critical to Profile Studio. Of note for this project:
`04_Advancing_the_Test_Science_of_LLM_Enabled_Systems.md` and `19_Mission_Engineering.md`.

## Pulling Guard Case Study

A separate, already-delivered case study (DARPA Pulling Guard test plan), not Profile Studio
source material itself, but its index (`Pulling Guard Case Study/00_INDEX.md`) is a worked
example of applying this same STAT + C-UAS corpus to a real test plan, with its own
`02_Reference/Valkryn_Working/09-measures.md` measures catalog. Useful as a worked-example
reference for test-plan structure, not as a primary source.

## 000 - Inbox

| Path | Title | Pages | Use |
|---|---|---|---|
| `000 - Inbox/DoD5000_101_OpTE_AI_Autom.pdf` | DoD Manual 5000.101: OT&E and LFT&E of AI-Enabled and Autonomous Systems | 25 | Test design: DoD AI/autonomy T&E manual |
| `000 - Inbox/DoD5000_99_FullSpecSurvivabilityLethality.pdf` | DoD Manual 5000.99: Realistic Full Spectrum Survivability and Lethality Testing | 45 | Measures: survivability/lethality test methodology |

## Ungrouped (top level of VALKRYN, outside the named folders)

| Path | Title | Pages | Use |
|---|---|---|---|
| `0220sigl 2  Guide to Developing an Effective Test Strategy V6.0.pdf` | STAT COE Test Planning Guide v6.0 | 55 | Test design, earlier version of `STAT/Test Planning Guide_2025.pdf` |
| `3_Test_Design_Process_single_slide_update_20170419.pdf` | Test Design Process | 1 | One-slide test-design process overview |
| `TestRangeStudy2021.pdf` | Necessary DoD Range Capabilities to Ensure Operational Superiority | 133 | Range/test-environment background |
| `Valkryn Checklists.xlsx` | (spreadsheet) | — | Checklists, not reviewed as a source document |
| `CTEP knowledge Exam Study Guide.docx` | (study guide) | — | CTEP exam prep, not a Profile Studio source |

## Top 10 for this project

1. `CWA Testing/Chapter 10 - C-UAS System Performance Requirements and Metrics.pdf`
2. `CWA Testing/Chapter 8 - Risk Analysis and Metrics Definition.pdf`
3. `CWA Testing/Chapter 13 - Performance Evaluation of C-UAS Systems.pdf`
4. `CWA Testing/Chapter 11 - C-UAS System Evaluation Framework.pdf`
5. `CWA Testing/Chapter 7 - Development of Standard Scenarios.pdf`
6. `01 - C-UAS Doctrine and Operations/CUAS TESTING METHEDOLOGY.pdf` (full CWA 18150)
7. `01 - C-UAS Doctrine and Operations/MethodsForAssessingCUASSystems.pdf`
8. `01 - C-UAS Doctrine and Operations/Standardized Eval_CounterDrone.pdf`
9. `01 - C-UAS Doctrine and Operations/JIATF-401-PUBLISHES-TESTING-AND-EVALUATION-CRITERIA-TO-INFORM-FUTURE-DEMONSTRATIONS-AND-EXERCISES.pdf`
10. `STAT/Translations/01_Test_Planning_Guide.md`

## Sources outside the VALKRYN library

| Path | What |
|---|---|
| `/Users/caseytalbot/Desktop/DroneScore Metric List.md` | Gold standard. Name every measure by its DroneScore ID and name; this is the controlling measure list for Profile Studio. |
| `/Users/caseytalbot/projects/rangeboard/docs/te-compilation/12-jiatf401.md` | JIATF-401 case study notes, compiled from the rangeboard project. |
| `~/.claude/skills/stat-te-terminology` | Skill enforcing STAT COE / DoD T&E vocabulary. Use for all user-facing T&E wording, per `profile-studio/CLAUDE.md`. |

All three paths verified to exist on this machine.
