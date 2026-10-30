import type { EnvironmentSpec, UasSpec, Vec2 } from '../model/types';
import {
  bearingDeg,
  destination,
  dist,
  pathLength,
  posAtTime,
  type PathSample,
} from '../geometry/geo';

const DEG = Math.PI / 180;
const EPS = 1e-9;

interface LineLeg {
  kind: 'line';
  from: Vec2;
  to: Vec2;
  headingDeg: number;
  lengthM: number;
}

interface ArcLeg {
  kind: 'arc';
  center: Vec2;
  radiusM: number;
  radialStartDeg: number;
  headingStartDeg: number;
  turnDeg: number;
  sign: -1 | 1;
  lengthM: number;
  to: Vec2;
}

type FlightLeg = LineLeg | ArcLeg;

interface FlightRoute {
  legs: FlightLeg[];
  lengthM: number;
  start: Vec2;
  end: Vec2;
  finalHeadingDeg: number;
}

/** Path edits replace the points array, so its identity safely owns compiled routes. */
const ROUTE_CACHE = new WeakMap<Vec2[], Map<string, FlightRoute>>();

/** True when the target states at least one Phase 3 flight limit. */
export function hasFlightLimits(uas: UasSpec | undefined): boolean {
  return (
    uas != null &&
    [uas.maxTurnRateDegS, uas.climbRateMps, uas.maxAccelMps2].some((value) => value != null)
  );
}

/** Constant-speed turn radius R = V / omega. */
export function turnRadiusM(speedMps: number, turnRateDegS: number): number {
  const omegaRadS = turnRateDegS * DEG;
  return omegaRadS > 0 ? Math.max(0, speedMps) / omegaRadS : Number.POSITIVE_INFINITY;
}

