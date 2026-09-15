const PRESETS = [
  {
    id: 'naive',
    title: 'The naive hashing problem',
    detail: 'Four servers, add a fifth, hashing with hash(key) % N. Watch almost everything move.',
  },
  {
    id: 'single',
    title: 'The single-point failure problem',
    detail: 'Three servers, one ring point each. Kill one and a single neighbour swallows all of it.',
  },
  {
    id: 'vnodes',
    title: 'The virtual nodes fix',
    detail: 'Same failure, 150 ring points each. The load lands evenly across the survivors.',
  },
];

export default function Controls({
  mode, onMode,
  serverIds, onAddServer, onRemoveServer,
  vnodeCount, onVnodeCount,
  showVnodes, onShowVnodes,
  activePreset, onPreset,
  onReset,
}) {
  const consistent = mode === 'consistent';

  return (
    <div className="stack">
      <section className="panel">
        <header><span className="label">Guided scenarios</span><span className="label">3</span></header>
        <div className="body stack" style={{ gap: '0.4rem' }}>
          {PRESETS.map((preset, i) => (
            <button
              key={preset.id}
              className="preset"
              aria-pressed={activePreset === preset.id}
              onClick={() => onPreset(preset.id)}
            >
              <span className="idx">[{i + 1}]</span>
              <span>
                <span className="t">{preset.title}</span>
                <span className="d">{preset.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <header><span className="label">Manual control</span></header>
        <div className="body">
          <fieldset>
            <div className="fieldhead">
              <span className="label">Strategy</span>
            </div>
            <div className="segmented" role="group" aria-label="Hashing strategy">
              <button aria-pressed={!consistent} onClick={() => onMode('naive')}>Modulo</button>
              <button aria-pressed={consistent} onClick={() => onMode('consistent')}>Consistent</button>
            </div>
          </fieldset>

          <fieldset>
            <div className="fieldhead">
              <span className="label">Virtual nodes / server</span>
              <span className="num">{consistent ? vnodeCount : '--'}</span>
            </div>
            <input
              type="range"
              min="1" max="200" step="1"
              value={vnodeCount}
              disabled={!consistent}
              aria-label="Virtual nodes per server"
              onChange={(e) => onVnodeCount(Number(e.target.value))}
            />
            <div className="ticks"><span>1</span><span>50</span><span>100</span><span>150</span><span>200</span></div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showVnodes}
                disabled={!consistent}
                onChange={(e) => onShowVnodes(e.target.checked)}
              />
              Show virtual node marks
            </label>
          </fieldset>

          <fieldset>
            <div className="fieldhead">
              <span className="label">Servers</span>
              <span className="num">{serverIds.length}</span>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={onAddServer} disabled={serverIds.length >= 8}>
                + Add server
              </button>
              <button
                className="btn danger"
                onClick={() => onRemoveServer(serverIds[serverIds.length - 1])}
                disabled={serverIds.length <= 1}
              >
                &times; Fail server
              </button>
            </div>
            <p className="d" style={{ color: 'var(--ink-faint)', fontSize: '0.72rem', margin: '0.45rem 0 0', lineHeight: 1.4 }}>
              Failing a server and gracefully removing one are the same mechanic here:
              the server stops owning ring, and its keys go somewhere else.
            </p>
          </fieldset>

          <fieldset>
            <button className="btn" onClick={onReset}>Reset scope</button>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
