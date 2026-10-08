import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2500),
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const rankingKey = (config: unknown) => ['ranking', config] as const;
export const historyKey = (playerId: string) => ['history', playerId] as const;
