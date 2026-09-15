import { RING_SIZE } from '../lib/hash.js';
import { positionToPoint, polar, arcPath, toHex } from '../lib/geometry.js';
import { serverColor } from '../lib/palette.js';

const SIZE = 640;
const C = SIZE / 2;

const R_KEYS = 172;   // key dots sit inside the ownership band
const R_BAND = 202;   // the band of ring each server owns
const BAND_W = 14;
const R_TICK_IN = 210;  // virtual-node tick marks
const R_TICK_OUT = 220;
const R_BEAR_IN = 228;  // bearing ticks around the outside
const R_BEAR_MINOR = 236;
const R_BEAR_MAJOR = 242;
const R_LABEL = 258;

/** Bearing ticks every 15 degrees, with the four cardinals labelled in hex. */
function Bearings() {
  const ticks = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const major = i % 6 === 0;
    const a = polar(C, C, R_BEAR_IN, angle);
    const b = polar(C, C, major ? R_BEAR_MAJOR : R_BEAR_MINOR, angle);
    ticks.push(
      <line
        key={i}
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={major ? '#333b4a' : '#242a35'}
        strokeWidth={major ? 1.5 : 1}
      />,
    );
    if (major) {
      const label = polar(C, C, R_LABEL, angle);
      ticks.push(
        <text
          key={`l${i}`}
          x={label.x} y={label.y}
          fill="#4d5562"
          fontSize="10.5"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {toHex((i / 24) * RING_SIZE)}
        </text>,
      );
    }
  }
  return <g>{ticks}</g>;
}

/**
 * The stretch of ring each server owns. This is the load-bearing visual: at one
 * virtual node per server you see a few enormous, obviously unequal arcs; at 150
 * you see hundreds of interleaved slivers that average out to near-equal shares.
 */
function OwnershipBand({ points }) {
  if (points.length === 0) return null;

  // A lone point owns the entire ring, which no arc command can express.
  if (points.length === 1) {
    return (
      <circle
        cx={C} cy={C} r={R_BAND}
        fill="none"
        stroke={serverColor(points[0].serverId)}
        strokeWidth={BAND_W}
        opacity="0.75"
      />
    );
  }

  return (
    <g>
      {points.map((point, i) => {
        // Each point owns the arc running clockwise from the point before it.
        const previous = points[(i - 1 + points.length) % points.length];
        return (
          <path
            key={point.label}
            d={arcPath(previous.position, point.position, C, C, R_BAND)}
            fill="none"
            stroke={serverColor(point.serverId)}
            strokeWidth={BAND_W}
            opacity="0.75"
          />
        );
      })}
    </g>
  );
}

/** One radial tick per virtual node, coloured by the server that owns it. */
function VirtualNodeMarks({ points }) {
  return (
    <g className="vnode-mark">
      {points.map((point) => {
        const a = positionToPoint(point.position, C, C, R_TICK_IN);
        const b = positionToPoint(point.position, C, C, R_TICK_OUT);
        return (
          <line
            key={point.label}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={serverColor(point.serverId)}
            strokeWidth={points.length > 60 ? 1 : 2}
            opacity={points.length > 300 ? 0.55 : 0.95}
          >
            <title>{`${point.label} @ ${toHex(point.position)}`}</title>
          </line>
        );
      })}
    </g>
  );
}

export default function RingScope({
  points,
  keyPlacements,
  movedKeys,
  showVnodes,
  mode,
  centerReadout,
}) {
  const consistent = mode === 'consistent';

  return (
    <div className="scope-wrap">
      <span className="bracket tl" /><span className="bracket tr" />
      <span className="bracket bl" /><span className="bracket br" />
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
        aria-label={`Hash ring showing ${keyPlacements.length} keys across ${points.length} ring positions in ${mode} mode`}>
        <Bearings />

        {/* the ring itself */}
        <circle cx={C} cy={C} r={R_BAND} fill="none" stroke="#1e242e" strokeWidth={BAND_W + 2} />
        <circle cx={C} cy={C} r={R_KEYS + 22} fill="none" stroke="#161b23" strokeWidth="1" />

        {consistent && <OwnershipBand points={points} />}
        {consistent && showVnodes && <VirtualNodeMarks points={points} />}

        {/* keys */}
        <g>
          {keyPlacements.map(({ key, position, serverId }) => {
            const { x, y } = positionToPoint(position, C, C, R_KEYS);
            const moved = movedKeys.has(key);
            return (
              <circle
                key={key}
                className={`key-dot${moved ? ' moved' : ''}`}
                cx={x} cy={y} r={moved ? 2.7 : 2.1}
                fill={serverId ? serverColor(serverId) : '#39414f'}
                stroke={moved ? '#ffffff' : 'none'}
                strokeWidth={moved ? 1.1 : 0}
                opacity={moved ? 1 : 0.8}
              >
                <title>{`${key} @ ${toHex(position)} -> ${serverId ?? 'unassigned'}`}</title>
              </circle>
            );
          })}
        </g>

        {/* centre readout */}
        <g textAnchor="middle" fontFamily="'JetBrains Mono', monospace">
          <text x={C} y={C - 18} fill="#4d5562" fontSize="11" letterSpacing="2.5">
            {consistent ? 'CONSISTENT' : 'MODULO'}
          </text>
          <text x={C} y={C + 14} fill="#ccd2dc" fontSize="30" fontWeight="500">
            {centerReadout.value}
          </text>
          <text x={C} y={C + 34} fill="#79828f" fontSize="10.5" letterSpacing="1.5">
            {centerReadout.caption}
          </text>
        </g>
      </svg>
    </div>
  );
}
