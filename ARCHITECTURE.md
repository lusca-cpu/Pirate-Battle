# Arquitetura

Trechos marcados com ⚠️ PREENCHER dependem de arquivos que ainda precisam ser conferidos.
Procure por `PREENCHER` antes de entregar.

## Visão geral

O projeto separa o **jogo** (regras) da **apresentação** (React e PixiJS):

```
  teclado / toque ──▶ ┌──────────────┐  estado + eventos  ┌─────────────┐
     (src/input)      │  Simulation  │ ─────────────────▶ │ PixiRenderer│  canvas
                      │  (src/game)  │                    └─────────────┘
                      └──────┬───────┘  eventos           ┌─────────────┐
                             │ ───────────────────────▶   │ src/audio   │  som
        GameEngine ──────────┘                            └─────────────┘
        (src/engine)  ── estado do HUD ──▶ GameStore ──▶ React (src/ui)
```

- `src/game`: regras puras. A classe `Simulation` não conhece React nem PixiJS, só avança o
  estado quando recebe `step(dt)`. Isso a torna determinística e testável.
- `src/render`: `PixiRenderer` desenha o estado da simulação e nunca o altera.
- `src/engine`: `GameEngine` liga simulação, renderer e entrada; `GameStore` guarda o
  estado que o HUD precisa.
- `src/ui`: telas React (menu, opções, ranking, histórico, partida, HUD, pausa e toque).
- `src/api`, `src/mocks` e `src/storage`: API (simulada por MSW) e persistência local.

## Integração React / PixiJS

React é dono das telas e do HUD. PixiJS é dono do canvas da arena. A ponte é a `GameScreen`:

1. O `App` monta a `GameScreen` com uma `key` nova a cada partida. Isso garante estado
   limpo: nada da partida anterior sobrevive.
2. Na montagem, a `GameScreen` tira **uma cópia** das opções (`createConfig`) e cria um
   `GameStore`. Mudar as Options depois não afeta a partida.
3. As texturas são carregadas (`loadGameTextures`) com barra de progresso. Se falhar,
   aparece "Something went wrong" com **Try again** (que repete o carregamento) e
   **Main Menu**.
4. Com as texturas prontas, `GameEngine.create({ host, config, textures, store, signal,
   onEnd })` cria o `Application` do Pixi dentro do elemento da tela e inicia a partida.
5. O HUD lê o estado pelo `GameStore` com `useSyncExternalStore`. O React só renderiza
   quando o store muda, não a cada frame do jogo.
6. Quando a simulação termina, o engine chama `onEnd`. A `GameScreen` repassa para o `App`
   (por uma ref, para não recriar o engine se o callback mudar), que salva o resultado e
   registra a partida.
7. Na desmontagem, o efeito aborta o `AbortController`, chama `engine.destroy()` e zera o
   estado. Esse mesmo cuidado torna a criação segura no StrictMode do React: a primeira
   execução, que é abortada, se destrói sozinha.

A pausa é controlada pelo engine (`pause` / `resume`) e refletida no store. O diálogo de
pausa e as Options só existem enquanto o status é `paused`.

⚠️ PREENCHER (abra `src/engine/GameEngine.ts` e `gameStore.ts`): com que frequência o
engine atualiza o `GameStore`, e quais campos o HUD recebe (pontuação, tempo, vida).

### O renderer

`PixiRenderer.update(sim, alpha, dt)` roda uma vez por frame e:

- consome os eventos da simulação com `drainEvents()` (é o único consumidor);
- cria, atualiza e destrói as visualizações de navios e projetos conforme eles surgem e
  somem;
- **interpola** posição e ângulo entre o passo anterior e o atual (`alpha`), então o
  movimento fica suave mesmo com o passo da simulação diferente da taxa de quadros;
- usa `dt` visual, que é 0 durante a pausa, então água, fogo e efeitos congelam junto.

Detalhes visuais:

- **Camadas** (de baixo para cima): água, ilhas, navios, projéteis, efeitos e barras de vida.
- **Arena 16:9 com letterbox:** o `world` é escalado para caber no canvas mantendo a
  proporção e reposicionado no evento `resize`.
