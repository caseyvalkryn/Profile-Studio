import type { EffectorSpec, EnvironmentSpec, Spread, UasSpec } from '../../model/types';
import { opticalDwellAt } from '../directedEnergy';
import { assessHpmField, hpmRechargeS } from '../hpm';
import { kineticPk } from './kinetic';

/**
 * Beam effectors: what a directed-energy or HPM salvo spends and which
 * physical closure answers its effect. The laws themselves are in
 * directedEnergy.ts (irradiance and dwell to effect) and hpm.ts (field
 * strength against a susceptibility threshold).
 */

/** What a salvo costs the battery, as opposed to how it kills. */
export type ExpenditureChannel = 'kinetic' | 'directed-energy' | 'ew';

const EXPENDITURE_CHANNEL: Record<EffectorSpec['effectorType'], ExpenditureChannel> = {
  interceptor: 'kinetic',
  gun: 'kinetic',
  net: 'kinetic',
  de: 'directed-energy',
  hpm: 'directed-energy',
  jammer: 'ew',
};

/**
 * Expenditure channel of an effector type: what the salvo spent, distinct from
 * isHardKill (what it destroys). A DE or HPM burst is a hard kill that fires no
 * round, so it must not join the kinetic count.
 */
export function expenditureChannel(effectorType: EffectorSpec['effectorType']): ExpenditureChannel {
  return EXPENDITURE_CHANNEL[effectorType];
}

/** Which kill law answered a beam shot. */
export type BeamEffectMode = 'legacy' | 'de-dwell' | 'hpm-field';

/** Beam result consumed by the engagement adapter. */
export interface BeamEffect {
  mode: BeamEffectMode;
  pk: number;
  /** Assignment-to-effect delay. The legacy path keeps spec.engageTimeS. */
  effectDelayS: number;
  /** Optical dwell only, excluding settle. */
  dwellS: number;
  /** Seconds before the effector may commit again. */
  cooldownS: number;
}

export interface BeamEffectOptions {
  /** `legacyBeamPk` switch. */
  fallback?: boolean;
  /** HPM target angle from boresight. */
  offBoresightDeg?: number;
  /** Resolved dwell-field spread and its one commit-step uniform. */
  fluenceSpread?: Spread | null;
  fluenceDraw?: number | null;
  /** Already-resolved salvo cooldown, used by the legacy path. */
  legacyCooldownS: number;
}

/**
 * DE/HPM adapter with an exact kinetic fallback. A modeled DE removes the
 * kinetic distance/size/evasion penalties: it holds the beam until the
 * sampled fluence threshold. A modeled HPM shot has the base Pk only when
 * its inverse-distance field clears the airframe threshold inside the
 * half-power beamwidth. The caller still owns the one outcome draw.
 */
export function beamEffect(
  basePk: number,
  spec: EffectorSpec,
  uas: UasSpec | undefined,
  slantM: number,
  env: EnvironmentSpec,
  options: BeamEffectOptions,
): BeamEffect {
  const legacy = (): BeamEffect => ({
    mode: 'legacy',
    pk: kineticPk(basePk, spec.maxRangeM, uas, slantM),
    effectDelayS: spec.engageTimeS,
    dwellS: 0,
    cooldownS: options.legacyCooldownS,
  });
  if (options.fallback) return legacy();
  if (spec.effectorType === 'de') {
    const dwell = opticalDwellAt(
      spec,
      uas,
      slantM,
      env,
      options.fluenceSpread,
      options.fluenceDraw,
    );
    if (!dwell) return legacy();
    return {
      mode: 'de-dwell',
      pk: Math.min(1, Math.max(0, basePk)),
      effectDelayS: dwell.effectDelayS,
      dwellS: dwell.dwellS,
      cooldownS: options.legacyCooldownS,
    };
  }
  if (spec.effectorType === 'hpm') {
    const field = assessHpmField(spec, uas, slantM, options.offBoresightDeg);
    if (!field) return legacy();
    return {
      mode: 'hpm-field',
      pk: field.effective ? Math.min(1, Math.max(0, basePk)) : 0,
      effectDelayS: spec.engageTimeS,
      dwellS: 0,
      cooldownS: hpmRechargeS(spec, options.legacyCooldownS),
    };
  }
  return legacy();
}
