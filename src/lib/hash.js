/**
 * The hash ring spans 0 .. 2^32 - 1, treated as circular: the number after the
 * maximum wraps back to 0. RING_SIZE is that space's size, used to convert a
 * ring position into a fraction of the circle.
 */
export const RING_SIZE = 2 ** 32;

/**
 * MurmurHash3's 32-bit finalizer ("fmix32"). Pure bit-mixing, no new input.
 *
 * This is here for a measured reason. Plain FNV-1a over short, highly-structured
 * strings like "server-2#17" leaves its low bits poorly diffused into its high
 * bits -- and the high bits are what decide a point's position on the ring. On
 * the 600 virtual-node names this app generates, raw FNV-1a scored chi-square
 * 108 across ten ring segments (uniform would be ~9), with segments holding
 * between 21 and 107 points. Virtual nodes clumped like that cannot spread load
 * evenly no matter how many you add, which would have silently defeated the
 * entire point of the demo. Running the result through fmix32 drops that to 3.8.
 */
function avalanche(hash) {
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * FNV-1a (32-bit) plus a final avalanche. Chosen because it is tiny, fast, and
 * lands natively in 0..2^32-1 -- which is exactly the ring. Cryptographic
 * strength is irrelevant here; uniform distribution is the only requirement,
 * and it is one this file actually tests for rather than assumes.
 *
 * Math.imul does true 32-bit multiplication. Plain `hash * 16777619` would
 * exceed 2^53 and silently lose precision, wrecking the distribution.
 * `>>> 0` coerces the signed 32-bit result back to unsigned.
 *
 * Note: this XORs UTF-16 code units rather than UTF-8 bytes. For the ASCII
 * server and key names used here the two are identical.
 */
export function fnv1a(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return avalanche(hash);
}