- **Ilhas:** montadas com tiles de 64 px e "assadas" em uma única textura
  (`generateTexture`), o que evita linhas entre os tiles quando escaladas. A areia e a
  grama são desenhadas antes de pedras e palmeiras.
- **Navios:** 4 sprites por cor (um por faixa de vida: acima de 75%, 50%, 25% e abaixo).
  Abaixo de 50% o navio pega fogo (animação de 2 quadros). Um clarão vermelho aparece
  quando ele é atingido.
- **Efeitos:** disparo, impacto, acerto e explosão, reagindo aos eventos `shot`, `impact`,
  `hit` e `destroyed`. Acerto no jogador e explosões fortes sacodem a câmera.

## Ciclo da simulação

A simulação usa **passo de tempo fixo** e um gerador de números aleatórios com **seed**
(`Rng`), então a mesma seed e as mesmas entradas geram a mesma partida.

Ordem de cada `step(dt)`:

1. avança o tempo de jogo (só enquanto o estado é `running`);
2. emite o aviso de tempo quando faltam 10 s;
3. guarda a posição anterior de cada navio e projétil (`px`, `py`, `pheading`);
4. atualiza o jogador (movimento e disparos);
5. gera inimigos conforme o intervalo configurado;
6. atualiza a IA dos inimigos;
7. separa inimigos que se sobrepõem;
8. move os projéteis e resolve acertos;
9. resolve abalroamentos (jogador contra Chaser e Shooter);
10. remove o que morreu;
11. verifica o fim da partida (jogador destruído ou tempo esgotado).

Pontos importantes:

- **Eventos:** a simulação acumula fatos pontuais (`shot`, `hit`, `impact`, `splash`,
  `collision`, `destroyed`, `point`, `lowHealth`, `timeWarning`, `over`). Quem consome
  chama `drainEvents()`, que devolve e limpa a lista. Efeitos visuais e sons são derivados
  desses eventos, sem entrar nas regras.
- **Estados:** `running`, `paused` e `ended`. Fora de `running`, `step` não faz nada, e
  por isso o cronômetro não avança durante a pausa.
- **Pontuação:** só conta o inimigo destruído por tiro do jogador. Abalroamento não pontua.
- **Configuração por partida:** `createConfig` devolve uma cópia profunda.

⚠️ PREENCHER: como o laço do `GameEngine` (`requestAnimationFrame` com acumulador, ou
outro) chama `step`, o passo fixo usado, o limite de passos por frame, e o que acontece
ao perder o foco da janela.

## Colisões

Cada navio tem um corpo de **três círculos** alinhados ao casco (popa, centro e proa),
com `radius` e `hullHalfLength` vindos da configuração. As funções ficam em
`src/game/collision.ts`:

- `circlesOverlap`: teste básico entre dois círculos.
- `isPoseFree`: diz se um navio, em certa posição e direção, está dentro da arena e longe
  das ilhas (as ilhas são círculos, em `arena.colliders`).
- `hitsObstacle` e `outsideArena`: usados pelos projéteis.
- `circleHitsShip`: círculo contra o corpo de um navio (tiros).
- `shipsOverlap`: corpo contra corpo (abalroamento).

Como o movimento reage:

- **Giro:** se o novo ângulo colocaria o casco dentro de uma ilha, o giro é rejeitado.
- **Avanço:** se o movimento está bloqueado, o navio tenta deslizar só no eixo X ou só no
  eixo Y.
- **Chaser:** ao encostar no jogador, causa 20 de dano e explode (sem pontuar).
- **Shooter:** ao encostar no jogador, os dois levam dano, respeitando um intervalo
  (`contactCooldown`) para não causar dano a cada frame, e os navios são empurrados em
  direções opostas para não se atravessarem.
- **Entre inimigos:** `separateEnemies` afasta navios sobrepostos usando a soma dos raios.
- **Projéteis:** morrem ao bater em ilha (`impact`), ao acabar o alcance (`splash`, caem
  na água) ou ao sair da arena.

## Gerenciamento de recursos

- **Texturas:** `loadGameTextures` monta um manifesto (tiles, navios em 3 cores × 4
  estágios, bala de canhão, explosões, fogo e molduras do HUD) e carrega tudo com
  `Assets.load`, reportando o progresso. As texturas ficam no cache do `Assets` entre
  partidas, então reiniciar não baixa os arquivos de novo. Se algo falha, `Assets.unload`
  esquece os resultados parciais, de modo que a nova tentativa busca de novo só o que
  faltou, e o erro sobe como `AssetLoadError`.
