import { useState } from 'react';
import type { SessionSettings } from '../game/config';
import { useHistory, useRanking } from '../api/hooks';
import { getPlayerId, loadPendingMatches } from '../api/matchSync';
import { END_REASON_LABEL, formatClock } from './format';

interface Props {
  tab: 'ranking' | 'history';
  settings: SessionSettings;
  onBack: () => void;
  onTab: (tab: 'ranking' | 'history') => void;
  onRetryPending: (matchId: string) => void;
}

export function RankingScreen({ tab, settings, onBack, onTab, onRetryPending }: Props) {
  const [page, setPage] = useState(1);
  const playerId = getPlayerId();
  const pending = loadPendingMatches().filter((record) => record.playerId === playerId);
  const ranking = useRanking(settings, page, 6, tab === 'ranking');
  const history = useHistory(playerId, page, 6, tab === 'history');
  const query = tab === 'ranking' ? ranking : history;

  const goPage = (next: number) => setPage(Math.max(1, next));

  return (
    <main className="screen">
      <div className="panel panel--wide">
        <div className="tabs" role="tablist" aria-label="Match records">
          <button className={`tab ${tab === 'ranking' ? 'tab--active' : ''}`} onClick={() => { setPage(1); onTab('ranking'); }} role="tab" aria-selected={tab === 'ranking'}>
            Ranking
          </button>
          <button className={`tab ${tab === 'history' ? 'tab--active' : ''}`} onClick={() => { setPage(1); onTab('history'); }} role="tab" aria-selected={tab === 'history'}>
            Match History
          </button>
        </div>

        {pending.length > 0 && (
          <div className="pending-box" role="status">
            <strong>{pending.length} pending match{pending.length > 1 ? 'es' : ''}</strong>
            <p>They will stay here until the API confirms them.</p>
            {pending.map((record) => (
              <button key={record.matchId} className="btn btn--small" type="button" onClick={() => onRetryPending(record.matchId)}>
                Retry {record.matchId.slice(0, 12)}
              </button>
            ))}
          </div>
        )}

        {tab === 'ranking' && <p className="table-note">Only matches with the current game configuration are compared.</p>}

        {query.isLoading && <div className="state-message">Loading…</div>}
        {query.isFetching && !query.isLoading && <div className="refreshing">Updating…</div>}
        {query.isError && (
          <div className="state-message state-message--error" role="alert">
            <strong>Could not load {tab === 'ranking' ? 'ranking' : 'history'}.</strong>
            <p>{query.error instanceof Error ? query.error.message : 'Network error.'}</p>
            <button className="btn btn--small" type="button" onClick={() => void query.refetch()}>Try again</button>
          </div>
        )}

        {query.isSuccess && query.data.items.length === 0 && <div className="state-message">No matches yet.</div>}

        {query.isSuccess && query.data.items.length > 0 && (
          <>
            <div className="records" aria-live="polite">
              {query.data.items.map((item) => (
                <article className="record" key={item.matchId}>
                  {tab === 'ranking' && 'rank' in item && <span className="record__rank">#{String(item.rank)}</span>}
                  <div className="record__main">
                    <strong>{item.playerId === playerId ? 'You' : item.playerId}</strong>
                    <span>{item.score} pts · {formatClock(item.durationSec)}</span>
                  </div>
                  <div className="record__meta">
                    <span>{END_REASON_LABEL[item.endReason]}</span>
                    <time dateTime={item.playedAt}>{new Date(item.playedAt).toLocaleString()}</time>
                  </div>
                </article>
              ))}
            </div>
            <div className="pagination" aria-label="Pagination">
              <button className="btn btn--small" disabled={query.data.page <= 1} onClick={() => goPage(query.data.page - 1)}>Previous</button>
              <span>Page {query.data.page} / {query.data.totalPages}</span>
              <button className="btn btn--small" disabled={query.data.page >= query.data.totalPages} onClick={() => goPage(query.data.page + 1)}>Next</button>
            </div>
          </>
        )}

        <button type="button" className="btn btn--primary" onClick={onBack}>Main Menu</button>
      </div>
    </main>
  );
}
