# Huly CRM - avaliacao de incorporacao no plugga-os

- **Status:** avaliacao tecnica
- **Data:** 2026-08-18
- **Escopo:** referencia de produto e arquitetura para a evolucao do CRM; nao autoriza integracao, deploy ou cutover.

## Conclusao

O Huly e uma referencia valida para experiencia de CRM colaborativo e para o
desenho de objetos conectados. Ele nao e uma base tecnica compativel para ser
incorporada ao `plugga-os`.

O caminho recomendado e manter o `plugga-os` como monolito modular e implementar
seletivamente, com codigo proprio, os comportamentos de maior valor do Huly. Nao
devemos importar pacotes, copiar modelos internos nem conectar um Huly self-hosted
ao banco ou autenticacao do produto.

## Evidencias

| Aspecto | Huly self-hosted | plugga-os | Implicacao |
|---|---|---|---|
| Arquitetura | 30+ microservicos | Monolito modular Next.js + NestJS | Integracao direta viola o ADR-0002. |
| Persistencia | CockroachDB, Elasticsearch, MinIO | PostgreSQL com Prisma | Nao ha banco, modelo ou migracao compartilhavel. |
| Comunicacao | Redpanda/Kafka, WebSockets, eventos distribuidos | HTTP, Prisma, `event_log`, BullMQ/Redis | Reproduzir apenas necessidades comprovadas, dentro do monolito. |
| Operacao | Minimo 2 vCPU/8 GB RAM; recomendado 4 vCPU/16 GB | VPS voltada ao sistema unico | Nao adicionar a carga operacional do Huly a producao. |
| Licenca | Eclipse Public License 2.0 | Codigo proprietario do produto | Uso comercial e possivel, mas arquivo Huly modificado e distribuido exige disponibilizacao do fonte correspondente. |

Fontes consultadas em 2026-08-18:

- https://github.com/hcengineering/platform/blob/develop/LICENSE
- https://github.com/hcengineering/platform/blob/develop/ARCHITECTURE_OVERVIEW.md
- https://github.com/hcengineering/huly-selfhost/blob/main/README.md

Esta avaliacao nao substitui analise juridica para uma distribuicao que inclua
codigo do Huly ou seus arquivos derivados.

## O que ja existe

O produto ja contem duas frentes que devem continuar separadas:

| Frente | Estado atual | Referencias |
|---|---|---|
| CRM comercial geral | Oportunidades, contatos e contratos; pipeline e regras de transicao | `apps/api/src/commercial/`, `apps/web/app/comercial/` |
| CRM PluggaMob | Fila de reativacao, perfil de usuario, contatos, opt-out, segmentos, sessoes e auditoria | `apps/api/src/pluggamob/`, `EvUser`, `EvContact`, `EvSession` |

O mapa do MVP define o CRM PluggaMob como a entrega B2. O CRM comercial geral
continua V2 no documento de produto. Os dois nao devem ser fundidos em uma unica
entidade de cliente: possuem jornadas, dados externos e regras diferentes.

## Conceitos que valem extrair

1. **Timeline unificada por ficha.** Projetar contatos, mudancas de segmento,
   sessoes, campanhas e aprovacoes em uma linha do tempo legivel. O
   `event_log` existente continua sendo a fonte de auditoria; a timeline e uma
   leitura de dominio, nao um segundo log generico.
2. **Atividades e proxima acao.** Formalizar responsavel, prazo, resultado e
   lembrete para a fila do dia. O comercial ja exige responsavel e proxima acao
   para oportunidades abertas; aplicar o mesmo padrao ao CRM PluggaMob.
3. **Campanhas como objetos proprios.** Criar campanha, publico/segmento,
   limite diario, aprovacao humana, participacoes e resultado. Nao confundir
   campanha com envio: WhatsApp permanece no-op ate novo gate de integracao.
4. **Relacionamentos navegaveis.** A ficha PluggaMob deve ligar usuario,
   contatos, sessoes, cupons, incidentes e campanhas sem duplicar dados.
5. **Busca e filtros orientados a operacao.** Comecar no PostgreSQL com indices e
   filtros por nome, telefone mascarado, segmento, responsavel e proxima acao.
   Elasticsearch so e justificavel por uma medicao que prove sua necessidade.
6. **Colaboracao leve.** Comentarios, mencoes e atribuicao podem entrar como
   objetos de dominio. Presenca em tempo real e CRDT nao sao requisitos do CRM
   atual e ficam fora do escopo.

## O que nao extrair agora

- Transactor, sincronizacao por WebSocket, CRDT/Y.js e modelo de documentos do Huly.
- CockroachDB, Redpanda/Kafka, Elasticsearch, MinIO e qualquer servico Huly.
- Conta, workspace, permissoes ou autenticacao do Huly.
- Interface Svelte, componentes ou codigo da plataforma.
- Um clone do produto Huly: chat, projetos, documentos colaborativos e video nao
  resolvem o proximo problema do CRM PluggaMob.

## Plano recomendado

### Fase 0 - referencia isolada

- Se a equipe quiser validar a experiencia, subir o Huly somente em maquina local
  ou host de laboratorio, em diretorio e volumes separados.
- Usar dados ficticios; sem dominio publico, contas reais, integracoes, dados de
  producao ou conexao com o `plugga-os`.
- Registrar os fluxos que de fato melhoram a operacao antes de implementar algo.

### Fase 1 - CRM PluggaMob B2

- Evoluir `PluggamobModule`, sem depender de `CommercialModule`.
- Adicionar campanha, participacao em campanha e atividade de reativacao ao modelo
  PluggaMob.
- Montar a ficha e a timeline a partir de `EvUser`, `EvContact`, `EvSession`,
  cupons, incidentes e eventos de dominio existentes.
- Entregar fila do dia, segmentos, ficha de cliente e registro de contato antes de
  automacao, busca avancada ou tempo real.

### Fase 2 - campanhas e KPIs

- Incluir estados `rascunho`, `aprovada`, `ativa` e `pausada`, com aprovador e
  limite diario.
- Calcular funil e reativacao a partir dos dados do OS.
- Manter todo disparo externo bloqueado ate o gate de integracao e LGPD.

### Fase 3 - capacidades acionadas por evidencia

- Notificacoes internas com BullMQ/Redis quando houver necessidade concreta.
- Busca dedicada somente se os indices PostgreSQL nao sustentarem a experiencia.
- Avaliar sincronizacao em tempo real apenas se a operacao multiusuario provar a
  necessidade; nao antecipar a infraestrutura do Huly.

## Criterios de aceite para iniciar Fase 1

- B1 concluido conforme ADR-0011: auth real, RBAC, e migracao read-only validada.
- Backlog B2 aprovado com entidades, permissoes e eventos de auditoria definidos.
- Testes cobrindo opt-out, limite diario, aprovacao de campanha e ligacao de uma
  conversao a sessao.
- Nenhum write em PluggaMob/OCPP, WhatsApp ou outro sistema de producao.

## Decisao pendente

Confirmar se vale executar a Fase 0 como laboratorio visual. Ela e opcional: o
CRM PluggaMob pode avancar diretamente pelo plano acima sem instalar Huly.
