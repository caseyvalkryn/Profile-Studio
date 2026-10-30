import type { Entity, EntityKind, Scenario, SpecModel } from './types';
import { entityActive } from './types';
import { dist } from '../geometry/geo';
import { INTEGRATION_PROFILES } from './integrationData';

/**
 * System-of-systems integration model: which blue-force systems actually link,
 * over what medium, and on what published evidence. The facts live in
 * integrationData.ts (research-sourced, never invented here); this file is the
 * pure evaluation logic behind connect suggestions and typed connections.
 */

export type LinkMedium =
  'cable' | 'fiber' | 'mesh-radio' | 'proprietary-rf' | 'serial' | 'operator-manual';

export type IntegrationConfidence = 'documented' | 'probable' | 'inferred';

type LinkRole = 'track-data' | 'cue' | 'engage-order' | 'fc-uplink' | 'c2-interop' | 'alert';

interface IntegrationPair {
  withSpecId: string;
  role: LinkRole;
  confidence: IntegrationConfidence;
  medium?: LinkMedium;
  /** One sentence, shown in UI. */
  note: string;
  /** Short citation, shown in the Inspector. */
  source?: string;
}

export interface IntegrationProfile {
  specId: string;
  program?: string;
  /** 'faad-c2' | 'lattice' | 'sapient' | 'cot-tak' | 'link-16' | vendor slugs. */
  protocols: string[];
  media: LinkMedium[];
  /** Completes its kill-chain role with zero connections (own radar / operator-aimed). */
  standalone: boolean;
  pairs: IntegrationPair[];
  denied?: Array<{ withSpecId: string; reason: string }>;
  /** Effectors only. */
  guidance?: 'fc-uplink' | 'c2-cue' | 'self' | 'operator';
  /** Effectors with guidance 'fc-uplink': spec ids that satisfy the uplink. */
  fcSources?: string[];
  /** Effectors that only engage when routed through one of these C2 spec ids
      (e.g. Anvil and Roadrunner-M require Lattice). */
  requiredC2?: string[];
}

/** Per-hop latency planning factors, seconds. */
export const MEDIUM_LATENCY_S: Record<LinkMedium, number> = {
  cable: 0.5,
  fiber: 0.5,
  serial: 0.5,
  'mesh-radio': 1,
  'proprietary-rf': 1,
  'operator-manual': 8,
};

/**
 * Proximity radius that triggers a connect suggestion (and auto-connect for
 * documented pairs), meters. Site-laydown planning factors, not literal cable
 * lengths: 'cable' means co-located on one site's wired network.
 */
export const MEDIUM_SUGGEST_RADIUS_M: Record<LinkMedium, number> = {
  cable: 1500,
  serial: 500,
  fiber: 10000,
  'mesh-radio': 20000,
  'proprietary-rf': 15000,
  'operator-manual': 2000,
};

interface IntegrationVerdict {
  ok: boolean;
  role: LinkRole;
  confidence: IntegrationConfidence | null;
  medium: LinkMedium | null;
  /** Connection label, e.g. 'track data'. */
  label: string;
  /** Rationale or denial reason. */
  note: string;
  source?: string;
  latencyS: number;
}

const ROLE_LABELS: Record<LinkRole, string> = {
  'track-data': 'track data',
  cue: 'direct cue',
  'engage-order': 'engage order',
  'fc-uplink': 'fc uplink',
  'c2-interop': 'c2 interop',
  alert: 'alert',
};

const CONFIDENCE_RANK: Record<IntegrationConfidence, number> = {
  documented: 0,
  probable: 1,
  inferred: 2,
};

/** Protocol slugs that are open interoperability standards, not one vendor's API. */
const OPEN_STANDARDS = new Set(['faad-c2', 'lattice', 'sapient', 'cot-tak', 'link-16']);

/** Fastest, most deterministic first; ties in latency break toward wired. */
const MEDIUM_PREFERENCE: LinkMedium[] = [
  'cable',
  'fiber',
  'serial',
  'mesh-radio',
  'proprietary-rf',
  'operator-manual',
];

