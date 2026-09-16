import { SCENARIOS } from '../lib/scenarios.js';

/**
 * The primary way into the page. Four numbered steps that each set up a
 * configuration and run it, so nothing has to be assembled by hand.
 */
export default function Scenarios({ activePreset, onPreset, outcomes }) {
  const activeIndex = SCENARIOS.findIndex((s) => s.id === activePreset);

  return (
    <section className="panel">
      <header>
        <span className="label">Start here</span>
        <span className="label">
          {activeIndex >= 0 ? `${activeIndex + 1} of ${SCENARIOS.length}` : `${SCENARIOS.length} steps`}
        </span>
      </header>
      <div className="body steps">
        {SCENARIOS.map((scenario, i) => (
          <button
            key={scenario.id}
            className="step"
            aria-pressed={activePreset === scenario.id}
            onClick={() => onPreset(scenario.id)}
          >
            <span className="step-n">{i + 1}</span>
            <span className="step-body">
              <span className="step-title">{scenario.title}</span>
              <span className="step-q">{scenario.question}</span>
              <span className="step-out">{outcomes[scenario.id]}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
