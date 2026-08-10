# Compras e Suprimentos — POP-COMP-001 v2.3

O processo de compras da Plugga e da Waze, nativo no Plugga OS.

**Fonte:** `POP-COMP-001_Compras_v2_3_A4.pdf` (base) e `FLX-COMP_Fluxograma_Compras_SLA.pdf`.
O `docs/PRD-plugga-waze-os.md` **não** é fonte de requisito aqui — é rascunho sem
assinatura (§21 em branco), e nada neste módulo se justifica por ele.

O POP descreve o processo rodando no Bitrix24. Aqui ele é nativo: o card do funil
C43 virou linha em `pedidos_de_compra`, e "o sistema move o card automaticamente"
virou transição transacional. O espelho do Bitrix segue read-only (ADR-0009).

## O fluxo

```
                                      ┌── SIM ──────────────────────────┐
                                      │                                 ▼
pedido_gerado ──▶ analise_estoque ──▶ ?                            retirada ──▶ concluido
   (2 d.u.)         (2 d.u.)          │                            (5+ d.u.)        ▲
                                      └── NÃO ──▶ cotacoes ──▶ aprovacao ──▶ pagamento
                                                  (5 d.u.)      (2 d.u.)     (2 d.u.)
                                                      ▲              │
                                                      └── REVISAR ───┘
```

Ciclo de referência da aquisição externa: **~18 dias úteis** (2+2+5+2+2+5).

- `concluido` é terminal e **não é etapa mensurada**: não tem SLA no POP §3 e
  nunca gera linha em `pedidos_de_compra_etapas`. Um `CHECK` no banco garante.
- **REVISAR** é o único retorno do fluxo. Ele limpa a cotação selecionada — a
  proposta que voltou foi recusada — e cria uma segunda passagem por Cotações,
  que o indicador 4.3 conta separadamente.
- A **retirada** só estende o prazo além de 5 dias úteis na aquisição externa, e
  a extensão sai do `prazoEntregaDias` que o fornecedor declarou na cotação
  escolhida. Retirar do estoque não depende de fornecedor.

## Prazos (POP §3)

Todos em dias úteis, **segunda a sexta**. Os documentos não trazem calendário de
feriados e nenhum foi inventado: é escolha operacional versionada, com o custo
conhecido de que feriado conta como dia útil. Calendário em `America/Manaus`,
armazenamento em UTC.

| Etapa | Prazo |
|---|---|
| Pedido gerado | 2 |
| Análise de estoque | 2 |
| Cotações | 5 |
| Aprovação de compra | 2 |
| Pagamento | 2 |
| Retirada | 5 ou mais (fornecedor externo) |

Renegociação de prazo só vale **antes** do vencimento (POP §3). Depois é atraso,
e reescrever o prazo apagaria o que o indicador 4.3 precisa contar. O prazo
renegociado é contado da entrada na etapa, não de agora — mover a origem
apagaria o tempo já consumido.

**Esticar além da régua do §3 é alçada da diretoria.** Renegociar dentro do prazo
da etapa é gestão de fluxo e cabe a Compras ou ao Financeiro; passar disso exige
alguém de fora, porque renegociar é o caminho mais barato de deixar o 4.3 verde
na véspera do vencimento. Exceção com evidência: na retirada de aquisição externa
o teto é o prazo que o próprio fornecedor declarou na cotação escolhida.

## Papéis e segregação de função

| Papel | POP §1 | Pode | Nunca |
|---|---|---|---|
| `compras` | Responsável de Compras | triagem, estoque, necessidade, seleção de cotação | aprovar, pagar, **confirmar recebimento** |
| `financeiro` | Gestão Financeira | aprovar, validar Obra/Cliente, pagar | criar pedido, selecionar cotação |
| `diretoria` | — | aprovar acima da alçada, dispensar segregação, confirmar recebimento no lugar do solicitante | — |

Solicitante não é papel: é capacidade de quem tem acesso ao departamento
Financeiro da empresa. Ele **confirma o recebimento** do próprio pedido (ver
abaixo). `admin` não opera o fluxo.

**Quatro pares que nunca caem na mesma pessoa**, por pedido:

1. quem criou não aprova;
2. quem selecionou a cotação não aprova;
3. quem aprovou não paga;
4. quem selecionou a cotação não confirma o recebimento.

### Quem confirma o recebimento

**O solicitante**, não o Responsável de Compras. É divergência consciente do POP
§2.2/§2.5, e resolve o par 4 sem exigir dois compradores.

O raciocínio: o par 4 é a separação clássica — quem escolheu o fornecedor não
atesta que a mercadoria dele chegou. Satisfazê-lo com um segundo comprador faria
o controle disparar em 100% das compras externas de uma equipe pequena, e o
contador de dispensas viraria a contagem de compras externas. O POP já oferece a
segunda pessoa certa e mais barata ao dizer que o responsável "informa o
repasse/entrega do produto ao solicitante": quem está com o material na mão é
quem pediu. Todo pedido tem solicitante por construção, então a regra não depende
do tamanho do time.

Saída de emergência: a **diretoria** confirma no lugar do solicitante, com
justificativa obrigatória, registrada no evento. Solicitante de férias não pode
travar uma entrega.

A dispensa existe, exige justificativa escrita, só a diretoria usa, gera
`compras.segregacao_dispensada` e aparece contada no scorecard. Controle que não
pode ser quebrado é contornado por fora do sistema, onde ninguém vê.

## Isolamento entre Plugga e Waze