const PROFILES_BY_ID = new Map(INTEGRATION_PROFILES.map((p) => [p.specId, p]));

export function profileFor(specId: string | null): IntegrationProfile | null {
  if (!specId) return null;
  return PROFILES_BY_ID.get(specId) ?? null;
}

/**
 * Roles a link may carry for each kill-chain-directional kind pair; the first
 * entry is the default role (defaultConnectionLabel semantics). Null = the
 * pair is not a kill-chain direction and never evaluates.
 */
function directionRoles(from: EntityKind, to: EntityKind): LinkRole[] | null {
  if (from === 'sensor' && to === 'c2') return ['track-data', 'alert'];
  if (from === 'c2' && to === 'effector') return ['engage-order', 'cue', 'fc-uplink'];
  if (from === 'sensor' && to === 'effector') return ['cue', 'fc-uplink', 'track-data', 'alert'];
  if (from === 'c2' && to === 'c2') return ['c2-interop', 'track-data'];
  return null;
}

function bestSharedMedium(a: IntegrationProfile, b: IntegrationProfile): LinkMedium | null {
  for (const m of MEDIUM_PREFERENCE) {
    if (a.media.includes(m) && b.media.includes(m)) return m;
  }
  return null;
}

/**
 * Judge one directed link. Rule order: kind gate, denied pair, explicit
 * researched pair, shared-protocol fallback, else null (no basis to link).
 */
export function evaluateIntegration(from: SpecModel, to: SpecModel): IntegrationVerdict | null {
  const roles = directionRoles(from.kind, to.kind);
  if (!roles) return null;
  const fromProfile = profileFor(from.id);
  const toProfile = profileFor(to.id);
  if (!fromProfile || !toProfile) return null;
  const defaultRole = roles[0];

  const denial =
    fromProfile.denied?.find((d) => d.withSpecId === to.id) ??
    toProfile.denied?.find((d) => d.withSpecId === from.id);
  if (denial) {
    return {
      ok: false,
      role: defaultRole!,
      confidence: null,
      medium: null,
      label: ROLE_LABELS[defaultRole!],
      note: denial.reason,
      latencyS: 0,
    };
  }

  // Explicit pair from either profile; best confidence wins, from-side first.
  const candidates = [
    ...fromProfile.pairs.filter((p) => p.withSpecId === to.id && roles.includes(p.role)),
    ...toProfile.pairs.filter((p) => p.withSpecId === from.id && roles.includes(p.role)),
  ];
  if (candidates.length > 0) {
    let best = candidates[0]!;
    for (const c of candidates) {
      if (CONFIDENCE_RANK[c.confidence] < CONFIDENCE_RANK[best.confidence]) best = c;
    }
    const medium = best.medium ?? bestSharedMedium(fromProfile, toProfile);
    return {
      ok: true,
      role: best.role,
      confidence: best.confidence,
      medium,
      label: ROLE_LABELS[best.role],
      note: best.note,
      source: best.source,
      latencyS: medium ? MEDIUM_LATENCY_S[medium] : 0,
    };
  }

  const shared = fromProfile.protocols.find((p) => toProfile.protocols.includes(p));
  if (shared) {
    const medium = bestSharedMedium(fromProfile, toProfile);
    return {
      ok: true,
      role: defaultRole!,
      confidence: OPEN_STANDARDS.has(shared) ? 'probable' : 'inferred',
      medium,
      label: ROLE_LABELS[defaultRole!],
      note: `Both sides speak ${shared}; no published pairing.`,
      latencyS: medium ? MEDIUM_LATENCY_S[medium] : 0,
    };
  }
  return null;
}

export interface SuggestedLink {
  fromId: string;
  toId: string;
  verdict: IntegrationVerdict;
}

const LINKABLE_KINDS = new Set<EntityKind>(['sensor', 'effector', 'c2']);

