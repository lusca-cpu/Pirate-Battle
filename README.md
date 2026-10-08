# Pirate Battle

Shooter naval 2D em React + TypeScript + PixiJS. O jogador comanda um navio, enfrenta
inimigos (Chaser e Shooter) por um tempo configurável e registra a pontuação em um
ranking e em um histórico de partidas.

Stack: React 19, TypeScript (strict), PixiJS 8, TanStack Query, Axios, MSW e Playwright.

> A solução roda a partir de um checkout limpo e **não depende de nenhum serviço privado**:
> a API é simulada no navegador com MSW e os dados ficam no `localStorage`.

## Requisitos

- Node.js ⚠️ PREENCHER (a versão em que você testou; confira com `node -v`. O Vite 8 pede
  uma versão LTS recente, como a 22)
- npm

## Setup

```bash
npm ci
npx playwright install chromium   # só necessário para rodar os testes E2E
npm run dev
```

O jogo abre em `http://localhost:5173`. No modo de desenvolvimento a API simulada (MSW) e
o painel de cenários de rede já vêm ligados.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite), com a API simulada |
| `npm run build` | Verificação de tipos + build de produção |
| `npm run build:mock` | Igual ao `build`, mas com a API simulada ligada (modo `mock`) |
| `npm run preview` | Serve o build em `http://localhost:4173` |
| `npm run lint` | Lint (oxlint) |
| `npm run typecheck` | Verificação de tipos (`tsc -b`) |
| `npm run test:e2e` | Testes Playwright (Chromium, desktop e mobile) |
| `npm run test:e2e:report` | Abre o relatório HTML dos testes |
| `npm run profile` | Mede FPS e memória em uma partida (precisa do `preview` rodando) |

Para ver o jogo em produção com o ranking funcionando: `npm run build:mock && npm run preview`.

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `VITE_ENABLE_MSW` | Não | vazio | Com `true`, liga a API simulada (MSW) e o painel "API scenarios" também fora do `npm run dev`. O modo `mock` (`.env.mock`) já define isso. |

O Vite também fornece `import.meta.env.DEV` e `import.meta.env.BASE_URL`, usados pelo
projeto. Um modelo está em `.env.example`.

⚠️ PREENCHER: confirme em `src/main.tsx` que o worker do MSW só sobe quando
`import.meta.env.DEV` ou `VITE_ENABLE_MSW === 'true'`.

## Controles

| Ação | Teclado |
|---|---|
| Avançar | `↑` ou `W` |
| Girar | `←` `→` ou `A` `D` |
| Tiro frontal | `Space` |
| Salva lateral esquerda / direita (3 tiros) | `Q` / `E` |
| Pausar / continuar | `P` ou `Esc` |

**Toque:** em telas de toque aparecem controles na tela (`TouchControls`). Em retrato, o
jogo mostra um aviso pedindo para girar o aparelho para paisagem.
⚠️ PREENCHER: liste os botões de toque e o que cada um faz.

**Pausa:** o botão de pausa do HUD (ou `P` / `Esc`) abre um diálogo com Resume, Options e
Quit. Dentro da pausa é possível abrir as Options. O cronômetro só avança enquanto a
partida está em andamento.
⚠️ PREENCHER: confirme o comportamento ao perder o foco da janela (veja
`src/engine/GameEngine.ts`).

## Configuração de gameplay

### Opções da tela Options

| Opção | Mínimo | Máximo | Passo | Padrão |
|---|---|---|---|---|
| Tempo da partida (s) | 60 | 180 | 10 | 120 |
| Intervalo entre spawns de inimigos (s) | 1 | 10 | 0,5 | 3 |

Valores fora do intervalo mostram erro de validação e não são salvos. As opções ficam no
`localStorage` (`pirate-battle:settings:v1`); se o valor guardado estiver ausente ou
inválido, o jogo volta aos padrões. Cada partida usa uma cópia das opções, então mudar
a tela Options não afeta uma partida em andamento.

### Balanceamento

Todos os números ficam em um só lugar: `src/game/config.ts`. Distâncias em unidades da
arena (1280×720), tempos em segundos e ângulos em radianos.

| | Jogador | Chaser | Shooter |
|---|---|---|---|
| Vida | 100 | 30 | 40 |
| Velocidade | 170 | 120 | 85 |
| Giro (rad/s) | 2,4 | 2,0 | 1,6 |
| Raio de colisão | 14 | 14 | 14 |
| Dano de contato | 10 (ao bater no Shooter) | 20 (e explode) | 10 (intervalo de 0,8 s) |
| Disparo | Frontal: 10 de dano, recarga 0,35 s. Lateral: 3 tiros, recarga 1,2 s | — | 8 de dano, recarga 1,8 s, alcance de ataque 380 |

Spawn: no máximo 12 inimigos vivos, distância mínima de 320 do jogador, os dois
primeiros são sempre Chaser e depois Shooter, e a partir daí 50% para cada tipo.

## Cenários de rede

A API é simulada com MSW. Os cenários são escolhidos na interface, no painel
**API scenarios**, que fica no menu principal (aparece em `npm run dev` e em builds com
`VITE_ENABLE_MSW=true`).

