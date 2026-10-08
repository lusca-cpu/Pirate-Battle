import type { MockScenario, MockScenarioConfig } from '../api/contracts';

const KEY = 'pirate-battle:mock-scenario:v1';

const DEFAULT: MockScenarioConfig = { scenario: 'success', seed: 1 };

export function loadScenario(): MockScenarioConfig {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<MockScenarioConfig>;
    return {
      scenario: (parsed.scenario ?? DEFAULT.scenario) as MockScenario,
      seed: Number.isFinite(parsed.seed) ? Number(parsed.seed) : DEFAULT.seed,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveScenario(config: MockScenarioConfig): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(config)); } catch { /* noop */ }
}

export function resetMockState(): void {
  window.localStorage.removeItem('pirate-battle:mock-records:v1');
  saveScenario(DEFAULT);
}
