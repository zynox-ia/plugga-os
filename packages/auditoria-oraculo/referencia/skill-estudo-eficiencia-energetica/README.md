# Skill: Estudo de Eficiência Energética (Auditoria + BESS/Solar)

**Área: backoffice-suporte · Padrão fechado por Dilkson em 08/08/2026**

Produz o Relatório de Auditoria Energética Plugga (fatura cativa/ML + estudo
BESS e Solar+BESS) de forma **determinística e à prova de erro aritmético**,
operável pelo time via Telegram.

## Comece por aqui

| Arquivo | O que é |
|---|---|
| `SKILL.md` | O fluxo operacional passo a passo (o que executar, em ordem) |
| `PRD.md` | O sistema completo: problema, arquitetura, travas, semáforo, papéis |
| `SOUL.md` | Os 10 princípios do auditor (em conflito, eles vencem) |
| `POLICIA.md` | Proibições e protocolo de fiscalização/amostragem |
| `DOCTOR.md` | Auto-diagnóstico: rodar após commits e antes de produzir |
| `MEMORY.md` | Memória institucional: decisões e lições (não reaprender no erro) |

## Pipeline (resumo de 1 linha)

```
fatura.json → TRAVA1 conciliar → SEMÁFORO → caso.json → MOTOR → GERADOR
→ celular → TRAVA2 verificar → TRAVA4 registrar → enviar (2 arquivos)
```

## Mapa da pasta

```
SKILL.md PRD.md README.md SOUL.md DOCTOR.md POLICIA.md MEMORY.md
assets/
  motor_bess_solar.py           # única calculadora (validada ao centavo)
  gerar_relatorio_do_modelo.py  # gerador com travas (CSS/sobras/seções)
  gerar_versao_celular.py       # camada mobile v2 (aprovada 08/08)
  render_pdf_claro.sh           # único caminho de PDF (fundo claro)
  conciliar_fatura.py           # TRAVA 1 — soma itens = total
  verificar_relatorio.py        # TRAVA 2 — verificador aritmético do HTML
  triagem_semaforo.py           # verde/amarelo/vermelho + tipos conhecidos
  teste_regressao.py            # TRAVA 3 — golden test (Santa Tereza)
  registrar_entrega.py          # TRAVA 4 — log de produção com hash
templates/
  modelo-aprovado-cliente-serra-verde-2025-06-b.html   # MODELO CONGELADO
casos/
  INDEX.md                      # todos os casos
  uc-01939890-santa-tereza.md   # caso de REFERÊNCIA (aprovado 100%)
  uc-3531002-1-am-quimica.md    # contra-exemplo (ML inviável)
  caso-*.json                   # casos do motor e do gerador
  tipos-conhecidos.json         # registro do semáforo (verde)
  golden-hashes.json            # hashes da versão aprovada
  registro-producao.jsonl       # TRAVA 4 — toda entrega, com hash
references/                     # planilhas-fonte de Dilkson (arquivadas)
```

## Os 3 números de validação do motor (se mudar, o motor foi adulterado)

- Planilha Solar (modo legado): VPL R$ 4.187.197,95
- Planilha REV04: TIR 33,74%
- Caso de referência Santa Tereza (só BESS): VPL R$ 1.980.421,43 · TIR 22,14%

## Quem procurar

- Dúvida técnica/caso amarelo: Claude (sessão do Dilkson) ou agente auditor.
- Premissas comerciais e aprovação de tipo novo: **Dilkson** (4 números).
- Nunca resolver "no jeitinho": ver `POLICIA.md`.
