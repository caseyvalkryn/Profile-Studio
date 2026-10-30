import type { Scenario } from '../model/types';
import { runSettings } from '../model/types';
import { applyOverrides } from '../model/applyOverrides';
import { idHash } from '../geometry/prng';
import { resolveEngagements } from './attrition';
import { resolvedThresholds } from './detection';
import { clipAtKill } from './killClip';
import { prepareFalseTracks, scenarioHorizonS } from './falseTracks';
import { monteCarloPolicy } from './policy';
import { assessAllThreats } from './sim';
import type { TrackEstimate } from './trackTypes';
import type { TrialManifest, TrialResult } from './trialTypes';
import { TRIAL_DRAW_POLICY_VERSION, TRIAL_ENGINE_REVISION } from './trialTypes';

/** One trial at nominal parameters under the aleatory policy; no ensemble sampling, no caches. */
export function runTrial(scenario: Scenario, manifest: TrialManifest): TrialResult {
  if (
    manifest.basis !== 'nominal-aleatory' ||
    manifest.drawPolicyVersion !== TRIAL_DRAW_POLICY_VERSION ||
    manifest.engineRevision !== TRIAL_ENGINE_REVISION
  )
    throw new Error('Incompatible trial engine or draw-policy revision');
  const settings = runSettings(scenario);
  if (
    !manifest.runId ||
    !manifest.basisSignature ||
    manifest.seed !== settings.seed ||
    manifest.sweepStepS !== settings.sweepStepS ||
    manifest.replicateIndex !== idHash(manifest.runId) ||
    !(manifest.buildRevision === null || typeof manifest.buildRevision === 'string')
  )
    throw new Error('Invalid trial manifest identity or seed');
  // The manifest's overrides are the values in force; the captured scenario keeps the library's.
  const s = applyOverrides(scenario, manifest.overrides);

  // Complete history for the engine return. The page copy is bound in retainTrial.ts.
  const observations: TrialResult['observations'] = [];
  const jamDecisions: TrialResult['jamDecisions'] = [];
  const tracks: TrackEstimate[] = [];
  const policy = monteCarloPolicy(manifest.seed, manifest.replicateIndex, resolvedThresholds(s));
  const draw = {
    ...policy,
    jam(probability: number, effectorId: string, uasId: string, tEffectS: number) {
      const outcome = policy.jam(probability, effectorId, uasId, tEffectS);
      jamDecisions.push({ probability, effectorId, uasId, tEffectS, outcome });
      return outcome;
    },
  };
  const assessments = assessAllThreats(
    s,
    draw,
    (observation) => observations.push(observation),
    (estimate) => tracks.push(estimate),
  );
  // False tracks (kind-9 draws only) join the trial's track history; the
  // operator queue in resolveEngagements reads the same load.
  const falseLoad = prepareFalseTracks(s, draw, scenarioHorizonS(s), (estimate) =>
    tracks.push(estimate),
  );
  const report = resolveEngagements(s, assessments, draw, falseLoad);
  // A dead threat holds no track: the sweep products end at the kill (killClip.ts).
  const clipped = clipAtKill({
    assessments,
    report,
    stepS: settings.sweepStepS,
    tracks,
    observations,
  });
  return {
    manifest: Object.freeze({ ...manifest }),
    assessments: clipped.assessments,
    report,
    observations: clipped.observations ?? observations,
    jamDecisions,
    tracks: clipped.tracks ?? tracks,
  };
}
