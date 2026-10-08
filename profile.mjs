// Mede o desempenho de uma partida real no Chromium e grava reports/profiling.md e .json.
//
// Uso:
//   npm run build
//   npm run preview            (em um terminal)
//   npm run profile            (em outro terminal)
//
// Variáveis opcionais: BASE_URL (padrão http://localhost:4173) e PROFILE_SECONDS (padrão 30).

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173';
const SECONDS = Number(process.env.PROFILE_SECONDS ?? 30);

const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(BASE_URL);
await page.getByRole('button', { name: 'Play', exact: true }).click();
// Espera as texturas carregarem e o canvas da arena aparecer, e deixa a partida estabilizar.
await page.locator('[data-testid="game-host"] canvas').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1000);

// Coleta o intervalo entre frames e as tarefas longas dentro da página.
await page.evaluate(() => {
  const prof = { frames: [], longTasks: 0, stop: false };
  window.__prof = prof;
  try {
    new PerformanceObserver((list) => {
      prof.longTasks += list.getEntries().length;
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask não suportado
  }
  let last = performance.now();
  const tick = (now) => {
    if (prof.stop) return;
    prof.frames.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const readHeapMb = () =>
  page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null));

const heapStart = await readHeapMb();
let heapPeak = heapStart ?? 0;

// Joga automaticamente: avança, alterna o giro e dispara.
let playedSeconds = 0;
let endedEarly = false;
await page.keyboard.down('ArrowUp');
await page.keyboard.down('Space');

for (let s = 0; s < SECONDS; s++) {
  const turnKey = Math.floor(s / 2) % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(turnKey);
  await page.keyboard.press(s % 2 === 0 ? 'q' : 'e');
  await page.waitForTimeout(1000);
  await page.keyboard.up(turnKey);

  const heap = await readHeapMb();
  if (heap !== null) heapPeak = Math.max(heapPeak, heap);

  playedSeconds = s + 1;
  if (await page.getByRole('heading', { name: 'Battle complete' }).isVisible()) {
    endedEarly = true;
    break;
  }
}

await page.keyboard.up('ArrowUp');
await page.keyboard.up('Space');

const heapEnd = await readHeapMb();
const data = await page.evaluate(() => {
  window.__prof.stop = true;
  return { frames: window.__prof.frames, longTasks: window.__prof.longTasks };
});
const version = browser.version();
await browser.close();

// ---- estatísticas ----
const frames = data.frames.slice(1); // ignora o primeiro intervalo
const sorted = [...frames].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
const avg = frames.reduce((a, b) => a + b, 0) / (frames.length || 1);
const slow = frames.filter((f) => f > 33.4).length;
const round = (n, d = 1) => (n === null || n === undefined ? null : Number(n.toFixed(d)));

const result = {
  date: new Date().toISOString(),
  baseUrl: BASE_URL,
  chromium: version,
  os: `${os.platform()} ${os.release()}`,
  cpu: os.cpus()[0]?.model ?? 'desconhecida',
  cpuCores: os.cpus().length,
  nodeVersion: process.version,
  requestedSeconds: SECONDS,
  playedSeconds,
  endedEarly,
  frames: frames.length,
  avgFps: round(1000 / avg),
  frameMs: { avg: round(avg, 2), p95: round(pct(95), 2), p99: round(pct(99), 2), max: round(sorted.at(-1) ?? 0, 2) },
  framesOver33ms: slow,
  framesOver33msPercent: round((slow / (frames.length || 1)) * 100, 2),
  longTasks: data.longTasks,
  heapMb: { start: round(heapStart), end: round(heapEnd), peak: round(heapPeak) },
};

const fmt = (v) => (v === null ? 'n/d' : v);
const md = `# Relatório de profiling

Gerado automaticamente por \`npm run profile\`.

## Ambiente

| | |
|---|---|
| Data | ${result.date} |
| Endereço | ${result.baseUrl} |
| Chromium | ${result.chromium} |
| Sistema | ${result.os} |
| CPU | ${result.cpu} (${result.cpuCores} núcleos) |
| Node | ${result.nodeVersion} |

## Cenário

Partida real no build de produção, com o navio avançando, alternando o giro a cada 2 s e
disparando (frontal contínuo e salvas laterais). Duração pedida: ${result.requestedSeconds} s.
Tempo medido: ${result.playedSeconds} s${result.endedEarly ? ' (a partida terminou antes do tempo pedido)' : ''}.

## Resultados

| Métrica | Valor |
|---|---|
| Frames medidos | ${result.frames} |
| FPS médio | ${fmt(result.avgFps)} |
| Tempo de frame médio | ${result.frameMs.avg} ms |
| Tempo de frame p95 | ${result.frameMs.p95} ms |
| Tempo de frame p99 | ${result.frameMs.p99} ms |
| Maior tempo de frame | ${result.frameMs.max} ms |
| Frames acima de 33 ms | ${result.framesOver33ms} (${result.framesOver33msPercent}%) |
| Tarefas longas (>50 ms) | ${result.longTasks} |
| Memória JS no início | ${fmt(result.heapMb.start)} MB |
| Memória JS no fim | ${fmt(result.heapMb.end)} MB |
| Pico de memória JS | ${fmt(result.heapMb.peak)} MB |

## Análise

⚠️ PREENCHER: escreva 3 ou 4 frases. Por exemplo: o FPS ficou próximo do limite do
monitor? Houve picos de frame, e em qual situação? A memória cresceu ao longo da partida
(possível vazamento) ou ficou estável? O que você otimizou, se algo.
`;

await mkdir('reports', { recursive: true });
await writeFile('reports/profiling.json', JSON.stringify(result, null, 2));
await writeFile('reports/profiling.md', md);
console.log(md);
