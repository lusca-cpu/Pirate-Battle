import type { SimEvent } from '../game/types';

/** Os sons ficam em public/assets/sounds, servidos como arquivos estáticos. */
const sound = (file: string) => `${import.meta.env.BASE_URL}assets/sounds/${file}`;

const FILES = {
    // tiros
    shot1: sound('cannon_fire_1.wav'),
    shot2: sound('cannon_fire_2.wav'),
    shot3: sound('cannon_fire_3.wav'),
    // acertos
    hit: sound('ship_wood_hit_1.wav'),
    impact: sound('ship_wood_hit_2.wav'),
    splash1: sound('cannonball_water_hit_1.wav'),
    splash2: sound('cannonball_water_hit_2.wav'),
    collision: sound('ship_collision.wav'),
    // destruição
    explosion1: sound('ship_explosion_1.wav'),
    explosion2: sound('ship_explosion_2.wav'),
    sinking: sound('ship_sinking.wav'),
    // placar e avisos
    point: sound('score_point.wav'),
    lowHealth: sound('health_low.wav'),
    timeWarning: sound('time_warning.wav'),
    // estado do jogo
    start: sound('game_start.wav'),
    pause: sound('game_pause.wav'),
    resume: sound('game_resume.wav'),
    over: sound('game_over.wav'),
    complete: sound('game_complete.wav'),
    // loops
    ocean: sound('ocean_ambience_loop.wav'),
    sailing: sound('ship_sailing_loop.wav'),
    // interface
    uiClick: sound('ui_click.wav'),
    uiHover: sound('ui_hover.wav'),
    uiBack: sound('ui_back.wav'),
    uiClose: sound('ui_close.wav'),
} as const;

type SoundName = keyof typeof FILES;

const SHOTS: readonly SoundName[] = ['shot1', 'shot2', 'shot3'];
const SPLASHES: readonly SoundName[] = ['splash1', 'splash2'];
const EXPLOSIONS: readonly SoundName[] = ['explosion1', 'explosion2'];

const pick = (list: readonly SoundName[]): SoundName => list[Math.floor(Math.random() * list.length)]!;

/** Intervalo mínimo entre dois sons iguais, para não "estourar" o áudio. */
const MIN_GAP_MS = 40;

/** Elementos que fazem os sons de interface (hover/click) tocarem. */
const UI_SELECTOR = 'button, a, [role="button"]';

class AudioManager {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private ready: Promise<void> | null = null;
    private buffers = new Map<SoundName, AudioBuffer>();
    private lastPlayed = new Map<SoundName, number>();
    private loops = new Map<SoundName, { src: AudioBufferSourceNode; gain: GainNode }>();
    private muted = false;
    private uiInstalled = false;

    // ------------------------------------------------------------ setup

    /** Cria o contexto e carrega os sons. Pode ser chamado várias vezes. */
    async unlock(): Promise<void> {
        if (!this.ready) this.ready = this.init();
        await this.ready;
        if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
    }

    private async init(): Promise<void> {
        const ctx = new AudioContext();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(ctx.destination);
        void ctx.resume();
        await this.loadAll();
    }

    private async loadAll(): Promise<void> {
        const ctx = this.ctx!;
        await Promise.all(
            (Object.keys(FILES) as SoundName[]).map(async (name) => {
                try {
                    const res = await fetch(FILES[name]);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.arrayBuffer();
                    this.buffers.set(name, await ctx.decodeAudioData(data));
                } catch (err) {
                    console.warn(`[audio] não foi possível carregar "${name}" (${FILES[name]})`, err);
                }
            }),
        );
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (this.master) this.master.gain.value = muted ? 0 : 1;
    }

    // ------------------------------------------------------------ sons

    play(name: SoundName, volume = 1): void {
        if (!this.ctx || !this.master) return;
        const buffer = this.buffers.get(name);
        if (!buffer) return;

        const now = performance.now();
        if (now - (this.lastPlayed.get(name) ?? 0) < MIN_GAP_MS) return;
        this.lastPlayed.set(name, now);

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(this.master);
        src.start();
    }

