/**
 * Raid wave scheduling.
 * A RaidPlan groups UAS entities into waves; each wave adds a shared launch
 * delay on top of every member path's own startDelayS. Playback and analysis
 * both read the effective delay through effectivePathDelayS so they agree.
 */
import type { FlightPath, RaidPlan, Scenario } from '../model/types';

/** Index of the wave holding an entity, or null when unassigned. */
export function waveIndexFor(raid: RaidPlan | undefined, entityId: string): number | null {
  if (!raid) return null;
  const i = raid.waves.findIndex((w) => w.entityIds.includes(entityId));
  return i >= 0 ? i : null;
}

/** Extra launch delay from the entity's wave, seconds. Zero when unassigned. */
function waveDelayS(raid: RaidPlan | undefined, entityId: string): number {
  const i = waveIndexFor(raid, entityId);
  return i == null ? 0 : raid!.waves[i]!.startDelayS;
}

/** Effective start delay for a flight path: its own delay plus its wave's delay. */
export function effectivePathDelayS(scenario: Scenario, path: FlightPath): number {
  return path.startDelayS + waveDelayS(scenario.raid, path.entityId);
}

/** Wave timing for a raid build; THREAT_TACTICS (tactics.ts) carries these numbers. */
interface RaidTiming {
  /** UAS entities per wave; extra entities open follow-on waves. */
  shipsPerWave: number;
  /** Seconds between consecutive wave launches. */
  waveSpacingS: number;
}

/**
 * Build a raid plan: entities fill waves of shipsPerWave in the given order;
 * wave i launches at i * waveSpacingS.
 */
export function buildRaidPlan(timing: RaidTiming, entityIds: string[]): RaidPlan {
  const perWave = Math.max(1, Math.floor(timing.shipsPerWave));
  const waves: RaidPlan['waves'] = [];
  for (let i = 0; i < entityIds.length; i += perWave) {
    waves.push({
      startDelayS: waves.length * timing.waveSpacingS,
      entityIds: entityIds.slice(i, i + perWave),
    });
  }
  return { waves };
}
