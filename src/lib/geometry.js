import { RING_SIZE } from './hash.js';

/**
 * Ring position -> angle in radians, measured from 12 o'clock going clockwise.
 * Position 0 sits at the top; the space wraps once around the full circle.
 */
export function positionToAngle(position) {
  return (position / RING_SIZE) * Math.PI * 2;
}

/** Polar -> SVG cartesian. Clockwise from 12 o'clock, matching positionToAngle. */
export function polar(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  };
}

/** Where a ring position lands on screen. */
export function positionToPoint(position, cx, cy, radius) {
  return polar(cx, cy, radius, positionToAngle(position));
}

/**
 * SVG arc path running clockwise from one ring position to another, used to
 * shade the stretch of ring a server owns.
 */
export function arcPath(fromPosition, toPosition, cx, cy, radius) {
  const from = positionToPoint(fromPosition, cx, cy, radius);
  const to = positionToPoint(toPosition, cx, cy, radius);
  const span = (toPosition - fromPosition + RING_SIZE) % RING_SIZE;
  const largeArc = span > RING_SIZE / 2 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y}`;
}

/** Ring position as the 8-digit hex readout the scope bearings are labelled with. */
export function toHex(position) {
  return '0x' + position.toString(16).toUpperCase().padStart(8, '0');
}
