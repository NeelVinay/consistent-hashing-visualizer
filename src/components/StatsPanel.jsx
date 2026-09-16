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

/** Per-server load. The dashed marker is where the server sat before the last action. */
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
  mode, serverIds, vnodeCount, replicationFactor, keyCount,
  countsBefore, countsAfter, diff, gained, imbalance, lastAction, orphanedCount,
}) {
  const scale = Math.max(...countsAfter.values(), ...(countsBefore?.values() ?? [0]), 1);
  const replicated = replicationFactor > 1;
  const heaviest = gained?.[0];

  return (
    <div className="stack">
      <section className="panel">
        <header>
          <span className="label">Readout</span>
          <span className="label">
            {mode === 'naive' ? 'modulo' : `${vnodeCount} vnodes`}
            {replicated && ` · rf ${replicationFactor}`}
          </span>
        </header>
        <div className="readout-grid">
          {replicated ? (
            <>
              <Readout
                label="Keys rerouted"
                value={diff ? diff.primaryChangedCount : '--'}
                sub="new primary owner"
              />
              <Readout
                label="New copies needed"
                value={diff ? diff.newCopies : '--'}
                sub="actual data transfer"
                tone={diff ? 'hot' : undefined}
              />
              <Readout
                label="Keys lost"
                value={diff ? orphanedCount : '--'}
                sub={diff && orphanedCount === 0 ? 'nothing went dark' : 'no surviving copy'}
                tone={!diff ? undefined : orphanedCount === 0 ? 'cool' : 'hot'}
              />
              <Readout
                label="Heaviest share"
                value={heaviest ? pct(heaviest.share) : '--'}
                sub={heaviest ? `onto ${heaviest.serverId}` : 'of new copies'}
                tone={!heaviest ? undefined : heaviest.share > 0.9 ? 'hot' : heaviest.share < 0.6 ? 'cool' : undefined}
              />
              <Readout
                label="Load imbalance"
                value={imbalance === Infinity ? '∞' : `${imbalance.toFixed(2)}×`}
                sub="busiest / quietest"
                tone={imbalance > 2 ? 'hot' : imbalance < 1.5 ? 'cool' : undefined}
              />
              <Readout
                label="Copies stored"
                value={keyCount * replicationFactor}
                sub={`${keyCount} keys × ${replicationFactor}`}
              />
            </>
          ) : (
            <>
              <Readout
                label="Keys moved"
                value={diff ? diff.changedCount : '--'}
                sub={`of ${keyCount}`}
                tone={!diff ? undefined : diff.changedPct > 50 ? 'hot' : 'cool'}
              />
              <Readout
                label="Share remapped"
                value={diff ? `${diff.changedPct.toFixed(1)}%` : '--'}
                sub={diff ? 'after last action' : 'no action yet'}
                tone={!diff ? undefined : diff.changedPct > 50 ? 'hot' : 'cool'}
              />
              {mode === 'consistent' && lastAction === 'add' && heaviest ? (
                <Readout
                  label="Landed on"
                  value={heaviest.serverId.replace('server-', 'srv ')}
                  sub="the new server, as intended"
                  tone="cool"
                />
              ) : (
                <Readout
                  label="Heaviest share"
                  value={heaviest ? pct(heaviest.share) : '--'}
                  sub={heaviest ? `onto ${heaviest.serverId}` : `${serverIds.length} servers, ${keyCount} keys`}
                  tone={!heaviest ? undefined : heaviest.share > 0.9 ? 'hot' : heaviest.share < 0.6 ? 'cool' : undefined}
                />
              )}
              <Readout
                label="Load imbalance"
                value={imbalance === Infinity ? '∞' : `${imbalance.toFixed(2)}×`}
                sub="busiest / quietest"
                tone={imbalance > 2 ? 'hot' : imbalance < 1.5 ? 'cool' : undefined}
              />
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <header>
          <span className="label">{replicated ? 'Copies held per server' : 'Load per server'}</span>
          <span className="label">dashed = before</span>
        </header>
        <div className="body">
          <LoadBars serverIds={serverIds} before={countsBefore} after={countsAfter} scale={scale} />

          {gained && gained.length > 0 && (
            <div className="spread-note">
              {replicated
                ? `${diff.newCopies} new copies to make, landing on `
                : `${diff.changedCount} moved keys ${mode === 'naive' ? 'scattered across' : 'absorbed by'} `}
              {gained.map((g, i) => (
                <span key={g.serverId}>
                  {i > 0 && ', '}
                  <b>{g.serverId}</b> {g.count} ({pct(g.share)})
                </span>
              ))}
              {gained.length === 1 && lastAction !== 'add' && (
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
