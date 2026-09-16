/**
 * Everything the guided scenarios do, exposed one knob at a time. Collapsed by
 * default: it is the sandbox, not the entry point.
 */
export default function Controls({
  mode, onMode,
  serverIds, onAddServer, onRemoveServer,
  vnodeCount, onVnodeCount,
  replicationFactor, onReplicationFactor,
  onReset,
}) {
  const consistent = mode === 'consistent';

  return (
    <details className="panel drawer">
      <summary>
        <span className="drawer-head">
          <span className="label">Experiment yourself</span>
          <span className="drawer-state num">
            {consistent ? `${vnodeCount} vn` : 'modulo'} &middot; {serverIds.length} srv &middot; rf {replicationFactor}
          </span>
        </span>
      </summary>
      <div className="body">
        <fieldset>
          <div className="fieldhead"><span className="label">Strategy</span></div>
          <div className="segmented" role="group" aria-label="Hashing strategy">
            <button aria-pressed={!consistent} onClick={() => onMode('naive')}>Modulo</button>
            <button aria-pressed={consistent} onClick={() => onMode('consistent')}>Consistent</button>
          </div>
        </fieldset>

        {/* No ring in modulo mode, so this control has nothing to act on. */}
        {consistent && (
          <fieldset>
            <div className="fieldhead">
              <span className="label">Virtual nodes / server</span>
              <span className="num">{vnodeCount}</span>
            </div>
            <input
              type="range" min="1" max="200" step="1" value={vnodeCount}
              aria-label="Virtual nodes per server"
              onChange={(e) => onVnodeCount(Number(e.target.value))}
            />
            <div className="ticks"><span>1</span><span>100</span><span>200</span></div>
          </fieldset>
        )}

        <fieldset>
          <div className="fieldhead">
            <span className="label">Copies of each key</span>
            <span className="num">{replicationFactor}</span>
          </div>
          <input
            type="range" min="1" max="3" step="1" value={replicationFactor}
            aria-label="Replication factor"
            onChange={(e) => onReplicationFactor(Number(e.target.value))}
          />
          <div className="ticks"><span>1</span><span>2</span><span>3</span></div>
          <p className="hint">
            {replicationFactor === 1
              ? 'One copy. A server dying takes its keys with it.'
              : `Each key is stored on the next ${replicationFactor} distinct servers clockwise, so a failure loses nothing.`}
          </p>
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
          <p className="hint">
            Failing and gracefully removing are the same mechanic: the server stops
            owning ring, and its keys go somewhere else.
          </p>
        </fieldset>

        <fieldset>
          <button className="btn" onClick={onReset}>Reset scope</button>
        </fieldset>
      </div>
    </details>
  );
}