/** Kill-chain direction from kinds; c2<->c2 keeps `a` as from. */
export function linkDirection(a: Entity, b: Entity): { fromId: string; toId: string } {
  const aIsFrom = a.kind === 'sensor' || (a.kind === 'c2' && b.kind !== 'sensor');
  return aIsFrom ? { fromId: a.id, toId: b.id } : { fromId: b.id, toId: a.id };
}

/**
 * Connect suggestions for one placed entity: nearby compatible systems in the
 * kill-chain direction implied by kinds, best evidence first, capped at 6.
 */
export function suggestLinksFor(scenario: Scenario, entityId: string): SuggestedLink[] {
  const entity = scenario.entities.find((e) => e.id === entityId);
  if (!entity || !LINKABLE_KINDS.has(entity.kind) || !entityActive(entity)) return [];
  const spec = scenario.library.find((m) => m.id === entity.specId);
  if (!spec) return [];

  const found: Array<SuggestedLink & { d: number }> = [];
  for (const other of scenario.entities) {
    if (other.id === entity.id || !LINKABLE_KINDS.has(other.kind) || !entityActive(other)) continue;
    const otherSpec = scenario.library.find((m) => m.id === other.specId);
    if (!otherSpec) continue;
    const { fromId } = linkDirection(entity, other);
    const entityIsFrom = fromId === entity.id;
    const fromEnt = entityIsFrom ? entity : other;
    const toEnt = entityIsFrom ? other : entity;
    const verdict = evaluateIntegration(
      entityIsFrom ? spec : otherSpec,
      entityIsFrom ? otherSpec : spec,
    );
    if (!verdict || !verdict.ok) continue;
    const d = dist(entity.pos, other.pos);
    if (d > MEDIUM_SUGGEST_RADIUS_M[verdict.medium ?? 'operator-manual']) continue;
    // c2-c2 interop is mutual in routing, so either stored direction counts.
    const mutual = fromEnt.kind === 'c2' && toEnt.kind === 'c2';
    if (
      scenario.connections.some(
        (c) =>
          (c.fromId === fromEnt.id && c.toId === toEnt.id) ||
          (mutual && c.fromId === toEnt.id && c.toId === fromEnt.id),
      )
    )
      continue;
    found.push({ fromId: fromEnt.id, toId: toEnt.id, verdict, d });
  }

  found.sort(
    (a, b) =>
      CONFIDENCE_RANK[a.verdict.confidence ?? 'inferred'] -
        CONFIDENCE_RANK[b.verdict.confidence ?? 'inferred'] || a.d - b.d,
  );
  return found.slice(0, 6).map(({ fromId, toId, verdict }) => ({ fromId, toId, verdict }));
}

export interface IntegrationPartner {
  specId: string;
  name: string;
  role: LinkRole;
  confidence: IntegrationConfidence;
  note: string;
  source?: string;
}

/**
 * What a system is known to integrate with, for the Inspector and the
 * no-candidates connect popup. Pure library-level facts: canvas proximity and
 * existing connections play no part here.
 */
interface IntegrationSummary {
  program: string | null;
  standalone: boolean;
  /** Known partners that exist in the library, documented first. */
  partners: IntegrationPartner[];
  denied: Array<{ specId: string; name: string; reason: string }>;
  /** Kill-chain needs in one sentence group; null when none apply. */
  guidance: string | null;
}

