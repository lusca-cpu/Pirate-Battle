import { http, HttpResponse, delay } from 'msw';
import type { MatchRecord, MockScenario } from '../api/contracts';
import { FIXTURE_MATCHES, ensureFixtures, readConfirmedRecords, writeConfirmedRecords } from './fixtures';
import { loadScenario } from './scenarios';

let requestSequence = 0;

function configFromParams(params: URLSearchParams) {
  return {
    durationSec: Number(params.get('durationSec')),
    spawnIntervalSec: Number(params.get('spawnIntervalSec')),
  };
}

function sameConfig(a: MatchRecord['config'], b: MatchRecord['config']): boolean {
  return a.durationSec === b.durationSec && a.spawnIntervalSec === b.spawnIntervalSec;
}

function sortRanking(records: MatchRecord[]): MatchRecord[] {
  // Deterministic tie-breaker: score DESC, duration DESC, date ASC, matchId ASC.
  return [...records].sort((a, b) =>
    b.score - a.score ||
    b.durationSec - a.durationSec ||
    a.playedAt.localeCompare(b.playedAt) ||
    a.matchId.localeCompare(b.matchId),
  );
}

async function simulate(scenario: MockScenario, kind: 'ranking' | 'history' | 'register') {
  requestSequence += 1;
  const { seed } = loadScenario();
  const seeded = Math.abs(Math.sin(seed * 12.9898 + requestSequence * 78.233)) % 1;

  if (scenario === 'slow') await delay(1800);
  if (scenario === 'variable-latency') await delay(200 + Math.floor(seeded * 1400));
  if (scenario === 'out-of-order') {
    await delay(requestSequence % 2 === 0 ? 150 : 1200);
  }
  if (scenario === 'timeout' || (scenario === 'register-timeout' && kind === 'register')) {
    await delay(6000);
    return 'timeout';
  }
  if (scenario === 'network-error') return 'network-error';
  if (scenario === 'http-4xx') return '4xx';
  if (scenario === 'http-5xx') return '5xx';
  if (scenario === 'ranking-error' && kind === 'ranking') return '5xx';
  if (scenario === 'history-error' && kind === 'history') return '5xx';
  if (scenario === 'finish-unavailable' && kind === 'register') return 'network-error';
  return null;
}

function errorResponse(kind: string) {
  if (kind === '4xx') return HttpResponse.json({ message: 'Mock validation error' }, { status: 422 });
  return HttpResponse.json({ message: 'Mock service unavailable' }, { status: 503 });
}

function page<T>(items: T[], pageNumber: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, pageNumber), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: safePage, pageSize, total, totalPages };
}

export const handlers = [
  http.get('/api/ranking', async ({ request }) => {
    const scenario = loadScenario().scenario;
    const failure = await simulate(scenario, 'ranking');
    if (failure === 'timeout') return HttpResponse.error();
    if (failure === 'network-error') return HttpResponse.error();
    if (failure === '4xx' || failure === '5xx') return errorResponse(failure);

    const url = new URL(request.url);
    const config = configFromParams(url.searchParams);
    const records = scenario === 'empty' ? [] : [...ensureFixtures()];
    const matching = sortRanking(records.filter((r) => sameConfig(r.config, config)));
    const ranked = matching.map((record, index) => ({ ...record, rank: index + 1 }));
    return HttpResponse.json(page(ranked, Number(url.searchParams.get('page') ?? 1), Number(url.searchParams.get('pageSize') ?? 8)));
  }),

  http.get('/api/history', async ({ request }) => {
    const scenario = loadScenario().scenario;
    const failure = await simulate(scenario, 'history');
    if (failure === 'timeout' || failure === 'network-error') return HttpResponse.error();
    if (failure === '4xx' || failure === '5xx') return errorResponse(failure);

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? '';
    const records = scenario === 'empty' ? [] : readConfirmedRecords();
    const items = records
      .filter((record) => record.playerId === playerId)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    return HttpResponse.json(page(items, Number(url.searchParams.get('page') ?? 1), Number(url.searchParams.get('pageSize') ?? 8)));
  }),

  http.post('/api/matches', async ({ request }) => {
    const scenario = loadScenario().scenario;
    const failure = await simulate(scenario, 'register');
    if (failure === 'timeout' || failure === 'network-error') return HttpResponse.error();
    if (failure === '4xx' || failure === '5xx') return errorResponse(failure);

    const incoming = await request.json() as MatchRecord;
    const records = ensureFixtures();
    const existing = records.find((record) => record.matchId === incoming.matchId);
    if (existing) {
      return HttpResponse.json({ record: existing, created: false });
    }
    // The mock server is idempotent by matchId. A duplicate POST can never create
    // a second history record or a second ranking entry.
    const next = [...records, incoming];
    writeConfirmedRecords(next);
    return HttpResponse.json({ record: incoming, created: true }, { status: 201 });
  }),
];

export function resetMockRecords(): void {
  writeConfirmedRecords(FIXTURE_MATCHES);
}
