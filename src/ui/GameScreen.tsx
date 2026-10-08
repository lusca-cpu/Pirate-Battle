import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { GameStore } from '../engine/gameStore';
import { createConfig, type GameConfig, type SessionSettings } from '../game/config';
import type { MatchResult } from '../game/types';
import { loadGameTextures, type GameTextures } from '../render/assets';
import { Hud } from './Hud';
import { OptionsScreen } from './OptionsScreen';
import { PauseDialog } from './PauseDialog';
import { TouchControls } from './TouchControls';

interface Props {
  settings: SessionSettings;
  onFinish: (result: MatchResult, config: GameConfig) => void;
  onExit: () => void;
}

type LoadState =
  | { phase: 'loading'; progress: number }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; textures: GameTextures };

/**
 * One match. Mount it with a new `key` to start a fresh match: the settings
 * are copied into a config snapshot on mount, and everything is released on unmount.
 */
export function GameScreen({ settings, onFinish, onExit }: Props) {
  // Snapshot taken once: changing Options later never affects this match.
  const config = useMemo(() => createConfig(settings), []); // eslint-disable-line react-hooks/exhaustive-deps
  const store = useMemo(() => new GameStore(), []);
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [load, setLoad] = useState<LoadState>({ phase: 'loading', progress: 0 });
  const [attempt, setAttempt] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Options only make sense while paused. If the game leaves the pause state
  // (e.g. the player pressed P/Esc), the options close with it.
  const optionsOpen = showOptions && hud.status === 'paused';
  useEffect(() => {
    if (hud.status !== 'paused') setShowOptions(false);
  }, [hud.status]);

  // Move focus into the options panel when it opens.
  useEffect(() => {
    if (optionsOpen) optionsRef.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, [optionsOpen]);

  // Keep the latest callbacks without re-creating the engine when they change.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // 1) Textures (shown with progress; failures offer a retry).
  useEffect(() => {
    let cancelled = false;
    setLoad({ phase: 'loading', progress: 0 });
    loadGameTextures((p) => {
      if (!cancelled) setLoad({ phase: 'loading', progress: p });
    })
      .then((textures) => {
        if (!cancelled) setLoad({ phase: 'ready', textures });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({
            phase: 'error',
            message: error instanceof Error ? error.message : 'Could not load the game assets.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // 2) Engine. Safe under React StrictMode: the first (aborted) run cleans itself up.
  const textures = load.phase === 'ready' ? load.textures : null;
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !textures) return;

    const controller = new AbortController();
    let created: GameEngine | null = null;

    GameEngine.create({
      host,
      config,
      textures,
      store,
      signal: controller.signal,
      onEnd: (result) => onFinishRef.current(result, config),
    })
      .then((e) => {
        if (!e) return;
        if (controller.signal.aborted) {
          e.destroy();
          return;
        }
        created = e;
        setEngine(e);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoad({
            phase: 'error',
            message: error instanceof Error ? error.message : 'Could not start the renderer.',
          });
        }
      });

    return () => {
      controller.abort();
      created?.destroy();
      setEngine(null);
    };
  }, [textures, config, store]);

  const pause = useCallback(() => engine?.pause(), [engine]);
  const resume = useCallback(() => engine?.resume(), [engine]);

  return (
    <div className="game-root">
      <div ref={hostRef} className="game-host" data-testid="game-host" />

      {load.phase === 'loading' && (
        <div className="overlay" role="status" aria-live="polite">
          <div className="dialog">
            <h2>Loading</h2>
            <progress max={1} value={load.progress} aria-label="Loading game assets" />
            <p>{Math.round(load.progress * 100)}%</p>
          </div>
        </div>
      )}

      {load.phase === 'error' && (
        <div className="overlay">
          <div className="dialog" role="alert">
            <h2>Something went wrong</h2>
            <p>{load.message}</p>
            <button type="button" className="btn btn--primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
            <button type="button" className="btn btn--secondary" onClick={onExit}>
              Main Menu
            </button>
          </div>
        </div>
      )}

      {engine && (
        <>
          <Hud store={store} onPause={pause} />
          <TouchControls input={engine.input} />
          {hud.status === 'paused' && !optionsOpen && (
            <PauseDialog
              onResume={resume}
              onOptions={() => setShowOptions(true)}
              onQuit={onExit}
            />
          )}
          {optionsOpen && (
            <div ref={optionsRef} className="overlay overlay--options">
              <OptionsScreen onBack={() => setShowOptions(false)} backLabel="Back" />
            </div>
          )}
        </>
      )}

      <div className="rotate-hint" role="alert">
        Rotate your device to landscape to play.
      </div>
    </div>
  );
}
