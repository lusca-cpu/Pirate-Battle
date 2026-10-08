import axios from 'axios';
import type {
  HistoryQuery,
  HistoryResponse,
  RegisterMatchRequest,
  RegisterMatchResponse,
  RankingQuery,
  RankingResponse,
} from './contracts';

export const api = axios.create({
  baseURL: '/api',
  timeout: 3500,
  headers: { 'Content-Type': 'application/json' },
});

export async function getRanking(query: RankingQuery): Promise<RankingResponse> {
  const { data } = await api.get<RankingResponse>('/ranking', {
    params: { page: query.page, pageSize: query.pageSize, durationSec: query.config.durationSec, spawnIntervalSec: query.config.spawnIntervalSec },
  });
  return data;
}

export async function getHistory(query: HistoryQuery): Promise<HistoryResponse> {
  const { data } = await api.get<HistoryResponse>('/history', { params: query });
  return data;
}

export async function registerMatch(request: RegisterMatchRequest): Promise<RegisterMatchResponse> {
  const { data } = await api.post<RegisterMatchResponse>('/matches', request, {
    headers: { 'Idempotency-Key': request.matchId },
  });
  return data;
}
