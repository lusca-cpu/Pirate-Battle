import { useState } from 'react';
import type { MockScenario } from '../api/contracts';
import { loadScenario, resetMockState, saveScenario } from '../mocks/scenarios';
import { resetMockRecords } from '../mocks/handlers';
import { queryClient } from '../api/queryClient';

const SCENARIOS: MockScenario[] = [
  'success', 'empty', 'slow', 'variable-latency', 'out-of-order', 'timeout',
  'network-error', 'http-4xx', 'http-5xx', 'ranking-error', 'history-error',
  'register-timeout', 'finish-unavailable',
];

export function MockControls() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(loadScenario);

  if (!import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW !== 'true') return null;

  const update = (scenario: MockScenario) => {
    const next = { ...config, scenario };
    setConfig(next);
    saveScenario(next);
    void queryClient.invalidateQueries();
  };

  const reset = () => {
    resetMockState();
    resetMockRecords();
    window.localStorage.removeItem('pirate-battle:pending-matches:v1');
    setConfig(loadScenario());
    void queryClient.invalidateQueries();
  };

  return (
    <div className="mock-controls">
      <button type="button" className="mock-controls__toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide API scenarios' : 'API scenarios'}
      </button>
      {open && (
        <div className="mock-controls__body">
          <label>
            Scenario
            <select value={config.scenario} onChange={(e) => update(e.target.value as MockScenario)}>
              {SCENARIOS.map((scenario) => <option key={scenario} value={scenario}>{scenario}</option>)}
            </select>
          </label>
          <label>
            Seed
            <input type="number" value={config.seed} onChange={(e) => {
              const next = { ...config, seed: Number(e.target.value) || 1 };
              setConfig(next);
              saveScenario(next);
            }} />
          </label>
          <button type="button" onClick={reset}>Restore initial state</button>
        </div>
      )}
    </div>
  );
}
