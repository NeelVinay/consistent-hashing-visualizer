import { describe, it, expect } from 'vitest';
import { positionToAngle, positionToPoint, toHex } from './geometry.js';
import { RING_SIZE } from './hash.js';

describe('geometry', () => {
  it('puts position 0 at 12 o\'clock', () => {
    const { x, y } = positionToPoint(0, 100, 100, 50);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(50);
  });

  it('runs clockwise -- a quarter turn lands on the right edge', () => {
    const { x, y } = positionToPoint(RING_SIZE / 4, 100, 100, 50);
    expect(x).toBeCloseTo(150);
    expect(y).toBeCloseTo(100);
  });

  it('puts the halfway position at 6 o\'clock', () => {
    const { x, y } = positionToPoint(RING_SIZE / 2, 100, 100, 50);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(150);
  });

  it('wraps a full turn back to the start', () => {
    expect(positionToAngle(0)).toBeCloseTo(0);
    expect(positionToAngle(RING_SIZE)).toBeCloseTo(Math.PI * 2);
  });

  it('formats positions as padded hex', () => {
    expect(toHex(0)).toBe('0x00000000');
    expect(toHex(RING_SIZE - 1)).toBe('0xFFFFFFFF');
  });
});
