// Labels for the saved list: the metadata line, and the saved time for its tooltip.

/** "just now", "5 min ago", "2 h ago", "3 d ago", then the date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

export function absoluteTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString();
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The card's metadata line (mockup drawCollect): "PROF-1 v3 · Counter-UAS · 3 cards · 1 path". */
export function metaLine(l: {
  id: string;
  version: number;
  class: string;
  cards: number;
  paths: number;
}): string {
  return [
    `${l.id} v${l.version}`,
    l.class,
    count(l.cards, 'card', 'cards'),
    count(l.paths, 'path', 'paths'),
  ].join(' · ');
}
