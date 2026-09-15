import { useMemo, useRef, useState } from 'react';
import RingScope from './components/RingScope.jsx';
import Controls from './components/Controls.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import Explainer from './components/Explainer.jsx';
import { buildRing, assignConsistent } from './lib/ring.js';
import { assignNaive } from './lib/naive.js';
import { countPerServer, diffAssignments, absorbedBy, imbalanceRatio } from './lib/simulation.js';
import { fnv1a } from './lib/hash.js';
import { makeKeys } from './lib/keys.js';

const KEY_COUNT = 500;
const KEYS = makeKeys(KEY_COUNT);
// Key positions never change -- only the servers under them do.
const KEY_POSITIONS = new Map(KEYS.map((key) => [key, fnv1a(key)]));

const INITIAL = {
  mode: 'consistent',
  serverIds: ['server-1', 'server-2', 'server-3', 'server-4'],
  vnodeCount: 150,
  previous: null,
  activePreset: null,
};

const serverName = (n) => `server-${n}`;
const nextServerName = (serverIds) =>
  serverName(Math.max(0, ...serverIds.map((id) => Number(id.split('-')[1]))) + 1);

/** The whole simulation for one configuration. Pure -- state in, numbers out. */
function simulate({ mode, serverIds, vnodeCount }) {
  const points = mode === 'consistent' ? buildRing(serverIds, vnodeCount) : [];
  const assignment = mode === 'consistent'
    ? assignConsistent(KEYS, points)
    : assignNaive(KEYS, serverIds);
  return { points, assignment };
}

function Verdict({ mode, serverIds, vnodeCount, diff, absorbed, lastAction }) {
  if (!diff) {
    return (
      <p className="verdict">
        <b>Add or fail a server</b> to see how many keys have to move. Or run one of the three
        scenarios on the left, which set the controls and perform the action for you.
      </p>
    );
  }

  const share = diff.movedCount / KEY_COUNT;
  const asPct = `${(share * 100).toFixed(1)}%`;

  if (mode === 'naive') {
    const n = serverIds.length;
    return (
      <p className="verdict bad">
        <span className="num">{asPct}</span> of keys changed server. Under{' '}
        <b>hash(key) % N</b> a key only stays put when <b>hash % {n - 1}</b> and{' '}
        <b>hash % {n}</b> agree, which happens for exactly <span className="num">1 in {n}</span> of
        all hash values &mdash; so <span className="num">{((1 - 1 / n) * 100).toFixed(0)}%</span> moving
        is not bad luck, it is the arithmetic. Every one of those keys is a cache miss.
      </p>
    );
  }

  if (lastAction === 'add') {
    return (
      <p className="verdict good">
        Only <span className="num">{asPct}</span> of keys moved, and every single one moved{' '}
        <b>onto the new server</b> &mdash; no key was shuffled between two servers that did not
        change. That is the whole point of the ring: a new server claims the stretch in front of
        each of its points and nothing else is disturbed.
      </p>
    );
  }

  if (absorbed?.length === 1) {
    return (
      <p className="verdict bad">
        The failed server's <span className="num">{diff.movedCount}</span> keys landed{' '}
        <b>entirely on {absorbed[0].serverId}</b> &mdash; <span className="num">100%</span> onto one
        machine. With <b>{vnodeCount} ring point{vnodeCount === 1 ? '' : 's'} per server</b>, a
        server owns one large unbroken arc, so exactly one neighbour inherits all of it. In
        production that neighbour is now the next thing to fall over.
      </p>
    );
  }

  const largest = absorbed?.[0];
  return (
    <p className="verdict good">
      The failed server's <span className="num">{diff.movedCount}</span> keys were absorbed by{' '}
      <b>all {absorbed.length} surviving servers</b>, the largest share being{' '}
      <span className="num">{(largest.share * 100).toFixed(1)}%</span>. With{' '}
      <b>{vnodeCount} ring points each</b>, the dead server owned {vnodeCount} scattered slivers
      rather than one arc &mdash; so its load had {absorbed.length} different neighbours to fall to.
    </p>
  );
}