- **Objetos do Pixi:** navios e projéteis ganham sua visualização quando surgem e ela é
  destruída quando eles somem. Efeitos são destruídos quando acabam a vida. As texturas
  das ilhas "assadas" são destruídas junto com o renderer. `destroy()` também remove o
  listener de `resize` e destrói o `world` com todos os filhos.
- **Sons:** em `public/assets/sounds`. O `AudioManager` cria o `AudioContext` depois do
  primeiro gesto do usuário, baixa e decodifica cada arquivo **uma vez** e os reaproveita.
  Um som que falha ao carregar gera aviso no console e não impede os outros. Os loops
  (mar e navegação) param na pausa, no fim da partida e ao sair para o menu.
- **Ciclo de vida:** o engine é criado depois das texturas e destruído na desmontagem da
  tela (veja "Integração React / PixiJS").

## Persistência local

Todas as leituras e escritas são protegidas: se o `localStorage` estiver bloqueado ou o
conteúdo corrompido, o jogo se comporta como se estivesse vazio e nunca interrompe a partida.

| Chave | Conteúdo | Módulo |
|---|---|---|
| `pirate-battle:settings:v1` | opções (tempo e intervalo de spawn); inválido volta ao padrão | `storage/localStore` |
| `pirate-battle:last-result:v1` | último resultado, para a tela de resultado sobreviver a um refresh | `storage/localStore` |
| `pirate-battle:player-id:v1` | identificador do jogador (`player-<uuid>`); sem storage usa `player-local` | `api/matchSync` |
| `pirate-battle:pending-matches:v1` | partidas ainda não confirmadas pela API | `api/matchSync` |
| `pirate-battle:mock-records:v1` | registros da API simulada | `mocks` |
| ⚠️ PREENCHER | cenário e seed do painel de mock | `mocks/scenarios` |

O `App` também escuta o evento `storage` do navegador: se `mock-records` ou
`pending-matches` mudam em outra aba, o ranking e o histórico são invalidados e refeitos.

## Ranking e histórico

### Contrato

Cliente Axios (`src/api/client.ts`) com `baseURL: '/api'` e **timeout de 3,5 s**.

| Chamada | Parâmetros |
|---|---|
| `GET /api/ranking` | `page`, `pageSize`, `durationSec`, `spawnIntervalSec` (o ranking é por configuração de partida) |
| `GET /api/history` | `page`, `pageSize`, `playerId` |
| `POST /api/matches` | corpo abaixo, com o cabeçalho `Idempotency-Key: <matchId>` |

Corpo do registro (`MatchRecord`):

```ts
{
  matchId: string;      // UUID gerado no início da partida; também é a chave de idempotência
  playerId: string;
  playedAt: string;     // data ISO do fim da partida
  score: number;
  durationSec: number;
  endReason: 'time_up' | 'player_destroyed';
  config: { durationSec: number; spawnIntervalSec: number };
}
```

As telas pedem 8 itens por página (`pageSize = 8`).

⚠️ PREENCHER (abra `src/api/contracts.ts` e `src/mocks/handlers.ts`): formato das
respostas de `RankingResponse`, `HistoryResponse` e `RegisterMatchResponse` (campos,
total de páginas), formato do erro e como o mock devolve cada cenário.

### Cache (TanStack Query)

- **Chaves:** `['ranking', config, page, pageSize]` e `['history', playerId, page, pageSize]`.
  Como a página e a configuração fazem parte da chave, uma resposta atrasada de outra
  página cai na entrada de cache dela e não sobrescreve o que está na tela.
- **Política:** `staleTime: 0`, `refetchOnMount: 'always'` e `refetchOnWindowFocus: true`:
  os dados são sempre considerados velhos e refeitos ao abrir a tela e ao voltar à aba.
- **Falhas:** consultas tentam de novo 2 vezes, com espera de 500 ms e depois 1000 ms
  (`min(500 × 2^tentativa, 2500)`). Mutações não tentam de novo sozinhas (`retry: 0`):
  o reenvio de uma partida é uma decisão explícita.