export function integrationSummary(
  specId: string | null,
  library: SpecModel[],
): IntegrationSummary | null {
  const profile = profileFor(specId);
  if (!profile) return null;
  const names = new Map(library.map((m) => [m.id, m.name]));

  // Pairs and denials may be authored on either side; fold both in.
  const partners = new Map<string, IntegrationPartner>();
  const consider = (withSpecId: string, p: IntegrationPair) => {
    const name = names.get(withSpecId);
    if (!name) return;
    const prev = partners.get(withSpecId);
    if (prev && CONFIDENCE_RANK[prev.confidence] <= CONFIDENCE_RANK[p.confidence]) return;
    partners.set(withSpecId, {
      specId: withSpecId,
      name,
      role: p.role,
      confidence: p.confidence,
      note: p.note,
      source: p.source,
    });
  };
  for (const p of profile.pairs) consider(p.withSpecId, p);
  for (const other of INTEGRATION_PROFILES) {
    if (other.specId === profile.specId) continue;
    for (const p of other.pairs) if (p.withSpecId === profile.specId) consider(other.specId, p);
  }

  const denied = new Map<string, { specId: string; name: string; reason: string }>();
  const deny = (withSpecId: string, reason: string) => {
    const name = names.get(withSpecId);
    if (name && !denied.has(withSpecId))
      denied.set(withSpecId, { specId: withSpecId, name, reason });
  };
  for (const d of profile.denied ?? []) deny(d.withSpecId, d.reason);
  for (const other of INTEGRATION_PROFILES) {
    for (const d of other.denied ?? [])
      if (d.withSpecId === profile.specId) deny(other.specId, d.reason);
  }
  for (const id of denied.keys()) partners.delete(id);

  const nameList = (ids: string[]) =>
    ids
      .map((id) => names.get(id))
      .filter(Boolean)
      .join(' or ');
  const parts: string[] = [];
  if (profile.guidance === 'fc-uplink' && profile.fcSources?.length) {
    parts.push(`Needs a fire-control track from ${nameList(profile.fcSources)}.`);
  }
  if (profile.requiredC2?.length)
    parts.push(`Engages only through ${nameList(profile.requiredC2)}.`);
  if (profile.guidance === 'operator') parts.push('Operator-aimed; no network integration.');
  if (profile.standalone) parts.push('Can complete its role with no connections.');

  return {
    program: profile.program ?? null,
    standalone: profile.standalone,
    partners: [...partners.values()].sort(
      (a, b) =>
        CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
        a.name.localeCompare(b.name),
    ),
    denied: [...denied.values()],
    guidance: parts.length > 0 ? parts.join(' ') : null,
  };
}

export interface PartnerInstance {
  entityId: string;
  name: string;
  distM: number;
  /** A connection exists between the entity and this instance, either direction. */
  linked: boolean;
  /** Within MEDIUM_SUGGEST_RADIUS_M of the verdict medium (operator-manual when none). */
  inRange: boolean;
}

export interface BoardPartner extends IntegrationPartner {
  /** A member of requiredC2 or, under fc-uplink guidance, of fcSources. */
  required: boolean;
  /** Active board instances of this spec, nearest first. */
  instances: PartnerInstance[];
}

export interface MissingRequirement {
  kind: 'required-c2' | 'fc-source';
  /** Library names of the group members, documented order. */
  names: string[];
}

export interface IntegrationBoardStatus {
  program: string | null;
  standalone: boolean;
  guidance: string | null;
  partners: BoardPartner[];
  /** Requirement groups with no member on the board. */
  missing: MissingRequirement[];
}

/**
 * The library-level integration summary joined to the board: which known
 * partners are placed, linked and in suggest range, and which requirement
 * groups (requiredC2, fc-uplink fcSources) have no member placed.
 */