export default function App() {
  const [scope, setScope] = useState(INITIAL);
  const [showVnodes, setShowVnodes] = useState(true);
  const [lastAction, setLastAction] = useState(null);
  const scopeRef = useRef(null);

  const { points, assignment } = useMemo(() => simulate(scope), [scope]);

  const countsAfter = useMemo(
    () => countPerServer(assignment, scope.serverIds),
    [assignment, scope.serverIds],
  );
  const countsBefore = useMemo(
    () => (scope.previous
      ? countPerServer(scope.previous.assignment, scope.previous.serverIds)
      : null),
    [scope.previous],
  );
  const diff = useMemo(
    () => (scope.previous ? diffAssignments(scope.previous.assignment, assignment) : null),
    [scope.previous, assignment],
  );
  const absorbed = useMemo(
    () => (diff ? absorbedBy(diff.movedKeys, assignment) : null),
    [diff, assignment],
  );
  const movedKeys = useMemo(() => new Set(diff?.movedKeys ?? []), [diff]);

  const placements = useMemo(
    () => KEYS.map((key) => ({
      key,
      position: KEY_POSITIONS.get(key),
      serverId: assignment.get(key),
    })),
    [assignment],
  );

  /** Perform an action, snapshotting the current state as the "before". */
  function act(kind, updater) {
    setLastAction(kind);
    setScope((current) => ({
      ...current,
      ...updater(current),
      previous: { assignment: simulate(current).assignment, serverIds: current.serverIds },
      activePreset: null,
    }));
  }

  /** Changing the strategy or the vnode count invalidates any before/after. */
  function reconfigure(patch) {
    setLastAction(null);
    setScope((current) => ({ ...current, ...patch, previous: null, activePreset: null }));
  }

  function runPreset(id) {
    const scenarios = {
      naive: {
        mode: 'naive', vnodeCount: scope.vnodeCount,
        before: ['server-1', 'server-2', 'server-3', 'server-4'],
        after: ['server-1', 'server-2', 'server-3', 'server-4', 'server-5'],
        action: 'add',
      },
      single: {
        mode: 'consistent', vnodeCount: 1,
        before: ['server-1', 'server-2', 'server-3'],
        after: ['server-1', 'server-2'],
        action: 'remove',
      },
      vnodes: {
        mode: 'consistent', vnodeCount: 150,
        before: ['server-1', 'server-2', 'server-3'],
        after: ['server-1', 'server-2'],
        action: 'remove',
      },
    };
    const s = scenarios[id];
    setLastAction(s.action);
    // Stacked layout puts the controls below the scope, so running a scenario
    // from down here would otherwise leave the result off-screen above.
    if (window.matchMedia('(max-width: 1180px)').matches) {
      scopeRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }
    setShowVnodes(true);
    setScope({
      mode: s.mode,
      vnodeCount: s.vnodeCount,
      serverIds: s.after,
      previous: {
        assignment: simulate({ mode: s.mode, serverIds: s.before, vnodeCount: s.vnodeCount }).assignment,
        serverIds: s.before,
      },
      activePreset: id,
    });
  }

  const imbalance = imbalanceRatio(countsAfter);

  return (
    <div className="shell">
      <header className="masthead">
        <h1>Consistent Hashing <em>Scope</em></h1>
        <p>
          {KEY_COUNT} keys on a 32-bit ring. Add or fail a server and watch how much has to move.
        </p>
        <span className="spacer" />
        <a href="https://github.com/NeelVinay/consistent-hashing-visualizer" target="_blank" rel="noreferrer">
          source &amp; write-up &rarr;
        </a>
      </header>

      <div className="deck">
        <Controls
          mode={scope.mode}
          onMode={(mode) => reconfigure({ mode })}
          serverIds={scope.serverIds}
          onAddServer={() => act('add', (c) => ({ serverIds: [...c.serverIds, nextServerName(c.serverIds)] }))}
          onRemoveServer={(id) => act('remove', (c) => ({ serverIds: c.serverIds.filter((s) => s !== id) }))}
          vnodeCount={scope.vnodeCount}
          onVnodeCount={(vnodeCount) => reconfigure({ vnodeCount })}
          showVnodes={showVnodes}
          onShowVnodes={setShowVnodes}
          activePreset={scope.activePreset}
          onPreset={runPreset}
          onReset={() => { setLastAction(null); setScope(INITIAL); }}
        />

        <div className="stack" ref={scopeRef}>
          <RingScope
            points={points}
            keyPlacements={placements}
            movedKeys={movedKeys}
            showVnodes={showVnodes}
            mode={scope.mode}
            centerReadout={
              diff
                ? { value: `${((diff.movedCount / KEY_COUNT) * 100).toFixed(1)}%`, caption: 'OF KEYS REMAPPED' }
                : { value: String(KEY_COUNT), caption: `KEYS / ${scope.serverIds.length} SERVERS` }
            }
          />
          <Verdict
            mode={scope.mode}
            serverIds={scope.serverIds}
            vnodeCount={scope.vnodeCount}
            diff={diff}
            absorbed={absorbed}
            lastAction={lastAction}
          />
          <Explainer />
        </div>

        <StatsPanel
          mode={scope.mode}
          serverIds={scope.serverIds}
          vnodeCount={scope.vnodeCount}
          keyCount={KEY_COUNT}
          countsBefore={countsBefore}
          countsAfter={countsAfter}
          diff={diff}
          absorbed={absorbed}
          imbalance={imbalance}
          lastAction={lastAction}
        />
      </div>

      <p className="footnote">
        FNV-1a + MurmurHash3 finalizer &middot; ring 0x00000000&ndash;0xFFFFFFFF &middot; all
        simulation runs in your browser
      </p>
    </div>
  );
}
