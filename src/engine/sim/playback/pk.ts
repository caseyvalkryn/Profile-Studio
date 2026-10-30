/**
 * Kill probability barrel. The kinetic terms (tables, falloff, kineticPk,
 * missDistanceSigmaM, isHardKill) live in pk/kinetic.ts, the beam terms
 * (expenditure channel, DE and HPM models) in pk/beam.ts. Every
 * name stays importable from here.
 */
export {
  CONTINUE_TRACK_DEGRADE,
  DEFAULT_PK,
  DEFAULT_SALVO_COOLDOWN_S,
  EVASION_PENALTY,
  FALLOFF_AT_MAX,
  SHIP_DEAD_BELOW,
  SIZE_PENALTY,
  distanceFalloff,
  falloffRangeM,
  isHardKill,
  kineticPk,
  missDistanceSigmaM,
} from './pk/kinetic';
export type { ExpenditureChannel } from './pk/beam';
export { expenditureChannel } from './pk/beam';
