/** Deterministic key set, so every run and every scenario compares like for like. */
export function makeKeys(count, prefix = 'key') {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}
