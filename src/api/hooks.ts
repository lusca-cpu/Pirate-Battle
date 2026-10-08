import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionSettings } from '../game/config';
import type { MatchRecord, RankingQuery, HistoryQuery } from './contracts';
import { getHistory, getRanking } from './client';
import { addPendingMatch, loadPendingMatches, removePendingMatch, syncPendingMatch } from './matchSync';
import { historyKey, rankingKey } from './queryClient';

export function useRanking(config: SessionSettings, page: number, pageSize = 8, enabled = true) {
  const query: RankingQuery = { page, pageSize, config };
  return useQuery({
    queryKey: [...rankingKey(config), page, pageSize],
    queryFn: () => getRanking(query),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useHistory(playerId: string, page: number, pageSize = 8, enabled = true) {
  const query: HistoryQuery = { page, pageSize, playerId };
  return useQuery({
    queryKey: [...historyKey(playerId), page, pageSize],
    queryFn: () => getHistory(query),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useRegisterMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (record: MatchRecord) => {
      addPendingMatch(record);
      try {
        return await syncPendingMatch(record);
      } catch (error) {
        // Keep it pending. The player can retry later, including after refresh.
        addPendingMatch(record);
        throw error;
      }
    },
    onSuccess: (_result, record) => {
      removePendingMatch(record.matchId);
      void client.invalidateQueries({ queryKey: ['ranking'] });
      void client.invalidateQueries({ queryKey: ['history', record.playerId] });
    },
  });
}

export function pendingMatchesForPlayer(playerId: string): MatchRecord[] {
  return loadPendingMatches().filter((record) => record.playerId === playerId);
}
