import type { InputState } from '../game/types';

export type GameAction =
  | 'forward'
  | 'turnLeft'
  | 'turnRight'
  | 'fireFront'
  | 'fireLeft'
  | 'fireRight';

/** Keyboard bindings. Shown to the player in the controls help. */
export const KEY_BINDINGS: Record<string, GameAction> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowLeft: 'turnLeft',
  KeyA: 'turnLeft',
  ArrowRight: 'turnRight',
  KeyD: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
};

export const PAUSE_KEYS = ['KeyP', 'Escape'];

/**
 * Collects keyboard and touch input into one InputState.
 * Keys are only captured between attach() and detach(), i.e. while the
 * gameplay context is active, so menus keep their normal keyboard behavior.
 */
export class InputController {
  private keyboard = new Set<GameAction>();
  private pressedKeys = new Set<string>();
  private touch = new Map<GameAction, number>();
  private attached = false;

  /**
   * When false, game keys are ignored and not prevented, so dialogs
   * (pause menu) keep normal keyboard behavior such as Space on a button.
   */
  gameKeysActive = true;

  constructor(private readonly onPauseKey: () => void) {}

  get state(): InputState {
    const has = (a: GameAction) => this.keyboard.has(a) || (this.touch.get(a) ?? 0) > 0;
    return {
      forward: has('forward'),
      turnLeft: has('turnLeft'),
      turnRight: has('turnRight'),
      fireFront: has('fireFront'),
      fireLeft: has('fireLeft'),
      fireRight: has('fireRight'),
    };
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.clear();
  }

  /** Releases everything (used on pause, blur and resume). */
  clear(): void {
    this.keyboard.clear();
    this.pressedKeys.clear();
    this.touch.clear();
  }

  /** Called by the on-screen touch buttons. Reference-counted for multi-touch. */
  setTouch(action: GameAction, pressed: boolean): void {
    const n = this.touch.get(action) ?? 0;
    this.touch.set(action, Math.max(0, n + (pressed ? 1 : -1)));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (PAUSE_KEYS.includes(e.code)) {
      if (!e.repeat) this.onPauseKey();
      e.preventDefault();
      return;
    }

    if (!this.gameKeysActive) return;
    const action = KEY_BINDINGS[e.code];
    if (!action) return;
    e.preventDefault(); // stops the page from scrolling with arrows/space.
    this.pressedKeys.add(e.code);
    this.keyboard.add(action);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    if (!action) return;
    this.pressedKeys.delete(e.code);
    // Another key bound to the same action may still be held.
    const stillHeld = [...this.pressedKeys].some((code) => KEY_BINDINGS[code] === action);
    if (!stillHeld) this.keyboard.delete(action);
  };
}
