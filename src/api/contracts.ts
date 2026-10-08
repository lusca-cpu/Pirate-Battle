import type { EndReason } from '../game/types';
import type { SessionSettings } from '../game/config';

export interface MatchRecord {
  matchId: string;
  playerId: string;
  playedAt: string;
  score: number;
  durationSec: number;
  endReason: EndReason;
  config: SessionSettings;
}

export interface RankingEntry extends MatchRecord {
  rank: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface RankingQuery extends PageRequest {
  config: SessionSettings;
}

export interface HistoryQuery extends PageRequest {
  playerId: string;
}

export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type RankingResponse = PagedResponse<RankingEntry>;
export type HistoryResponse = PagedResponse<MatchRecord>;

export interface RegisterMatchRequest extends MatchRecord {}
export interface RegisterMatchResponse {
  record: MatchRecord;
  created: boolean;
}

export type MockScenario =
  | 'success'
  | 'empty'
  | 'slow'
  | 'variable-latency'
  | 'out-of-order'
  | 'timeout'
  | 'network-error'
  | 'http-4xx'
  | 'http-5xx'
  | 'ranking-error'
  | 'history-error'
  | 'register-timeout'
  | 'finish-unavailable';

export interface MockScenarioConfig {
  scenario: MockScenario;
  seed: number;
}