    private startLoop(name: SoundName, volume: number): void {
        if (!this.ctx || !this.master || this.loops.has(name)) return;
        const buffer = this.buffers.get(name);
        if (!buffer) return;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(this.master);
        src.start();
        this.loops.set(name, { src, gain });
    }

    private stopLoop(name: SoundName): void {
        const loop = this.loops.get(name);
        if (!loop || !this.ctx) return;
        this.loops.delete(name);
        const t = this.ctx.currentTime;
        loop.gain.gain.setTargetAtTime(0, t, 0.05);
        loop.src.stop(t + 0.3);
    }

    // ------------------------------------------------------------ partida

    /** Chamado quando uma partida começa: som de início + mar ao fundo. */
    startMatch(): void {
        this.ready
            ?.then(() => {
                this.stopLoop('ocean');
                this.stopLoop('sailing');
                this.play('start');
                this.startLoop('ocean', 0.3);
            })
            .catch(() => { });
    }

    pauseMatch(): void {
        this.stopLoop('ocean');
        this.stopLoop('sailing');
        this.play('pause');
    }

    resumeMatch(): void {
        this.play('resume');
        this.startLoop('ocean', 0.3);
    }

    /** Para os loops (fim de partida ou saída para o menu). */
    stopMatch(): void {
        this.stopLoop('ocean');
        this.stopLoop('sailing');
    }

    /** Liga/desliga o som do navio navegando. Pode ser chamado a cada frame. */
    setSailing(on: boolean): void {
        if (on) this.startLoop('sailing', 0.25);
        else this.stopLoop('sailing');
    }

    /** Converte os eventos da simulação em sons. */
    handleEvents(events: SimEvent[]): void {
        for (const ev of events) {
            switch (ev.type) {
                case 'shot':
                    this.play(pick(SHOTS), ev.owner === 'player' ? 1 : 0.5);
                    break;
                case 'hit':
                    this.play('hit', ev.target === 'player' ? 1 : 0.7);
                    break;
                case 'impact':
                    this.play('impact', 0.6);
                    break;
                case 'splash':
                    this.play(pick(SPLASHES), 0.4);
                    break;
                case 'collision':
                    this.play('collision', 0.8);
                    break;
                case 'destroyed':
                    if (ev.kind === 'player') this.play('sinking', 1);
                    else this.play(pick(EXPLOSIONS), 0.8);
                    break;
                case 'point':
                    this.play('point', 0.8);
                    break;
                case 'lowHealth':
                    this.play('lowHealth', 0.8);
                    break;
                case 'timeWarning':
                    this.play('timeWarning', 0.9);
                    break;
                case 'over':
                    this.stopMatch();
                    this.play(ev.reason === 'time_up' ? 'complete' : 'over', 1);
                    break;
            }
        }
    }

    // ------------------------------------------------------------ interface

    /**
     * Liga os sons de interface em qualquer <button>, <a> ou [role="button"]
     * sem precisar mexer nos componentes. Use data-sound="back" ou "close"
     * para trocar o som do clique, ou data-sound="none" para silenciar.
     * Chame uma única vez (ex.: no main.tsx).
     */
    installUiSounds(): void {
        if (this.uiInstalled || typeof document === 'undefined') return;
        this.uiInstalled = true;

        // Navegadores só liberam áudio depois de um gesto do usuário.
        document.addEventListener('pointerdown', () => void this.unlock(), { once: true });

        const target = (e: Event): HTMLElement | null =>
            e.target instanceof Element ? (e.target.closest(UI_SELECTOR) as HTMLElement | null) : null;
        const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled === true;

        let lastHover: HTMLElement | null = null;
        document.addEventListener('pointerover', (e) => {
            if (e.pointerType !== 'mouse') return;
            const el = target(e);
            if (el && el !== lastHover && !isDisabled(el) && el.dataset.sound !== 'none') {
                this.play('uiHover', 0.4);
            }
            lastHover = el;
        });

        document.addEventListener('click', (e) => {
            const el = target(e);
            if (!el || isDisabled(el)) return;
            switch (el.dataset.sound) {
                case 'none':
                    return;
                case 'back':
                    this.play('uiBack');
                    return;
                case 'close':
                    this.play('uiClose');
                    return;
                default:
                    this.play('uiClick');
            }
        });
    }
}

export const audio = new AudioManager();