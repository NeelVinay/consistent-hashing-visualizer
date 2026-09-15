import { serverColor } from '../lib/palette.js';

const pct = (fraction) => `${(fraction * 100).toFixed(1)}%`;

function Readout({ label, value, sub, tone }) {
  return (
    <div className="readout">
      <span className="label">{label}</span>
      <div className={`v${tone ? ` ${tone}` : ''}`}>{value}</div>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

/**
 * Per-server load. The dashed marker is where the server sat before the last
 * action, so a single row shows before and after at once.
 */
function LoadBars({ serverIds, before, after, scale }) {
  const everyServer = [...new Set([...(before?.keys() ?? []), ...serverIds])];

  return (
    <div className="bars">
      {everyServer.map((serverId) => {
        const now = after.get(serverId) ?? 0;
        const then = before?.get(serverId);
        const gone = !serverIds.includes(serverId);
        const delta = then === undefined ? null : now - then;

        return (
          <div className={`bar-row${gone ? ' gone' : ''}`} key={serverId}>
            <div className="bar-head">
              <span className="who">
                <span className="swatch" style={{ background: gone ? '#39414f' : serverColor(serverId) }} />
                {serverId}
              </span>
              <span>
                {delta !== null && delta !== 0 && (
                  <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
                    {delta > 0 ? '+' : ''}{delta}{'  '}
                  </span>
                )}
                {gone ? <span className="delta flat">offline</span> : now}
              </span>
            </div>
            <div className="bar-track">
              {then !== undefined && then > 0 && (
                <div className="bar-ghost" style={{ width: `${(then / scale) * 100}%` }} />
              )}
              <div
                className="bar-fill"
                style={{
                  width: `${(now / scale) * 100}%`,
                  background: gone ? '#39414f' : serverColor(serverId),
                  opacity: gone ? 0.4 : 0.85,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StatsPanel({
  mode, serverIds, vnodeCount, keyCount,
  countsBefore, countsAfter, diff, absorbed, imbalance, lastAction,
}) {
  const scale = Math.max(...countsAfter.values(), ...(countsBefore?.values() ?? [0]), 1);
  const movedFraction = diff ? diff.movedCount / keyCount : null;

  return (
    <div className="stack">
      <section className="panel">
        <header>
          <span className="label">Readout</span>
          <span className="label">{mode === 'naive' ? 'modulo' : `${vnodeCount} vnodes`}</span>
        </header>
        <div className="readout-grid">
          <Readout
            label="Keys moved"
            value={diff ? diff.movedCount : '--'}
            sub={`of ${keyCount}`}
            tone={movedFraction === null ? undefined : movedFraction > 0.5 ? 'hot' : 'cool'}
          />
          <Readout
            label="Share remapped"
            value={diff ? pct(movedFraction) : '--'}
            sub={diff ? 'after last action' : 'no action yet'}
            tone={movedFraction === null ? undefined : movedFraction > 0.5 ? 'hot' : 'cool'}
          />
          {mode === 'consistent' && lastAction === 'add' && absorbed?.length ? (
            <Readout
              label="Landed on"
              value={absorbed[0].serverId.replace('server-', 'srv ')}
              sub="the new server, as intended"
              tone="cool"
            />
          ) : (
            <Readout
              label="Heaviest share"
              value={absorbed?.length ? pct(absorbed[0].share) : '--'}
              sub={absorbed?.length ? `onto ${absorbed[0].serverId}` : `${serverIds.length} servers, ${keyCount} keys`}
              tone={
                !absorbed?.length ? undefined
                  : absorbed[0].share > 0.9 ? 'hot'
                    : absorbed[0].share < 0.6 ? 'cool' : undefined
              }
            />
          )}
          <Readout
            label="Load imbalance"
            value={imbalance === Infinity ? '∞' : `${imbalance.toFixed(2)}×`}
            sub="busiest / quietest"
            tone={imbalance > 2 ? 'hot' : imbalance < 1.5 ? 'cool' : undefined}
          />
        </div>
      </section>

      <section className="panel">
        <header>
          <span className="label">Load per server</span>
          <span className="label">dashed = before</span>
        </header>
        <div className="body">
          <LoadBars serverIds={serverIds} before={countsBefore} after={countsAfter} scale={scale} />

          {absorbed && absorbed.length > 0 && (
            <div className="spread-note">
              {diff.movedCount} moved keys {mode === 'naive' ? 'scattered across' : 'absorbed by'}{' '}
              {absorbed.map((a, i) => (
                <span key={a.serverId}>
                  {i > 0 && ', '}
                  <b>{a.serverId}</b> {a.count} ({pct(a.share)})
                </span>
              ))}
              {absorbed.length === 1 && lastAction !== 'add' && (
                <>
                  {' '}&mdash; <b>all of it onto one server.</b>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