**Selecionar:** abra o painel, escolha o cenário na lista **Scenario**. A escolha é salva
e todas as consultas são refeitas na hora. O campo **Seed** torna as respostas
reproduzíveis (valor inválido volta para 1).

**Resetar:** o botão **Restore initial state** volta o cenário e a seed ao padrão, apaga
os registros da API simulada e a lista de partidas pendentes, e refaz as consultas. Ele
não apaga as opções, o último resultado nem o identificador do jogador.

| Cenário | Efeito esperado |
|---|---|
| `success` | respostas normais |
| `empty` | ranking e histórico vazios |
| `slow` | respostas com atraso alto |
| `variable-latency` | atraso diferente a cada requisição (definido pela seed) |
| `out-of-order` | respostas que chegam fora de ordem |
| `timeout` | requisições passam do limite de 3,5 s do cliente |
| `network-error` | falha de rede |
| `http-4xx` | erro 4xx |
| `http-5xx` | erro 5xx |
| `ranking-error` | só o ranking falha |
| `history-error` | só o histórico falha |
| `register-timeout` | o registro da partida expira por timeout |
| `finish-unavailable` | o registro da partida fica indisponível ao final da partida |

⚠️ PREENCHER: a coluna "Efeito esperado" foi escrita a partir dos nomes. Confirme cada
linha em `src/mocks/handlers.ts` e `src/mocks/scenarios.ts`.

## Reproduzindo falhas

1. **Falha ao registrar a partida.** Escolha `network-error`, `http-5xx` ou
   `register-timeout`, jogue até o fim. A tela de resultado aparece normalmente com o
   aviso "Result saved locally. Waiting for the API…" e a partida fica na lista de
   pendentes (`pirate-battle:pending-matches:v1`). Volte para `success` e reenvie pela
   aba **Match History**. O registro sai da lista e as abas se atualizam.
2. **Reenvio após timeout, sem duplicar.** Use `register-timeout`: o envio expira, a
   partida fica pendente. Troque para `success` e reenvie. O mesmo `matchId` vai como
   `Idempotency-Key`, então o registro aparece uma única vez.
3. **Recuperação após refresh.** Deixe uma partida pendente (item 1), recarregue a página
   (F5). A pendência continua no `localStorage` e pode ser reenviada.
4. **Respostas atrasadas.** Escolha `out-of-order` ou `variable-latency` e troque
   rapidamente de página ou de aba no ranking. A tela deve mostrar a resposta da última
   consulta.
5. **Ranking e histórico: carregando, vazio e erro.** `slow`, `empty`, `ranking-error` e
   `history-error`.
6. **Falha no carregamento de assets.** Abra o DevTools, aba Network, bloqueie as
   requisições de `/assets/png/` (ou use "Offline") e clique em Play. Aparece "Something
   went wrong" com **Try again** e **Main Menu**. Libere a rede e use Try again.

Os mesmos cenários são exercitados pelos testes em `tests/e2e`.

## Testes

```bash
npm run test:e2e                          # desktop e mobile
npx playwright test --ui                  # modo interativo
npx playwright test --project=desktop-chromium
npx playwright test --update-snapshots    # atualiza as baselines visuais
npm run test:e2e:report                   # abre o relatório HTML
```

- Navegador: Chromium, em dois projetos: `desktop-chromium` e `mobile-chromium` (Pixel 7).
- Cada teste roda em um contexto novo do navegador, sem estado compartilhado.
- Traces das falhas são guardados e aparecem no relatório.
- Regressão visual: as imagens-base ficam versionadas em `tests/e2e/*-snapshots`.
  ⚠️ PREENCHER: diga em qual sistema operacional as baselines foram geradas.

### Relatórios incluídos

- Testes: `reports/e2e/index.html`
- Profiling: `reports/profiling.md` e `reports/profiling.json`

## Profiling

```bash
npm run build:mock
npm run preview        # em um terminal
npm run profile        # em outro terminal
```

O script abre o build de produção no Chromium, inicia uma partida, joga automaticamente
(avanço, giros e disparos) e mede, por padrão durante 30 s: FPS médio, tempo de frame
(p95, p99, máximo), frames acima de 33 ms, tarefas longas (>50 ms) e uso de memória JS.
Variáveis opcionais: `PROFILE_SECONDS` (duração) e `BASE_URL` (endereço do preview).

## Estrutura

```
public/assets/      imagens, spritesheets, tilesheets e sons
src/api/            cliente Axios, contratos, hooks do TanStack Query, sincronização de partidas
src/audio/          efeitos sonoros (Web Audio)
src/engine/         GameEngine (laço do jogo, ligação simulação/renderer/entrada) e GameStore (estado do HUD)
src/game/           regras do jogo (simulação pura, sem React nem PixiJS)
src/input/          teclado e toque
src/mocks/          handlers e cenários do MSW
src/render/         renderização com PixiJS e carregamento de texturas
src/storage/        persistência local (opções e último resultado)
src/ui/             telas React (menu, opções, ranking, partida, HUD, pausa, toque)
tests/e2e/          testes Playwright
reports/            relatórios de testes e de profiling
```

Detalhes de arquitetura e decisões de projeto: [ARCHITECTURE.md](./ARCHITECTURE.md).
