import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameStore, HudSnapshot } from '../engine/gameStore';
import { assetUrl, formatClock } from './format';

interface HudProps {
  store: GameStore;
  onPause: () => void;
}

/** Quantized so the screen-reader text changes rarely (never per frame). */
function announcement(s: HudSnapshot): string {
  if (s.status === 'paused') return 'Game paused.';
  if (s.status === 'ended') return `Battle over. You scored ${s.score} points.`;
  const hpBucket = s.maxHp > 0 ? Math.ceil((s.hp / s.maxHp) * 4) * 25 : 0;
  const timeBucket = Math.ceil(s.timeLeftSec / 30) * 30;
  return `Score ${s.score}. Health below ${hpBucket} percent. About ${timeBucket} seconds left.`;
}

function healthColor(ratio: number): 'green' | 'amber' | 'red' {
  return ratio > 0.5 ? 'green' : ratio > 0.25 ? 'amber' : 'red';
}

export const Hud = memo(function Hud({ store, onPause }: HudProps) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const ratio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.hp / s.maxHp)) : 0;
  const color = healthColor(ratio);
  const live = announcement(s);

  // The live region is refreshed only when its text actually changes.
  const liveRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (liveRef.current && liveRef.current.textContent !== live) liveRef.current.textContent = live;
  }, [live]);

  return (
    <div className="hud" role="group" aria-label="Battle status">
      <div className="hud__health" role="img" aria-label={`Health ${s.hp} of ${s.maxHp}`}>
        <img src={assetUrl('ui/hud/health_frame.png')} alt="" draggable={false} />
        <img
          className="hud__health-fill"
          src={assetUrl(`ui/hud/health_fill_${color}.png`)}
          alt=""
          draggable={false}
          style={{ clipPath: `inset(0 ${(1 - ratio) * 100}% 0 0)` }}
        />
        <span className="hud__health-text" aria-hidden="true">
          {s.hp} / {s.maxHp}
        </span>
      </div>

      <div className="hud__right">
        <div className="hud__counter" aria-label={`Score ${s.score}`}>
          <img src={assetUrl('ui/hud/counter_panel.png')} alt="" draggable={false} />
          <img className="hud__icon" src={assetUrl('ui/hud/icon_score.png')} alt="" draggable={false} />
          <span aria-hidden="true">{s.score}</span>
        </div>
        <div className="hud__counter" aria-label={`Time left ${formatClock(s.timeLeftSec)}`}>
          <img src={assetUrl('ui/hud/counter_panel.png')} alt="" draggable={false} />
          <img className="hud__icon" src={assetUrl('ui/hud/icon_time.png')} alt="" draggable={false} />
          <span aria-hidden="true">{formatClock(s.timeLeftSec)}</span>
        </div>
        <button type="button" className="round-btn" onClick={onPause} aria-label="Pause game">
          <img src={assetUrl('ui/controls/button_round_normal.png')} alt="" draggable={false} />
          <img className="round-btn__icon" src={assetUrl('ui/controls/icon_pause.png')} alt="" draggable={false} />
        </button>
      </div>

      <p ref={liveRef} className="sr-only" role="status" aria-live="polite" />
    </div>
  );
});
