import type { LucideIcon } from 'lucide-react';

/** The three stroke weights of src/styles/tokens.css (--w1, --w2, --w3), in px. */
const STROKE = { w1: 0.75, w2: 1.25, w3: 2.25 } as const;

export type IconStroke = keyof typeof STROKE;

export type IconProps = {
  /** A Lucide icon component, for example `Play` from `lucide-react`. */
  icon: LucideIcon;
  /** Visible text beside the icon; the accessible name when `iconOnly` is set. */
  label: string;
  /** Render the icon alone. The caller must wrap the control in a Tooltip (principle 5.10). */
  iconOnly?: boolean;
  /** Pixel size of the icon. */
  size?: number;
  /** Stroke weight token; w2 (1.25 px) by default. */
  stroke?: IconStroke;
  className?: string;
};

/** One icon set, Lucide. An icon sits beside its label; an icon alone keeps the label as its name. */
export function Icon({
  icon: Glyph,
  label,
  iconOnly = false,
  size = 16,
  stroke = 'w2',
  className = '',
}: IconProps) {
  const glyph = (
    <Glyph
      size={size}
      strokeWidth={STROKE[stroke]}
      absoluteStrokeWidth
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    />
  );
  if (iconOnly) {
    return (
      <span role="img" aria-label={label} className={`inline-flex ${className}`}>
        {glyph}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {glyph}
      <span>{label}</span>
    </span>
  );
}
