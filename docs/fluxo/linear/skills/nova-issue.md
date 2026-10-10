# Skill do agente do Linear: `/nova-issue`

**Como instalar**
1. Abra uma conversa com o agente do Linear e cole o bloco abaixo.
2. Em seguida, faça um pedido real (ex.: "bug: a etapa do cliente não salva ao fechar o modal, no sistema do Bruno").
3. Ajuste o resultado até ficar bom e peça: *"Salve esta conversa como a skill pessoal nova-issue."*
4. Ela fica em *Settings → Account → Agent personalization → Skills* e é usada com `/nova-issue` em qualquer time.

Pré-requisito: o guidance do workspace (`guidance-agente-linear.md`) e os templates (`templates.md`) configurados.

---

```markdown
# /nova-issue — registrar uma demanda no padrão

Objetivo: transformar o pedido do André, dito com as palavras dele, numa issue pronta para a fila dos agentes, seguindo o guidance do workspace (prefixos, títulos, campos, estrutura). Em caso de dúvida sobre uma regra, o guidance vale.

## Passo 1 — Entender
Extraia do pedido: o cliente/sistema (time), a tela ou área, o que deve acontecer e o que acontece hoje (se for defeito).

## Passo 2 — Classificar
1. Tipo e prefixo:
   - Defeito? Já quebrado em produção → [HOTFIX]. Só na develop ou ainda não liberado → [FIX].
   - Algo novo ou melhoria que o usuário percebe → [FEAT].
   - Mudança interna sem efeito visível → [REFACTOR], [PERF], [INFRA], [CHORE] ou [DOCS].
   - Autenticação, permissões, dados pessoais → [SECURITY].
2. Estimativa (XS, S, M, L, XL) pela descrição do pedido:
   - XS: texto, ordem, um campo existente. S: mudança localizada numa tela.
   - M: uma funcionalidade com tela e dados. L: várias funcionalidades relacionadas.
   - XL: várias capacidades num pedido só → não crie; proponha a quebra em 2–6 issues e espere o ok.
3. Spec ou avulsa:
   - Spec (issue pai): todo [FEAT], [REFACTOR], [PERF], [SECURITY] e [INFRA], qualquer tamanho.
   - Avulsa: [FIX], [HOTFIX], [CHORE] e [DOCS].
4. Bug/hotfix: Severity (S1 produção parada, S2 quebrado sem contorno, S3 com contorno, S4 cosmético). HOTFIX S1/S2 → Priority Urgent.

## Passo 3 — Localizar
1. Time: o do cliente. Mais de um candidato ou nenhum → pergunte.
2. Projeto: o da capacidade a que o pedido pertence; na dúvida, o projeto ativo do time.
3. Milestone: o que o pedido ajuda a fechar; na dúvida, o mais antigo em aberto (Alpha → Beta → GA).
4. Labels de domínio do time que se aplicam.
5. Duplicatas: busque issues abertas do time com termos parecidos. Achou → mostre e pergunte se é a mesma coisa.
6. Dependências citadas pelo André ("só depois de…") → relação blocked by, com o ID da issue que precisa vir antes. A issue citada não existe ainda → pergunte se ela deve ser registrada primeiro.
7. Spec: número = maior "Spec NNN" existente no time + 1 (3 dígitos).

## Passo 4 — Perguntar (no máximo 3 perguntas, todas de uma vez)
Só se faltar algo sem o qual a issue fica ambígua: o time ou a tela; o resultado esperado; num defeito, como reproduzir. O resto vai para "Dúvidas em aberto".

## Passo 5 — Redigir
- Use o template do tipo: Issue pai (spec), Avulsa, Bug ou Hotfix.
- Título no padrão do guidance. Bug: o sintoma, não a correção.
- Critérios de aceite em "Dado / Quando / Então", verificáveis por quem usa o sistema.
- Spec: liste as user stories previstas como frases afirmativas e verificáveis (ex.: "Cliente é cadastrado com nome e telefone").
- "Fora de escopo" obrigatório; se o André não disse nada, sugira e marque "(sugerido)".
- Descreva O QUÊ e POR QUÊ; nunca invente nomes de arquivos, tabelas, rotas ou soluções técnicas.

## Passo 6 — Mostrar e confirmar
Mostre neste formato e pergunte antes de criar:

Título: <título>
Time: <time> · Projeto: <projeto> · Milestone: <milestone>
Type: <type> · Estimate: <estimate> · Priority: <priority> · Severity: <se bug> · Domínio: <labels> · Flags: <se houver>
Bloqueada por: <IDs ou "—">
<descrição completa>

"Crio assim? Fica em Backlog ou já vai para Ready?"
(Se o André já disse nesta conversa "pode criar" ou "manda pra fila", não pergunte de novo.)

## Passo 7 — Criar e responder
Crie com todos os campos e relações. Status: Backlog (padrão) ou Ready (só com o ok do André). Anexe prints e links que ele enviou.
Responda em uma linha:
"Criada: <ID> <título> · <projeto> · <milestone> · <estimate> · <status>"

## Nunca
- Criar sem time, Type ou Estimate; criar issue XL; criar sub-issues de spec (são do 04 Planejador).
- Mover para qualquer status além de Backlog ou Ready.
- Inventar detalhes técnicos.

## Exemplos de classificação
- "A etapa do cliente não salva quando fecho o modal" (só na develop) → [FIX] Etapa do cliente não persiste ao fechar o modal · Bug · S · S2 · avulsa.
- "Checkout dando erro 500 pra cartão internacional, cliente reclamando" → [HOTFIX] Checkout retorna erro 500 para cartões internacionais · Hotfix · S · S1 · Urgent · avulsa.
- "Quero cadastrar cliente e filtrar a lista por etapa" → [FEAT] Spec 007 — Cadastro e listagem de clientes · Feature · M · spec, US previstas: "Cliente é cadastrado com nome e telefone", "Lista de clientes pode ser filtrada por etapa".
- "Trocar o texto do botão Salvar para Confirmar" → [FEAT] Spec 008 — Botão de salvar do cadastro exibe "Confirmar" · Feature · XS · spec (todo [FEAT] é spec).
- "Atualizar o Next pra versão 16" → [CHORE] Atualizar Next.js para a versão 16 · Chore · S · avulsa (se exigir mudar código do produto por incompatibilidade, registre também um [REFACTOR] em spec).
```
