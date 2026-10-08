import { useEffect, useRef, type KeyboardEvent } from 'react';

interface Props {
  onResume: () => void;
  onOptions: () => void;
  onQuit: () => void;
}

/** Modal pause dialog with focus moved in on open, trapped while open, and restored on close. */
export function PauseDialog({ onResume, onOptions, onQuit }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => previous?.focus?.();
  }, []);

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = ref.current?.querySelectorAll<HTMLElement>('button');
    if (!items || items.length === 0) return;
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="overlay" onKeyDown={trapTab}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <h2 id="pause-title">Paused</h2>
        <p>The battle is on hold. Nothing moves until you resume.</p>
        <button type="button" className="btn btn--primary" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="btn btn--primary" onClick={onOptions}>
          Options
        </button>
        <button type="button" className="btn btn--primary" onClick={onQuit}>
          Main Menu
        </button>
      </div>
    </div>
  );
}