- **Invalidação:** depois de registrar uma partida, são invalidados `['ranking']` e
  `['history', playerId]` (por prefixo). Trocar o cenário no painel de mock invalida tudo.
  Uma invalidação durante uma consulta em andamento cancela a anterior (padrão do TanStack
  Query), então uma resposta velha não vence a nova.

### Registros pendentes e recuperação

- O envio **nunca bloqueia** a tela de resultado: ela aparece mesmo se a API falhar.
- Antes de enviar, a partida é gravada em `pending-matches`. Só sai de lá depois que a API
  confirma (`removePendingMatch`). Se o envio falha, ela continua lá.
- A gravação é idempotente por `matchId`: `addPendingMatch` ignora um registro que já
  existe, então não há pendência duplicada.
- O reenvio usa **o mesmo `matchId`** como `Idempotency-Key`. Se um timeout acontecer
  depois de a API já ter gravado a partida, o reenvio não cria um segundo registro.
- Depois de um refresh, as pendentes são lidas do `localStorage`. O reenvio é manual
  (`retryPending` no `App`, acionado pela tela de histórico), e a tela de resultado mostra
  "Result saved locally. Waiting for the API…" enquanto houver pendentes do jogador.
- ⚠️ PREENCHER: confirme em `src/ui/RankingScreen.tsx` onde ficam o botão de reenvio e se
  existe algum reenvio automático.

## Decisões de balanceamento

Os números estão em `src/game/config.ts`. O que eles produzem:

- **Alcance:** o projétil do jogador alcança cerca de 468 unidades (520 × 0,9 s). O
  Shooter começa a atirar a 380, então o jogador pode atirar de mais longe.
- **Velocidade:** o jogador (170) é mais rápido que o Chaser (120) e o Shooter (85), então
  fugir é sempre possível.
- **Quantos tiros:** o Chaser morre com 3 tiros frontais, o Shooter com 4. Uma salva
  lateral dá 30 de dano se todos os tiros acertarem.
- **Chaser:** causa 20 de dano (20% da vida) e some ao bater, o que o torna uma ameaça
  que se resolve na hora.
- **Shooter:** 8 de dano a cada 1,8 s, só dispara se estiver mirando (tolerância de
  0,15 rad) e dentro do alcance, o que dá tempo de reagir.
- **Abalroar:** não pontua. Isso incentiva o combate à distância. Contra o Shooter, a
  batida é um troco de 10 por 10, com intervalo de 0,8 s.
- **Spawn:** os dois primeiros inimigos são Chaser e Shooter, para o jogador ver os dois
  tipos cedo. O limite de 12 vivos evita a arena ficar impossível.

⚠️ PREENCHER: confirme que essas são as intenções e acrescente o motivo de cada valor
que você escolheu.

## Limitações conhecidas

- A separação entre inimigos usa só a soma dos raios (um círculo por navio), não o casco
  inteiro, então dois cascos ainda podem se cruzar um pouco de lado.
- A fuga de ilhas dos inimigos é simples (testa um ponto à frente com alguns desvios) e
  pode falhar em formações de ilhas muito fechadas. Quando nenhum desvio está livre, o
  inimigo segue em direção ao alvo.
- O empurrão entre navios (3 unidades por passo) assume passo fixo.
- Projéteis e efeitos são criados e destruídos a cada uso, sem reaproveitamento (pool).
  Funciona para o volume atual, mas gera trabalho para o coletor de lixo em partidas muito
  intensas.
- O reenvio de partidas pendentes é manual.
- A API é simulada: os dados vivem no `localStorage` do navegador e não são compartilhados
  entre dispositivos.
- O navegador só libera áudio após um gesto do usuário, então o primeiro clique inicia o
  som.
- ⚠️ PREENCHER: limitações dos testes (por exemplo, baselines visuais dependem do sistema
  operacional) e do desempenho, conforme o relatório de profiling.

## Testes e profiling

- **E2E:** Playwright em `tests/e2e`, projetos desktop e mobile, relatório em
  `reports/e2e`.
- **Profiling:** `npm run profile` gera `reports/profiling.md` com FPS, tempo de frame,
  tarefas longas e memória.
- ⚠️ PREENCHER: resumo dos resultados e conclusões depois de rodar.
