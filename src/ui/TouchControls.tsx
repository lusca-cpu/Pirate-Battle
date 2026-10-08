import { useRef, type PointerEvent } from 'react';
import type { GameAction, InputController } from '../input/InputController';
import { assetUrl } from './format';

interface ButtonProps {
  action: GameAction;
  icon: string;
  label: string;
  input: InputController;
}

function TouchButton({ action, icon, label, input }: ButtonProps) {
  const pressed = useRef(false);

  const press = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (pressed.current) return;
    pressed.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.pressed = 'true';
    input.setTouch(action, true);
  };

  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (!pressed.current) return;
    pressed.current = false;
    delete e.currentTarget.dataset.pressed;
    input.setTouch(action, false);
  };

  return (
    <button
      type="button"
      className="round-btn round-btn--game"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={assetUrl('ui/controls/button_round_normal.png')} alt="" draggable={false} />
      <img className="round-btn__icon" src={assetUrl(`ui/controls/${icon}.png`)} alt="" draggable={false} />
    </button>
  );
}

/** On-screen controls. Each button is independent, so movement and shooting work at the same time. */
export function TouchControls({ input }: { input: InputController }) {
  return (
    <div className="touch" data-testid="touch-controls">
      <div className="touch__cluster touch__cluster--left">
        <TouchButton action="turnLeft" icon="icon_turn_left" label="Turn left" input={input} />
        <TouchButton action="forward" icon="icon_forward" label="Sail forward" input={input} />
        <TouchButton action="turnRight" icon="icon_turn_right" label="Turn right" input={input} />
      </div>
      <div className="touch__cluster touch__cluster--right">
        <TouchButton action="fireLeft" icon="icon_fire_left" label="Fire left broadside" input={input} />
        <TouchButton action="fireFront" icon="icon_fire_front" label="Fire forward" input={input} />
        <TouchButton action="fireRight" icon="icon_fire_right" label="Fire right broadside" input={input} />
      </div>
    </div>
  );
}
