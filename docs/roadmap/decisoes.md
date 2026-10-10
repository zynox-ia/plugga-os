# Decisões do roadmap

## 2026-10-10 — Primeiro recorte: Fundação

- **Decisão:** a primeira versão do roadmap trabalha somente a Fundação do Plugga OS. As demais capacidades do sistema interno Plugga/Waze ficam para revisões posteriores.
- **Motivo:** André definiu este recorte após ver o estado do código e dos projetos existentes no Linear; a Fundação ainda possui checkpoints e a Spec 002 pendentes.
- **Alternativa considerada:** detalhar agora Produto unificado, Integrações operacionais, Eletromobilidade e os demais módulos. Adiada para evitar planejar specs sem fechar a base e sem definir o fluxo principal de negócio.

## 2026-10-10 — Execução sequencial

- **Decisão:** trabalhar uma issue por vez. A primeira é PLU-262; PLU-260 é a próxima candidata após seu fechamento e verificação. PLU-1 permanece como índice histórico.
- **Motivo:** André confirmou que as issues da Fundação ainda são pendentes e pediu execução sequencial. PLU-262 fecha o checkpoint local da etapa mais antiga antes da verificação na VPS.
- **Alternativa considerada:** continuar várias issues da Fundação em paralelo, como indicam os status legados `In Progress` no Linear. Não adotada.

## 2026-10-10 — Organização do Linear em revisão posterior

- **Decisão:** este primeiro PR registra o roadmap sem mover issues, mudar status ou apagar milestones no Linear. Uma tabela `atual → padrão` será aprovada antes de reconciliar os sete milestones legados com Alpha, Beta e GA.
- **Motivo:** os milestones antigos guardam 244 issues da Fundação, incluindo sub-issues; a migração em massa precisa ser revista item a item para preservar o histórico.
- **Alternativa considerada:** migrar todos os itens junto com a criação do roadmap. Adiada por exigir revisão específica do mapeamento.
