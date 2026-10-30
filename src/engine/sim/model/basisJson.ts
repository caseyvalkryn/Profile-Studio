/**
 * JSON text for a value comparison. Object key insertion order is not an
 * input; array order (including draw order) is.
 */
export function basisJson(value: unknown): string {
  return JSON.stringify(value, (_key, part) => {
    if (part == null || typeof part !== 'object' || Array.isArray(part)) return part;
    return Object.fromEntries(
      Object.keys(part)
        .sort()
        .map((key) => [key, part[key]]),
    );
  });
}
