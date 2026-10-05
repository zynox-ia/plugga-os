# Relatório de dados de cliente na árvore (T034)

Gerado por `node scripts/scan-dados-cliente.mjs --tree` em 2026-10-05, **sem nomes de cliente** (`CLIENT_NAMES_FILE` não estava disponível: depende do dono, T006). Traz arquivo, linha e tipo; nunca o valor. Pode haver falsos positivos (por exemplo, número de fatura com dígito verificador por acaso válido) e a revisão do dono é a T041.

## Resumo por tipo

| Tipo | Ocorrências |
|---|---|
| unidade-consumidora | 62 |
| cnpj | 28 |

Histórico (`--history`, linhas adicionadas em todas as refs): 184 ocorrências (98 combinações distintas de arquivo, linha e tipo, repetidas em vários commits); a lista completa sai da reescrita (T047), que usa o mesmo comando.

## Por diretório

| Diretório | Ocorrências |
|---|---|
| `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica` | 48 |
| `apps/api/src/energy-efficiency` | 24 |
| `apps/web/app/lib` | 10 |
| `docs/mockup` | 3 |
| `packages/auditoria-oraculo/manifesto.json` | 3 |
| `apps/api/prisma/seed.ts` | 1 |
| `apps/api/test/market-migrations.e2e.spec.ts` | 1 |

## Detalhe (arquivo, linha, tipo)

- `apps/api/prisma/seed.ts:436` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/amazonas-tff-2026-04.corpus.spec.ts:32` cnpj
- `apps/api/src/energy-efficiency/fatura/congelar.corpus.spec.ts:78` cnpj
- `apps/api/src/energy-efficiency/fatura/congelar.spec.ts:116` cnpj
- `apps/api/src/energy-efficiency/fatura/congelar.spec.ts:123` cnpj
- `apps/api/src/energy-efficiency/fatura/energisa-acre-rio-branco-2026-06.corpus.spec.ts:38` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/energisa-acre-rio-branco-2026-06.corpus.spec.ts:84` cnpj
- `apps/api/src/energy-efficiency/fatura/energisa-ro-cantuaria-2026-06.corpus.spec.ts:31` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/energisa-ro-mirante-da-serra-2026-05.corpus.spec.ts:34` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:1578` cnpj
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:1769` cnpj
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:1866` cnpj
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:363` cnpj
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:4694` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:4694` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:4721` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:4721` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:4727` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:4727` unidade-consumidora
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:475` cnpj
- `apps/api/src/energy-efficiency/fatura/golden/concessionarias-golden-base.ts:4792` cnpj
- `apps/api/src/energy-efficiency/fatura/itens.spec.ts:206` cnpj
- `apps/api/src/energy-efficiency/fatura/usina-cerrado-sintetica-2026-01.pagina.json:61` cnpj
- `apps/api/src/energy-efficiency/nucleo/templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html:7` unidade-consumidora
- `apps/api/src/energy-efficiency/nucleo/templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html:7` unidade-consumidora
- `apps/api/test/market-migrations.e2e.spec.ts:63` unidade-consumidora
- `apps/web/app/lib/mock/dashboard.ts:40` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:120` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:152` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:169` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:186` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:203` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:48` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:72` unidade-consumidora
- `apps/web/app/lib/mock/energy.ts:96` unidade-consumidora
- `apps/web/app/lib/mock/pendencias.ts:49` unidade-consumidora
- `docs/mockup/index.html:573` unidade-consumidora
- `docs/mockup/index.html:816` unidade-consumidora
- `docs/mockup/index.html:816` unidade-consumidora
- `packages/auditoria-oraculo/manifesto.json:596` unidade-consumidora
- `packages/auditoria-oraculo/manifesto.json:606` unidade-consumidora
- `packages/auditoria-oraculo/manifesto.json:611` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/README.md:45` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/README.md:46` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/SKILL.md:24` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/assets/registrar_entrega.py:18` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/INDEX.md:25` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/INDEX.md:26` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/INDEX.md:26` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/INDEX.md:26` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/INDEX.md:27` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/INDEX.md:27` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-brasilia-2026-06.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-brasilia-2026-06_conciliada.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-cantuaria-2026-06.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-cantuaria-2026-06_conciliada.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-imigrantes-2026-06.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-imigrantes-2026-06_conciliada.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-jardim-floresta-2026-06.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-jardim-floresta-2026-06_conciliada.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-jatuarana-2026-06.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-jatuarana-2026-06_conciliada.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-santa-tereza-2026-06.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/fatura-santa-tereza-2026-06_conciliada.json:3` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/serra-verde-uc-0188872-2-2025-06.md:1` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/serra-verde-uc-0188872-2-2025-06.md:1` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/serra-verde-uc-0188872-2-2025-06.md:45` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/serra-verde-uc-0188872-2-2025-06.md:46` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/uc-01939890-santa-tereza.md:1` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/uc-01939890-santa-tereza.md:2` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/uc-01939890-santa-tereza.md:27` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/uc-3531002-1-am-quimica.md:1` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/uc-3531002-1-am-quimica.md:1` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/casos/uc-3531002-1-am-quimica.md:2` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/references/piloto-serra-verde.md:1` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/references/piloto-serra-verde.md:1` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/references/piloto-serra-verde.md:38` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/references/piloto-serra-verde.md:39` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/references/prd-trava-dupla-consulta-estudo-bess.md:34` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/scripts/generate_jardim_floresta_2026_06.py:31` cnpj
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/scripts/generate_jardim_floresta_2026_06.py:9` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/scripts/generate_porto_velho_2026_06_bess.py:8` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/scripts/generate_porto_velho_2026_06_bess.py:9` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/scripts/generate_santa_tereza_2026_06_solar_bess.py:7` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/scripts/generate_santa_tereza_2026_06_solar_bess.py:8` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/scripts/generate_santa_tereza_2026_06_solar_bess.py:8` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/state.json:14` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/state.json:15` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html:7` unidade-consumidora
- `packages/auditoria-oraculo/referencia/skill-estudo-eficiencia-energetica/templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html:7` unidade-consumidora