export function integrationBoardStatus(
  scenario: Scenario,
  entityId: string,
): IntegrationBoardStatus | null {
  const entity = scenario.entities.find((e) => e.id === entityId);
  if (!entity) return null;
  const profile = profileFor(entity.specId);
  const summary = integrationSummary(entity.specId, scenario.library);
  if (!profile || !summary) return null;
  const spec = scenario.library.find((m) => m.id === entity.specId);

  const fcSources = profile.guidance === 'fc-uplink' ? (profile.fcSources ?? []) : [];
  const requiredC2 = profile.requiredC2 ?? [];
  const required = new Set([...requiredC2, ...fcSources]);
  const active = scenario.entities.filter((e) => e.id !== entity.id && entityActive(e));

  const instancesOf = (specId: string): PartnerInstance[] => {
    const otherSpec = scenario.library.find((m) => m.id === specId);
    return active
      .filter((e) => e.specId === specId)
      .map((other) => {
        const { fromId } = linkDirection(entity, other);
        const entityIsFrom = fromId === entity.id;
        const verdict =
          spec && otherSpec
            ? evaluateIntegration(entityIsFrom ? spec : otherSpec, entityIsFrom ? otherSpec : spec)
            : null;
        const distM = dist(entity.pos, other.pos);
        return {
          entityId: other.id,
          name: other.name,
          distM,
          linked: scenario.connections.some(
            (c) =>
              (c.fromId === entity.id && c.toId === other.id) ||
              (c.fromId === other.id && c.toId === entity.id),
          ),
          inRange:
            verdict != null &&
            verdict.ok &&
            distM <= MEDIUM_SUGGEST_RADIUS_M[verdict.medium ?? 'operator-manual'],
        };
      })
      .sort((a, b) => a.distM - b.distM);
  };

  // A group is satisfied when any one member has an active instance.
  const names = new Map(scenario.library.map((m) => [m.id, m.name]));
  const placed = new Set(active.map((e) => e.specId));
  const missing: MissingRequirement[] = [];
  const unsatisfied = new Set<string>();
  const group = (kind: MissingRequirement['kind'], ids: string[]) => {
    if (ids.length === 0 || ids.some((id) => placed.has(id))) return;
    for (const id of ids) unsatisfied.add(id);
    missing.push({ kind, names: ids.map((id) => names.get(id) ?? id) });
  };
  group('required-c2', requiredC2);
  group('fc-source', fcSources);

  const partners: BoardPartner[] = summary.partners.map((p) => ({
    ...p,
    required: required.has(p.specId),
    instances: instancesOf(p.specId),
  }));
  // Shared-protocol partners have no researched pair, so the summary omits them;
  // fold in those in suggest range, and those already linked so a row survives
  // its own Connect.
  const known = new Set(partners.map((p) => p.specId));
  const linkedIds = new Set(
    scenario.connections.flatMap((c) =>
      c.fromId === entity.id ? [c.toId] : c.toId === entity.id ? [c.fromId] : [],
    ),
  );
  const extra: SuggestedLink[] = [...suggestLinksFor(scenario, entity.id)];
  for (const other of active) {
    if (!linkedIds.has(other.id) || !spec) continue;
    const otherSpec = scenario.library.find((m) => m.id === other.specId);
    if (!otherSpec) continue;
    const { fromId, toId } = linkDirection(entity, other);
    const entityIsFrom = fromId === entity.id;
    const verdict = evaluateIntegration(
      entityIsFrom ? spec : otherSpec,
      entityIsFrom ? otherSpec : spec,
    );
    if (verdict?.ok) extra.push({ fromId, toId, verdict });
  }
  for (const link of extra) {
    const otherId = link.fromId === entity.id ? link.toId : link.fromId;
    const otherSpecId = scenario.entities.find((e) => e.id === otherId)?.specId;
    const otherSpec = scenario.library.find((m) => m.id === otherSpecId);
    if (!otherSpec || known.has(otherSpec.id)) continue;
    known.add(otherSpec.id);
    partners.push({
      specId: otherSpec.id,
      name: otherSpec.name,
      role: link.verdict.role,
      confidence: link.verdict.confidence ?? 'inferred',
      note: link.verdict.note,
      source: undefined,
      required: false,
      instances: instancesOf(otherSpec.id),
    });
  }
  // Members of an unsatisfied requirement group, then placed with an unlinked
  // instance, then not placed, then fully linked.
  const bucket = (p: BoardPartner) =>
    unsatisfied.has(p.specId)
      ? 0
      : p.instances.some((i) => !i.linked)
        ? 1
        : p.instances.length === 0
          ? 2
          : 3;
  partners.sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      a.name.localeCompare(b.name),
  );

  return {
    program: summary.program,
    standalone: summary.standalone,
    guidance: summary.guidance,
    partners,
    missing,
  };
}
