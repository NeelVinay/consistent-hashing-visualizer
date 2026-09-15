import { describe, it, expect } from 'vitest';
import { fnv1a, RING_SIZE } from './hash.js';
import { makeKeys } from './keys.js';

/**
 * Chi-square goodness-of-fit against a uniform distribution. Lower is more even.
 * For n buckets the expected value is roughly n-1, and anything under ~2x that
 * is comfortably uniform.
 */
function chiSquare(values, bucketCount) {
  const buckets = new Array(bucketCount).fill(0);
  for (const value of values) {
    buckets[Math.floor((fnv1a(value) / RING_SIZE) * bucketCount)]++;
  }
  const expected = values.length / bucketCount;
  return buckets.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
}

describe('fnv1a', () => {
  it('is deterministic', () => {
    expect(fnv1a('server-1')).toBe(fnv1a('server-1'));
  });

  it('always lands inside the ring space', () => {
    for (const key of makeKeys(2000)) {
      const h = fnv1a(key);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(RING_SIZE);
    }
  });

  it('separates near-identical strings', () => {
    expect(fnv1a('server-1#0')).not.toBe(fnv1a('server-1#1'));
    expect(fnv1a('key-1')).not.toBe(fnv1a('key-2'));
  });

  it('spreads sequential keys evenly across the ring', () => {
    // 9 degrees of freedom: p<0.05 sits at 16.9. Raw FNV-1a without the
    // avalanche step scored 111 here.
    expect(chiSquare(makeKeys(10_000), 10)).toBeLessThan(25);
  });

  it('spreads virtual-node names evenly across the ring', () => {
    // The case that matters most: if these clump, the virtual-nodes demo fails.
    // Raw FNV-1a without the avalanche step scored 108 here.
    const vnodeNames = [];
    for (let server = 1; server <= 4; server++) {
      for (let i = 0; i < 150; i++) vnodeNames.push(`server-${server}#${i}`);
    }
    expect(chiSquare(vnodeNames, 10)).toBeLessThan(25);
  });

  it('stays even at finer granularity', () => {
    // 63 degrees of freedom: p<0.05 sits at 82.5.
    expect(chiSquare(makeKeys(10_000), 64)).toBeLessThan(120);
  });

  it('has a low collision rate', () => {
    const keys = makeKeys(10_000);
    expect(new Set(keys.map(fnv1a)).size).toBeGreaterThan(keys.length * 0.999);
  });
});
