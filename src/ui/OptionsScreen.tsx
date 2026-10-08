import { useState } from 'react';
import { SESSION_LIMITS, validateSettings, type SessionSettings } from '../game/config';
import { parseSettingInput, stepSetting } from '../game/settingsLogic';
import { loadSettings, saveSettings } from '../storage/localStore';
import { assetUrl } from './format';
import '../styles.css';

type Key = keyof SessionSettings;

const FIELDS: { key: Key; label: string; unit: string; hint: string }[] = [
  {
    key: 'durationSec',
    label: 'Game session time',
    unit: 's',
    hint: ``,
  },
  {
    key: 'spawnIntervalSec',
    label: 'Enemy spawn time',
    unit: 's',
    hint: ``,
  },
];

interface Props {
  onBack: () => void;
  backLabel?: string;
}

/**
 * Valid values are saved to localStorage as soon as they change, so they
 * survive a refresh. Invalid text is explained and never saved: the last
 * valid value stays in effect.
 */
export function OptionsScreen({ onBack, backLabel = 'Main Menu' }: Props) {
  const [saved, setSaved] = useState<SessionSettings>(loadSettings);
  const [drafts, setDrafts] = useState<Record<Key, string>>(() => ({
    durationSec: String(saved.durationSec),
    spawnIntervalSec: String(saved.spawnIntervalSec),
  }));
  const [justSaved, setJustSaved] = useState(false);

  const update = (key: Key, raw: string) => {
    setDrafts((d) => ({ ...d, [key]: raw }));
    const candidate: SessionSettings = { ...saved, [key]: parseSettingInput(raw) };
    if (!validateSettings(candidate)[key] && saveSettings(candidate)) {
      setSaved(candidate);
      setJustSaved(true);
    } else {
      setJustSaved(false);
    }
  };

  return (
    <main className="screen">
      <div className="panel options">
        <section aria-labelledby="options-title">
          <h1 id="options-title">Options</h1>

          {FIELDS.map(({ key, label, unit, hint }) => {
            const value = parseSettingInput(drafts[key]);
            const error = validateSettings({ ...saved, [key]: value })[key];
            const limit = SESSION_LIMITS[key];
            const base = error ? saved[key] : value;
            const inputId = `opt-${key}`;
            return (
              <div className="field" key={key}>
                <label className="field__label" htmlFor={inputId}>
                  {label}
                </label>
                <div className="field__row">
                  <button
                    type="button"
                    className="round-btn"
                    aria-label={`Decrease ${label}`}
                    disabled={base <= limit.min}
                    onClick={() => update(key, String(stepSetting(key, base, -1)))}
                  >
                    <img src={assetUrl('ui/controls/button_round_normal.png')} alt="" draggable={false} />
                    <img className="round-btn__icon" src={assetUrl('ui/controls/icon_minus.png')} alt="" draggable={false} />
                  </button>

                  <span className="field__input-wrap">
                    <input
                      id={inputId}
                      className="field__input"
                      type="text"
                      inputMode="decimal"
                      value={drafts[key]}
                      aria-invalid={error ? 'true' : 'false'}
                      aria-describedby={`${inputId}-hint ${error ? `${inputId}-error` : ''}`.trim()}
                      onChange={(e) => update(key, e.target.value)}
                    />
                    <span className="field__unit">{unit}</span>
                  </span>

                  <button
                    type="button"
                    className="round-btn"
                    aria-label={`Increase ${label}`}
                    disabled={base >= limit.max}
                    onClick={() => update(key, String(stepSetting(key, base, 1)))}
                  >
                    <img src={assetUrl('ui/controls/button_round_normal.png')} alt="" draggable={false} />
                    <img className="round-btn__icon" src={assetUrl('ui/controls/icon_plus.png')} alt="" draggable={false} />
                  </button>
                </div>
                <p id={`${inputId}-hint`} className="field__hint">{hint}</p>
                {error && (
                  <p id={`${inputId}-error`} className="field__error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            );
          })}

          <p className="options__saved" role="status">{justSaved ? 'Saved. Applies to the next match.' : ''}</p>

          <button type="button" className="btn btn--primary" onClick={onBack}>
            {backLabel}
          </button>
        </section>
      </div>
    </main>
  );
}
