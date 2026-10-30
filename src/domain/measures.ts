// DroneScore C4 measure table as data. Source: docs/reference/dronescore-measures.md (67 rows).
// sourceClass: spec section 4. step: docs/reference/jiatf-401.md section c. Areas 4 and 5 sit
// outside the chain and carry step 'system'. Target has no measures by rule.

export type SourceClass = 'simulated' | 'entered' | 'derived' | 'not-simulated';
export type Step = 'find' | 'fix' | 'track' | 'target' | 'engage' | 'assess' | 'system';
export type MeasureArea = 1 | 2 | 3 | 4 | 5;

export type Measure = {
  id: string;
  name: string;
  area: MeasureArea;
  unit: string;
  /** "What is recorded", in DroneScore words. */
  recorded: string;
  /** Where DroneScore keeps the value (run:, day:, profile:, verdict:, or computed). */
  stored: string;
  collectedBy: string;
  sourceClass: SourceClass;
  step: Step;
};

export const MEASURE_AREAS: Record<MeasureArea, string> = {
  1: 'Detection & Tracking',
  2: 'Classification & Identification',
  3: 'Threat Defeat & Denial',
  4: 'System Interoperability & Reliability',
  5: 'Operational Viability',
};

export const STEPS: readonly Step[] = [
  'find',
  'fix',
  'track',
  'target',
  'engage',
  'assess',
  'system',
];

const S = 'simulated',
  E = 'entered',
  D = 'derived',
  N = 'not-simulated';

type Row = [string, string, MeasureArea, string, string, string, string, SourceClass, Step];