Compras é a primeira entidade de domínio com `companyId`. A prova de alcance
`(pessoa, empresa, departamento financeiro)` está em
`ComprasEscopoRepository` — ver o adendo da [ADR-0004](../adr/0004-auth-rbac-stub.md).
O `companyId` que chega na requisição é pretensão do navegador até passar por lá.
Pedido de outra empresa responde **404**, não 403: confirmar existência já vaza.

## Indicadores (POP §4)

| # | Indicador | Fórmula | Farol |
|---|---|---|---|
| 4.1 | Assertividade Global | `Σ faturado ÷ Σ orçado` | verde 95–100 · amarelo 85–94 · vermelho <85 · **fora da régua acima de 100** |
| 4.2 | % Backlog Crítico | `vencidas ÷ emitidas`, por executor · **pode passar de 100%** | sem farol — o POP não define faixas |
| 4.3 | Cumprimento de SLA | `no prazo ÷ concluídas`, por etapa | mesma régua do 4.1 |

Decisões de leitura que o POP não explicita e que ficam registradas:

- **4.1 agrega por soma**, não por média de percentuais: um pedido de R$ 200 não
  pode mover o indicador do setor tanto quanto um de R$ 200 mil. Só entram
  pedidos concluídos no período **e de aquisição externa** — retirada de estoque
  não gera faturamento, e incluí-la com faturado zero afundaria o número medindo
  uma compra que não houve.
- **Acima de 100% é `fora_da_regua`**, não verde: a tabela do §4.1 define verde
  como "95% a 100%" e manda diagnosticar ao sair da faixa.
- **4.2 conta o pedido como OS**, não a passagem. `emitidas` e `concluidas` são
  fluxo do período; `pendentesNoPrazo` e `pendentesVencidas` são a **fila real**
  na data de fim, venham de quando vierem. As partes não somam as emitidas e o
  percentual pode passar de 100% — fila acumulada maior que a vazão da semana é
  o alarme que o POP §4.2 descreve. Uma versão anterior restringia as pendências
  à coorte do período: a conta fechava bonito e o indicador zerava na semana
  seguinte com o funil cheio de card vencido.
- **O scorecard de um período fechado não muda depois**: todo estado é avaliado
  na data de fim do período, nunca "agora".
- **Diagnóstico** (fora do scorecard): assertividades Orçamentária e de Execução,
  e o Indicador Cruzado com os cortes de 2 e 9 dias úteis. A aquisição vai da
  primeira entrada em Cotações à saída de Pagamento, **incluindo o tempo de
  REVISAR** — é o ciclo que a operação sente.

## Onde está o código

```
apps/api/src/compras/
├── compras.controller.ts          rotas + matriz de permissão por ação
├── compras.permissions.ts         quem pode o quê
├── compras.rules.ts               transições, segregação, alçada (puro)
├── compras.service.ts             escopo de empresa + orquestração
├── compras-escopo.repository.ts   prova de alcance (dívida: promover a core/auth)
├── prisma-compras.repository.ts   transições transacionais + event_log
├── armazenamento-de-cotacoes.ts   S3/MinIO, falha derruba a criação
├── indicadores/indicadores.ts     4.1, 4.2, 4.3 e diagnóstico (puro)
└── sla/dias-uteis.ts              contagem em dias úteis (puro)

apps/web/app/compras/              funil, novo pedido, ficha, scorecard
packages/shared/src/compras.ts     contratos e constantes do POP
```

## Decisões que se afastam da letra do POP

| Decisão | Por quê |
|---|---|
| **Vários itens por pedido** (o POP usa singular) | Um-por-pedido inflaria "OS emitidas", o denominador do 4.2 **do próprio POP**, e tornaria o frete impossível de ratear |
| **Valor orçado como campo do solicitante** | O §4.1 exige o Orçado na fórmula mas não o lista entre os sete campos; sem ele o indicador não tem denominador |
| **`Fornecedor` como cadastro** | Nome livre impede histórico de preço e deixa a porta aberta para fornecedor fantasma |
| **Destino "interno"** | Compra de escritório não tem obra nem cliente e não teria como ser registrada |
| **Recebimento confirmado pelo solicitante** | O POP dá o CONCLUIR ao Responsável de Compras, mas quem escolhe o fornecedor não deve atestar a entrega dele. O próprio POP nomeia o solicitante como quem recebe o repasse |
| **Extensão da retirada só no externo** | O fluxograma imprime "5 d.u. ou mais" nos dois ramos, mas os dois documentos atribuem a extensão ao cronograma de fornecedor externo. Entre o desenho e a causa escrita, vale a causa |

## Testes

```
pnpm --filter @plugga/api test            # unitários + e2e com dublê (sem infra)
pnpm --filter @plugga/api test:compras    # integração contra o Postgres local
```

Os testes de integração cobrem o que o dublê não alcança: transações, o índice
único parcial de passagem aberta, os CHECK da migração, a numeração por empresa,
a escrita no `event_log` e o mapeamento coluna→campo dos indicadores. Ficam atrás
de `RUN_COMPRAS_INTEGRATION_TESTS` para a suíte padrão seguir hermética.

## Em aberto

- **Alçada** (`COMPRAS_ALCADA_FINANCEIRO`) nasce sem teto, o que reproduz o POP
  exatamente. Definir um valor liga o degrau da diretoria sem mudar mais nada.
- **`Client` não tem `companyId`**: nada no banco impede uma obra da Waze apontar
  para um cliente usado na Plugga. Validado na aplicação; a correção real é do
  módulo de clientes.
- **Prazo do fornecedor** é lido em dias úteis, como toda a régua do §3. Se as
  propostas vierem em dias corridos, o prazo da retirada fica maior que o real.