function signedTurnDeg(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

function addLine(legs: FlightLeg[], from: Vec2, to: Vec2): void {
  const lengthM = dist(from, to);
  if (lengthM <= EPS) return;
  legs.push({ kind: 'line', from, to, headingDeg: bearingDeg(from, to), lengthM });
}

/**
 * Replace each feasible waypoint vertex with a tangent circular fillet. The
 * radius is fixed by the path speed and maximum turn rate. A fillet that
 * cannot fit between adjacent vertices is left sharp rather than silently
 * shrinking its radius and exceeding the stated turn-rate limit.
 */
function buildRoute(
  points: Vec2[],
  speedMps: number,
  maxTurnRateDegS: number | null | undefined,
): FlightRoute {
  const start = points[0] ?? { x: 0, y: 0 };
  const end = points.at(-1) ?? start;
  if (points.length < 2 || !(speedMps > 0) || maxTurnRateDegS == null || !(maxTurnRateDegS > 0)) {
    const legs: FlightLeg[] = [];
    for (let i = 1; i < points.length; i += 1) addLine(legs, points[i - 1]!, points[i]!);
    const finalHeadingDeg =
      legs.at(-1)?.kind === 'line'
        ? (legs.at(-1) as LineLeg).headingDeg
        : points.length > 1
          ? bearingDeg(points[points.length - 2]!, end)
          : 0;
    return { legs, lengthM: pathLength(points), start, end, finalHeadingDeg };
  }

  const radiusM = turnRadiusM(speedMps, maxTurnRateDegS);
  const legs: FlightLeg[] = [];
  let current = start;

  for (let i = 1; i < points.length - 1; i += 1) {
    const vertex = points[i];
    const next = points[i + 1];
    const incomingHeading = bearingDeg(points[i - 1]!, vertex!);
    const outgoingHeading = bearingDeg(vertex!, next!);
    const signedDeg = signedTurnDeg(incomingHeading, outgoingHeading);
    const turnDeg = Math.abs(signedDeg);
    const angleRad = turnDeg * DEG;
    const tangentM = radiusM * Math.tan(angleRad / 2);
    const availableInM = dist(current, vertex!);
    const availableOutM = dist(vertex!, next!);
    const feasible =
      turnDeg > EPS &&
      turnDeg < 180 - EPS &&
      Number.isFinite(tangentM) &&
      tangentM <= availableInM + EPS &&
      tangentM <= availableOutM + EPS;

    if (!feasible) {
      addLine(legs, current, vertex!);
      current = vertex!;
      continue;
    }

    const sign: -1 | 1 = signedDeg < 0 ? -1 : 1;
    const entry = destination(vertex!, incomingHeading + 180, tangentM);
    const exit = destination(vertex!, outgoingHeading, tangentM);
    const center = destination(entry, incomingHeading + sign * 90, radiusM);
    addLine(legs, current, entry);
    legs.push({
      kind: 'arc',
      center,
      radiusM,
      radialStartDeg: incomingHeading - sign * 90,
      headingStartDeg: incomingHeading,
      turnDeg,
      sign,
      lengthM: radiusM * angleRad,
      to: exit,
    });
    current = exit;
  }

  addLine(legs, current, end);
  const lengthM = legs.reduce((sum, leg) => sum + leg.lengthM, 0);
  const last = legs.at(-1);
  const finalHeadingDeg =
    last == null
      ? 0
      : last.kind === 'line'
        ? last.headingDeg
        : last.headingStartDeg + last.sign * last.turnDeg;
  return { legs, lengthM, start, end, finalHeadingDeg: (finalHeadingDeg + 360) % 360 };
}

function routeFor(
  points: Vec2[],
  speedMps: number,
  maxTurnRateDegS: number | null | undefined,
): FlightRoute {
  let routes = ROUTE_CACHE.get(points);
  if (!routes) {
    routes = new Map();
    ROUTE_CACHE.set(points, routes);
  }
  const key = `${speedMps}:${maxTurnRateDegS ?? 'unlimited'}`;
  let route = routes.get(key);
  if (!route) {
    route = buildRoute(points, speedMps, maxTurnRateDegS);
    routes.set(key, route);
  }
  return route;
}

function sampleRoute(route: FlightRoute, distanceM: number): PathSample {
  if (route.legs.length === 0) {
    return { pos: route.start, headingDeg: route.finalHeadingDeg, distM: 0, done: true };
  }
  let remainingM = Math.max(0, distanceM);
  for (const leg of route.legs) {
    if (remainingM <= leg.lengthM) {
      const fraction = leg.lengthM > 0 ? remainingM / leg.lengthM : 0;
      if (leg.kind === 'line') {
        return {
          pos: {
            x: leg.from.x + (leg.to.x - leg.from.x) * fraction,
            y: leg.from.y + (leg.to.y - leg.from.y) * fraction,
          },
          headingDeg: leg.headingDeg,
          distM: distanceM,
          done: false,
        };
      }
      const sweptDeg = leg.turnDeg * fraction;
      return {
        pos: destination(leg.center, leg.radialStartDeg + leg.sign * sweptDeg, leg.radiusM),
        headingDeg: (leg.headingStartDeg + leg.sign * sweptDeg + 360) % 360,
        distM: distanceM,
        done: false,
      };
    }
    remainingM -= leg.lengthM;
  }
  return {
    pos: route.end,
    headingDeg: route.finalHeadingDeg,
    distM: route.lengthM,
    done: true,
  };
}

function distanceAfterS(
  speedMps: number,
  accelMps2: number | null | undefined,
  flightS: number,
): number {
  const t = Math.max(0, flightS);
  const speed = Math.max(0, speedMps);
  if (accelMps2 == null) return t * speed;
  if (!(accelMps2 > 0)) return 0;
  const accelerateS = speed / accelMps2;
  if (t <= accelerateS) return 0.5 * accelMps2 * t * t;
  return 0.5 * accelMps2 * accelerateS * accelerateS + speed * (t - accelerateS);
}

function durationForDistanceS(
  distanceM: number,
  speedMps: number,
  accelMps2: number | null | undefined,
): number {
  if (!(speedMps > 0)) return Number.POSITIVE_INFINITY;
  if (accelMps2 == null) return distanceM / speedMps;
  if (!(accelMps2 > 0)) return Number.POSITIVE_INFINITY;
  const accelerateS = speedMps / accelMps2;
  const accelerateM = 0.5 * accelMps2 * accelerateS * accelerateS;
  if (distanceM <= accelerateM) return Math.sqrt((2 * distanceM) / accelMps2);
  return accelerateS + (distanceM - accelerateM) / speedMps;
}

function windOffset(environment: EnvironmentSpec | undefined, flightS: number): Vec2 {
  if (!environment?.apply || !(environment.windSpeedMps > 0)) return { x: 0, y: 0 };
  return destination(
    { x: 0, y: 0 },
    environment.windFromDeg + 180,
    environment.windSpeedMps * Math.max(0, flightS),
  );
}

/** Duration of the limited air-relative path, excluding the start delay. */
export function limitedFlightDurationS(points: Vec2[], speedMps: number, uas: UasSpec): number {
  if (!hasFlightLimits(uas)) return pathLength(points) / speedMps;
  const route = routeFor(points, speedMps, uas.maxTurnRateDegS);
  return durationForDistanceS(route.lengthM, speedMps, uas.maxAccelMps2);
}

/**
 * Position on the target UAS path under its flight limits. The caller keeps the
 * legacy switch: when no limit is stated, this delegates directly to
 * posAtTime for bit-identical compatibility. Wind is a ground-speed offset
 * while airborne; the returned heading remains the held air heading.
 * FlightPath has no altitude profile, so climbRateMps is intentionally unused.
 */
export function limitedPosAtTime(
  points: Vec2[],
  speedMps: number,
  startDelayS: number,
  tS: number,
  uas: UasSpec,
  environment?: EnvironmentSpec,
): PathSample {
  if (!hasFlightLimits(uas)) return posAtTime(points, speedMps, startDelayS, tS);

  const flightS = Math.max(0, tS - startDelayS);
  const route = routeFor(points, speedMps, uas.maxTurnRateDegS);
  const durationS = durationForDistanceS(route.lengthM, speedMps, uas.maxAccelMps2);
  const distanceM = distanceAfterS(speedMps, uas.maxAccelMps2, flightS);
  const sample = sampleRoute(route, distanceM);
  const drift = windOffset(environment, Math.min(flightS, durationS));
  if (drift.x === 0 && drift.y === 0) return sample;
  return { ...sample, pos: { x: sample.pos.x + drift.x, y: sample.pos.y + drift.y } };
}
