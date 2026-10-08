import { useCallback, useEffect, useState } from 'react';
import type { GameConfig } from './game/config';
import type { MatchResult } from './game/types';
import { useRegisterMatch } from './api/hooks';
import { queryClient } from './api/queryClient';
import { getPlayerId, loadPendingMatches } from './api/matchSync';
import { loadLastResult, loadSettings, saveLastResult, type StoredResult } from './storage/localStore';
import { END_REASON_LABEL, assetUrl, formatClock } from './ui/format';
import { GameScreen } from './ui/GameScreen';
import { OptionsScreen } from './ui/OptionsScreen';
import { RankingScreen } from './ui/RankingScreen';
import { MockControls } from './ui/MockControls';
import { audio } from './audio/audio';

/** menu -> (options/ranking/history) -> match -> result. */
type Screen = 'menu' | 'options' | 'ranking' | 'history' | 'playing' | 'result';

function newMatchId(): string {
  try { return crypto.randomUUID(); } catch { return `match-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [matchId, setMatchId] = useState('');
  const [result, setResult] = useState<StoredResult | null>(() => loadLastResult());
  const registerMatch = useRegisterMatch();
  const playerId = getPlayerId();
  const pendingCount = loadPendingMatches().filter((record) => record.playerId === playerId).length;

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pirate-battle:mock-records:v1' || event.key === 'pirate-battle:pending-matches:v1') {
        void queryClient.invalidateQueries({ queryKey: ['ranking'] });
        void queryClient.invalidateQueries({ queryKey: ['history', playerId] });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [playerId]);

  const startMatch = useCallback(async () => {
    await audio.unlock();
    setMatchId(newMatchId());
    setScreen('playing');
  }, []);

  const finishMatch = useCallback((r: MatchResult, config: GameConfig) => {
    const stored: StoredResult = {
      ...r,
      matchId,
      settings: config.session,
      endedAt: new Date().toISOString(),
    };
    saveLastResult(stored);
    setResult(stored);
    // Failure is deliberately non-blocking: the result screen/game loop is not
    // coupled to the API. The same matchId stays pending for retry.
    registerMatch.mutate({
      matchId,
      playerId,
      playedAt: stored.endedAt,
      score: r.score,
      durationSec: r.durationSec,
      endReason: r.reason,
      config: config.session,
    });
    setScreen('result');
  }, [matchId, playerId, registerMatch]);

  const retryPending = (id: string) => {
    const record = loadPendingMatches().find((item) => item.matchId === id);
    if (record) registerMatch.mutate(record);
  };

  if (screen === 'playing') {
    return (
      <GameScreen
        key={matchId}
        settings={loadSettings()}
        onFinish={finishMatch}
        onExit={() => setScreen('menu')}
      />
    );
  }

  if (screen === 'options') return <OptionsScreen onBack={() => setScreen('menu')} />;

  if (screen === 'ranking' || screen === 'history') {
    return (
      <RankingScreen
        key={screen}
        tab={screen}
        settings={loadSettings()}
        onTab={(tab) => setScreen(tab)}
        onRetryPending={retryPending}
        onBack={() => setScreen('menu')}
      />
    );
  }

  return (
    <main className="screen">
      <div className="panel">
        <img className="panel__title" src={assetUrl('ui/menu/title_pirate_battle.png')} alt="Pirate Battle" />

        {screen === 'result' && result ? (
          <section aria-labelledby="result-title">
            <h1 id="result-title">Battle complete</h1>
            <p className="panel__score" aria-label={`${result.score} points`}>{result.score}</p>
            <p>Points · {formatClock(result.durationSec)} · {END_REASON_LABEL[result.reason]}</p>
            {pendingCount > 0 && <p className="pending-inline">Result saved locally. Waiting for the API…</p>}
            <button type="button" className="btn btn--primary" onClick={startMatch} autoFocus>Play Again</button>
            <button type="button" className="btn btn--primary" data-sound="back" onClick={() => setScreen('menu')}>Main Menu</button>
          </section>
        ) : (
          <section aria-labelledby="menu-title">
            <h1 id="menu-title" className="sr-only">Main menu</h1>
            <p className="panel__tagline">Set sail. Take command.</p>
            <button type="button" className="btn btn--primary" onClick={startMatch} autoFocus>Play</button>
            <button type="button" className="btn btn--primary" onClick={() => setScreen('options')}>Options</button>
            <ul className="controls-help" aria-label="Controls">
              <li><kbd>↑</kbd> / <kbd>W</kbd> sail forward</li>
              <li><kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd> turn</li>
              <li><kbd>Space</kbd> fire forward</li>
              <li><kbd>Q</kbd> / <kbd>E</kbd> left / right broadside (3 shots)</li>
              <li><kbd>P</kbd> / <kbd>Esc</kbd> pause</li>
            </ul>
            <div className="btn-row">
              <button type="button" className="btn btn--primary btn--small" onClick={() => setScreen('ranking')}>Ranking</button>
              <button type="button" className="btn btn--primary btn--small" onClick={() => setScreen('history')}>Match History</button>
            </div>
            <MockControls />
          </section>
        )}
      </div>
    </main>
  );
}