// prettier-ignore
const ROWS: Row[] = [
  // 1. Detection & Tracking
  ['1.1.1', 'Probability of Detection', 1, '%', 'Was the target detected?', 'run: stage_reached', 'GCS log', S, 'find'],
  ['1.1.2', 'Detection Range (ground)', 1, 'm', 'Ground distance to the target at first detection (m)', 'run: detect_range_m', 'GCS log + TSPI', S, 'find'],
  ['1.1.3', 'Detection Range (slant)', 1, 'm', 'Straight-line distance at first detection (m), from ground distance and altitude', 'run: detect_range_m, detect_alt_m', 'GCS log + TSPI', S, 'find'],
  ['1.1.4', 'False Alarm Rate', 1, 'per hour', 'False detections per operating hour', 'run: false_alarms · day: operating_minutes', 'GCS log + Day closeout', N, 'find'],
  ['1.1', 'Detection Range KPP', 1, 'km', 'Mean detection range (km)', 'same value as MOP 1.1.2', 'GCS log + TSPI', S, 'find'],
  ['1.2', 'Detection Accuracy', 1, '%', 'Detection rate (%)', 'same value as MOP 1.1.1', 'GCS log', S, 'find'],
  ['1.3', 'Field of View', 1, 'deg', 'Sensor coverage (deg)', 'profile: 1.3', 'Vendor sheet', E, 'find'],
  ['1.4', 'Min Altitude', 1, 'm AGL', 'Lowest altitude the sensor detects (m above ground)', 'profile: 1.4', 'Vendor sheet', E, 'find'],
  ['1.5', 'Max Altitude', 1, 'm AGL', 'Highest altitude at first detection (m above ground)', 'run: detect_alt_m (maximum)', 'GCS log + TSPI', S, 'find'],
  ['1.6', 'Detection Quantity', 1, 'targets', 'Targets detected at the same time', 'profile: 1.6', 'Vendor sheet', E, 'find'],
  ['1.7', 'Detection Automation', 1, 'Y/N', 'Does the system turn detections into tracks by itself? (Y/N)', 'profile: 1.7', 'Vendor sheet', E, 'find'],
  ['1.8', 'Resolution', 1, 'm', 'Closest spacing at which two targets show as two (m)', 'profile: 1.8', 'Vendor sheet', E, 'find'],
  ['1.2.1', 'Probability of Track', 1, '%', 'Did the detected target become a track?', 'run: stage_reached', 'GCS log', S, 'fix'],
  ['1.2.2', 'Track Continuity', 1, '%', 'Share of time the track was held (%)', 'run: track_continuity_pct', 'GCS log', S, 'track'],
  ['1.2.3', 'Track Accuracy', 1, 'm', 'Track position error against true position (m, 3D)', 'run: track_error_m', 'GCS log + TSPI', S, 'fix'],
  ['2.1', 'Track Range', 1, 'km', 'Distance at which a continuous track is held (km)', 'profile: 2.1', 'Vendor sheet', E, 'track'],
  ['2.2', 'Track Accuracy KPP', 1, '± %', 'Error in reported position and speed (± %)', 'profile: 2.2', 'Vendor sheet', E, 'track'],
  ['2.3', 'Track Quantity', 1, 'targets', 'Targets tracked at the same time', 'profile: 2.3', 'Vendor sheet', E, 'track'],
  ['2.4', 'Track Automation', 1, 'Y/N', 'Does the system follow target maneuvers by itself? (Y/N)', 'profile: 2.4', 'Vendor sheet', E, 'track'],
  ['2.5', 'Update / Revisit Rate', 1, 'per s', 'Track updates per second', 'profile: 2.5', 'Vendor sheet', E, 'track'],
  // 2. Classification & Identification
  ['2.1.1', 'Probability of Correct Classification', 2, '%', 'Was the tracked target classified as a drone?', 'run: stage_reached', 'GCS log', S, 'fix'],
  ['2.1.2', 'Probability of Correct Identification', 2, '%', 'Was the drone type identified correctly?', 'run: stage_reached, identified_ok', 'GCS log', S, 'track'],
  ['2.1.3', 'Identification Range', 2, 'm', 'Distance to the target at correct identification (m)', 'run: id_range_m', 'GCS log + TSPI', S, 'track'],
  ['2.1.3t', 'Identification Time', 2, 's', 'Time to correct identification (s)', 'run: id_time_s', 'GCS log', S, 'track'],
  ['2.1.4', 'Mis-Identification Rate', 2, '%', 'Share of identifications that were wrong (%)', 'run: identified_ok', 'GCS log', S, 'track'],
  ['3a.1', 'Classification Range', 2, 'km', 'Distance for positive classification as a drone (km)', 'profile: 3a.1', 'Vendor sheet', E, 'fix'],
  ['3a.2', 'Classification Accuracy', 2, '%', 'Classification rate (%)', 'same value as MOP 2.1.1', 'GCS log', S, 'fix'],
  ['3a.3', 'Classification Automation', 2, 'Y/N', 'Does sensor fusion classify by itself? (Y/N)', 'profile: 3a.3', 'Vendor sheet', E, 'fix'],
  ['3b.1', 'Identification Range KPP', 2, 'km', 'Mean identification range (km)', 'same value as MOP 2.1.3', 'GCS log + TSPI', S, 'track'],
  ['3b.2', 'Identification Automation', 2, 'Y/N', 'Does sensor fusion identify the type by itself? (Y/N)', 'profile: 3b.2', 'Vendor sheet', E, 'track'],
  // 3. Threat Defeat & Denial
  ['3.1.1', 'Probability of Engagement', 3, '%', 'Was the identified target engaged?', 'run: stage_reached', 'GCS log', S, 'engage'],
  ['3.1.2', 'Probability of Kill (Pk)', 3, '%', 'Was the engaged target defeated? (Success, Miss, No Attempt)', 'run: outcome', 'Scorer', S, 'assess'],
  ['3.1.3', 'Defeat Range', 3, 'm', 'Distance to the target at defeat (m)', 'run: engagement_range_m', 'TSPI', S, 'engage'],
  ['3.1.4', 'Defeat Engagement Time', 3, 's', 'Seconds from engage command to defeat', 'run: time_to_intercept_s', 'Scorer or GCS log', S, 'engage'],
  ['5.1', 'Defeat Range KPP', 3, 'km', 'Mean defeat range (km)', 'same value as MOP 3.1.3', 'TSPI', S, 'assess'],
  ['5.2', 'Quantity (Simultaneous)', 3, 'targets', 'Targets defeated at the same time', 'profile: 5.2', 'Vendor sheet', E, 'assess'],
  ['5.2e', 'Quantity (Kinetic)', 3, 'targets', 'Targets a kinetic system defeats at the same time', 'profile: 5.2e', 'Vendor sheet', E, 'assess'],
  ['5.3', 'Quantity (Over Time)', 3, 'per hour', 'Defeats per hour from one launcher, from Pk, reload time and engagement time', 'computed', 'Derived', D, 'assess'],
  ['5.4', 'Effectiveness (Pk)', 3, '%', 'Pk (%)', 'same value as MOP 3.1.2', 'Scorer', S, 'assess'],
  ['5.4e', 'Effectiveness (Kinetic)', 3, '%', 'Pk for a kinetic system (%)', 'same value as MOP 3.1.2', 'Scorer', S, 'assess'],
  ['5.5', 'Launcher Capacity', 3, 'interceptors', 'Interceptors loaded at one time', 'profile: 5.5', 'Vendor sheet', E, 'assess'],
  ['5.5b', 'Cyclic Rate', 3, 'per min', 'Engagements per minute', 'profile: 5.5b', 'Vendor sheet', E, 'assess'],
  ['5.6', 'Engagements per Interceptor', 3, 'engagements', 'Engagements one interceptor can handle', 'profile: 5.6', 'Vendor sheet', E, 'assess'],
  ['5.7', 'Collateral Effects / Damage', 3, 'Y/N', 'Did effects stay inside the allowed limits? (Y/N)', 'profile: 5.7', 'TSPI', N, 'assess'],
  ['5.8', 'Cost per Engagement', 3, '$', 'Cost per defeat ($): unit cost × interceptors spent ÷ defeats', 'computed', 'Derived', D, 'assess'],
  ['INT-1', 'Interceptor Max Speed', 3, 'm/s', 'Interceptor top speed (m/s)', 'profile: INT-1', 'Vendor sheet', E, 'engage'],
  ['INT-2', 'Acceleration / G-Load', 3, 'g', 'Sustained acceleration (g)', 'profile: INT-2', 'Vendor sheet', E, 'engage'],
  ['INT-3', 'Intercept Envelope', 3, 'text', 'Reach by altitude, checked against flight endurance (text)', 'profile: INT-3', 'Derived', E, 'engage'],
  ['INT-4', 'Seeker Acquisition Range', 3, 'km', 'Distance at which the seeker locks the target (km)', 'profile: INT-4', 'GCS log + TSPI', E, 'engage'],
  ['INT-5', 'Probability of Lock', 3, '%', 'Seeker lock rate inside acquisition range (%)', 'profile: INT-5', 'GCS log', E, 'engage'],
  ['INT-6', 'Terminal Guidance Accuracy (CEP)', 3, 'm', 'Miss distance as circular error probable (m)', 'profile: INT-6', 'TSPI', E, 'engage'],
  ['INT-7', 'Mid-Course Update Capability', 3, 'Y/N', 'Takes target updates in flight? (Y/N)', 'profile: INT-7', 'Vendor sheet', E, 'engage'],
  ['INT-8', 'Kill Mechanism', 3, 'text', 'How it kills, such as hit-to-kill (text, not scored)', 'profile: INT-8', 'Vendor sheet', E, 'engage'],
  ['INT-9', 'Fuse / Detonation Performance', 3, '% / m', 'Fuse reliability and lethal radius (% / m)', 'profile: INT-9', 'TSPI', E, 'engage'],
  ['INT-10', 'Multi-Interceptor Coordination', 3, 'Y/N or #', 'Can several interceptors work together? (Y/N or #)', 'profile: INT-10', 'GCS log', E, 'engage'],
  ['INT-11', 'Reload / Magazine Cycle Time', 3, 's', 'Time to ready the next interceptor (s)', 'profile: INT-11', 'Vendor sheet', E, 'engage'],
  ['INT-12', 'Abort / Self-Destruct Capability', 3, 'Y/N', 'Has a safe abort or self-destruct? (Y/N)', 'profile: INT-12', 'Scorer (abort runs)', E, 'engage'],
  ['INT-13', 'Engagement Geometry Performance', 3, '%', 'Pk by approach: head-on, tail chase, crossing (%)', 'profile: INT-13', 'TSPI + Scorer', E, 'engage'],
  ['INT-14', 'Debris Characterization', 3, 'text / m', 'Debris field size and energy (text / m)', 'profile: INT-14', 'TSPI', E, 'engage'],
  // 4. System Interoperability & Reliability
  ['4.1.1', 'Impact on Co-located Systems', 4, 'Pass/Fail', 'Does it harm nearby systems? (Pass/Fail)', 'verdict: mop.4.1.1.verdict', 'Specialist test', N, 'system'],
  ['4.1.2', 'HERO / HERP / HERF', 4, 'Pass/Fail', 'Is it a hazard to ordnance, people or fuel? (Pass/Fail)', 'verdict: mop.4.1.2.verdict', 'Specialist test', N, 'system'],
  ['4.2.1', 'Mean Time Between System Abort', 4, 'min', 'Operating minutes ÷ system aborts (min)', 'day: operating_minutes, system_aborts', 'Day closeout or GCS log', N, 'system'],
  ['4.2.2', 'Mean Time to Repair', 4, 'min', 'Repair minutes ÷ system aborts (min)', 'day: repair_minutes, system_aborts', 'Day closeout', N, 'system'],
  // 5. Operational Viability
  ['5.1.1', 'RMF Compliance (ATO / ATC)', 5, 'Y/N', 'Has authority to operate and to connect? (Y/N)', 'verdict: mop.5.1.1.verdict', 'Specialist test', N, 'system'],
  ['5.2.1', 'Contested Environment Operation', 5, 'Y/N', 'Works under threat electronic attack? (Y/N)', 'verdict: mop.5.2.1.verdict', 'Specialist test', N, 'system'],
  ['5.3.1', 'Hazard Prevention', 5, 'Pass/Fail', 'Meets military safety standards? (Pass/Fail)', 'verdict: mop.5.3.1.verdict', 'Specialist test', N, 'system'],
  ['5.3.2', 'Collateral Damage Mitigation', 5, 'Y/N', 'Shares no-fire sectors with C2? (Y/N)', 'verdict: mop.5.3.2.verdict', 'Specialist test', N, 'system'],
];

export const MEASURES: readonly Measure[] = ROWS.map(
  ([id, name, area, unit, recorded, stored, collectedBy, sourceClass, step]) => ({
    id,
    name,
    area,
    unit,
    recorded,
    stored,
    collectedBy,
    sourceClass,
    step,
  }),
);

const BY_ID = new Map(MEASURES.map((m) => [m.id, m]));

export function measureById(id: string): Measure | undefined {
  return BY_ID.get(id);
}

export function measuresByStep(step: Step): Measure[] {
  return MEASURES.filter((m) => m.step === step);
}

export function measuresBySourceClass(sourceClass: SourceClass): Measure[] {
  return MEASURES.filter((m) => m.sourceClass === sourceClass);
}
