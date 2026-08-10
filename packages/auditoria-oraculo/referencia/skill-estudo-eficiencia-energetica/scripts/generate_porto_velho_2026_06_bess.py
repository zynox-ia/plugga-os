#!/usr/bin/env python3
from pathlib import Path
import base64, re, math
ROOT=Path('/root/.openclaw/workspace')
SKILL=ROOT/'brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica'
TPL=SKILL/'templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html'
LOGO=ROOT/'skills/relatorio-economia-plugga/assets/logo_clara.png'
OUTDIR=ROOT/'reports/estudo-bess/porto-velho-uc-83534-2026-06'
OUT=OUTDIR/'PLG-ESTUDO-BESS-PORTO-VELHO-UC-83534-06-2026-V01-R00.html'
style=re.search(r'<style>(.*?)</style>', TPL.read_text(encoding='utf-8'), re.S).group(1)
style += '''\n.warn{border-left:5px solid #f59e0b;background:#fff8eb;padding:12px 14px;border-radius:10px;margin:10px 32px;color:#4b3412}.ok{border-left:5px solid var(--teal);background:#f7fbf9;padding:12px 14px;border-radius:10px;margin:10px 32px}.scenario-table td:nth-child(n+2){text-align:right}.scenario-table td:last-child{text-align:left}.flow-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin:16px 32px}.flow-grid .mini-chart{min-height:260px}.full-chart{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;margin:18px 32px}.timeline{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:18px 32px 28px}.step{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px}.num{width:34px;height:34px;border-radius:50%;background:#0f5740;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;margin-bottom:12px}.analysis{background:linear-gradient(135deg,#0b3d2e 0%,#0f5740 58%,#0b4b38 100%);border:0;border-radius:28px;padding:34px 38px;margin:26px 32px;color:#eafff6}.analysis h2{margin:0 0 20px;padding:0;border:0;color:#fff;font-size:27px;line-height:1.15}.analysis p{font-size:15px;line-height:1.7;margin:0 0 16px;color:#e8fff7}.analysis b{color:#fff}@media print{.warn,.ok,.flow-grid,.timeline,.analysis,.full-chart{break-inside:avoid;page-break-inside:avoid}.timeline{grid-template-columns:repeat(5,1fr)}}'''

def money(v): return 'R$ '+f'{v:,.2f}'.replace(',','X').replace('.',',').replace('X','.')
def num(v,d=0): return f'{v:,.{d}f}'.replace(',','X').replace('.',',').replace('X','.')
def perc(v): return f'{v:.2f}%'.replace('.',',')
logo='data:image/png;base64,'+base64.b64encode(LOGO.read_bytes()).decode()
# Dados extraídos da fatura Porto Velho / Energisa RO
cliente='INSTITUIÇÃO ADVENTISTA DE EDUCAÇÃO E ASSISTÊNCIA SOCIAL — PORTO VELHO'
uc='83534'
distrib='Energisa Rondônia'
ref='06/2026'
venc='11/07/2026'
periodo='30/04/2026 a 31/05/2026'
cons_p=687.57
cons_fp=26418.06
cons=cons_p+cons_fp
dem_p=19.68
dem_fp=165.80
dem_contr=160.0
tar_p=3.463060
tar_fp=0.211030
valor_p=2381.10
valor_fp=5575.17
valor_dem=8261.40
valor_total=13237.76
cosip=715.70
creditos=-3834.37
spread=tar_p-tar_fp
# BESS isolado
bess_kwh=241
bess_kw=108
capex_bess_unit=550000
ponta_dia=cons_p/31
units_energy=math.ceil(ponta_dia/bess_kwh)
units_power=math.ceil(dem_p/bess_kw)
units=max(units_energy,units_power,1)
capex_bess=units*capex_bess_unit
econ_bess_m=cons_p*spread
econ_bess_a=econ_bess_m*12
payback_bess=capex_bess/econ_bess_a if econ_bess_a else 0
# Solar+BESS preliminar — premissa interna, precisa validar área e irradiação
fv_kwp=125
prod=130
ger_fv=fv_kwp*prod
capex_fv_kwp=2500
capex_fv=fv_kwp*capex_fv_kwp
capex_solar_bess=capex_fv+capex_bess
# economia FV conservadora só sobre tarifa fora ponta TUSD observada, para não prometer além da fatura
energia_fv_util=min(ger_fv, cons_fp)
econ_fv_m=energia_fv_util*tar_fp
econ_solar_bess_m=econ_fv_m+econ_bess_m
econ_solar_bess_a=econ_solar_bess_m*12
payback_solar_bess=capex_solar_bess/econ_solar_bess_a if econ_solar_bess_a else 0
# financeiro BESS
cash=[econ_bess_a*(1.04**(y-1)) for y in range(1,21)]
npv=-capex_bess+sum(cf/(1.05**i) for i,cf in enumerate(cash,1))
lo,hi=-0.95,1.0
for _ in range(100):
    mid=(lo+hi)/2
    val=-capex_bess+sum(cf/((1+mid)**i) for i,cf in enumerate(cash,1))
    if val>0: lo=mid
    else: hi=mid
irr=(lo+hi)/2
cf_svg='<svg class="chart-svg" viewBox="0 0 720 300"><line x1="40" y1="255" x2="690" y2="255" stroke="#d9e7e1"/><line x1="40" y1="35" x2="40" y2="255" stroke="#d9e7e1"/>'
maxcf=max(cash)
pts=[]
for i,cf in enumerate(cash,1):
    x=45+(i-1)*(620/19); y=255-(cf/maxcf)*195; pts.append(f'{x:.1f},{y:.1f}')
cf_svg += f'<polyline points="{" ".join(pts)}" fill="none" stroke="#1faa7e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="44" y="28" class="axis">Eixo Y: valor (R$) • Eixo X: tempo (anos)</text><text x="40" y="285" class="axis">1</text><text x="650" y="285" class="axis">20</text></svg>'
year_rows=''.join(f'<tr><td>Ano {i}</td><td>{money(cf)}</td></tr>' for i,cf in enumerate(cash,1))
# charts
bars=f'''<svg class="chart-svg" viewBox="0 0 480 230"><line x1="40" y1="180" x2="455" y2="180" stroke="#d9e7e1"/><line x1="40" y1="25" x2="40" y2="180" stroke="#d9e7e1"/><rect x="80" y="30" width="64" height="150" rx="8" fill="#2563eb"/><text x="112" y="22" text-anchor="middle" class="value">{num(cons_fp,2)} FP</text><rect x="210" y="{180-(cons_p/cons_fp*150):.1f}" width="64" height="{cons_p/cons_fp*150:.1f}" rx="8" fill="#f59e0b"/><text x="242" y="{180-(cons_p/cons_fp*150)-8:.1f}" text-anchor="middle" class="value">{num(cons_p,2)} Ponta</text><rect x="340" y="{180-(dem_fp/200*150):.1f}" width="64" height="{dem_fp/200*150:.1f}" rx="8" fill="#7c3aed"/><text x="372" y="{180-(dem_fp/200*150)-8:.1f}" text-anchor="middle" class="value">{num(dem_fp,2)} kW</text><text x="80" y="205" class="axis">Fora ponta</text><text x="210" y="205" class="axis">Ponta</text><text x="340" y="205" class="axis">Demanda</text></svg>'''
compare=f'''<svg class="chart-svg" viewBox="0 0 480 230"><line x1="40" y1="180" x2="455" y2="180" stroke="#d9e7e1"/><line x1="40" y1="25" x2="40" y2="180" stroke="#d9e7e1"/><rect x="75" y="30" width="75" height="150" rx="8" fill="#0f5740"/><text x="112" y="22" text-anchor="middle" class="value">{money(valor_total)}</text><rect x="205" y="{180-((valor_total-econ_bess_m)/valor_total*150):.1f}" width="75" height="{((valor_total-econ_bess_m)/valor_total*150):.1f}" rx="8" fill="#1faa7e"/><text x="242" y="{180-((valor_total-econ_bess_m)/valor_total*150)-8:.1f}" text-anchor="middle" class="value">{money(valor_total-econ_bess_m)}</text><rect x="335" y="{180-(econ_bess_m/valor_total*150):.1f}" width="75" height="{(econ_bess_m/valor_total*150):.1f}" rx="8" fill="#f59e0b"/><text x="372" y="{180-(econ_bess_m/valor_total*150)-8:.1f}" text-anchor="middle" class="value">{money(econ_bess_m)}</text><text x="112" y="205" text-anchor="middle" class="axis">Atual</text><text x="242" y="205" text-anchor="middle" class="axis">Com BESS</text><text x="372" y="205" text-anchor="middle" class="axis">Economia</text></svg>'''
html=f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESTUDO BESS — Porto Velho | Plugga</title><style>{style}</style></head><body><main class="page"><section class="hero"><div class="eyebrow">PLUGGA GESTÃO • ESTUDO BESS</div><h1>Estudo de Eficiência Energética Solar+BESS</h1><div class="client">Cliente <b>{cliente}</b> • UC {uc} • {distrib} • Referência {ref} • Modelo Jardim Floresta</div><div class="brandmark"><img class="logo-img" src="{logo}" alt="Plugga"><div class="tag">você no controle da sua energia</div></div><div class="chips"><span class="chip">Grupo A / A4</span><span class="chip">Modalidade Verde</span><span class="chip">BESS isolado</span><span class="chip">Solar+BESS</span></div></section><div class="toc"><span>Resumo</span><span>Fatura</span><span>Demanda</span><span>Ponta</span><span>BESS</span><span>Solar+BESS</span><span>Próximos passos</span></div>
<h2>1. Resumo</h2><div class="grid"><div class="kpi"><span>Total da fatura</span><strong>{money(valor_total)}</strong></div><div class="kpi"><span>Consumo total</span><strong>{num(cons,2)} kWh</strong></div><div class="kpi"><span>Consumo ponta</span><strong>{num(cons_p,2)} kWh</strong></div><div class="kpi"><span>Valor kWh ponta</span><strong>{money(tar_p)}/kWh</strong></div></div><div class="note">Este é um <b>ESTUDO BESS</b> preliminar usando a fatura de Porto Velho como base. A oportunidade principal é o custo unitário da ponta, que aparece em {money(tar_p)}/kWh contra {money(tar_fp)}/kWh fora ponta.</div><div class="warn"><b>Premissa crítica:</b> a fatura Energisa traz itens de TUSD e créditos APCEI. Antes de proposta final, validar memória de massa, regra tarifária e créditos para não superestimar economia.</div>
<h2>2. Identificação da fatura</h2><table><tr><th>Campo</th><th>Informação</th></tr><tr><td>Cliente</td><td>{cliente}</td></tr><tr><td>UC</td><td>{uc}</td></tr><tr><td>Distribuidora</td><td>{distrib}</td></tr><tr><td>Referência / vencimento</td><td>{ref} / {venc}</td></tr><tr><td>Período</td><td>{periodo}</td></tr><tr><td>Modalidade</td><td>Grupo A · A4 · Verde</td></tr></table>
<h2>3. Consumo e demanda medida</h2><div class="grid"><div class="kpi"><span>Demanda medida ponta</span><strong>{num(dem_p,2)} kW</strong></div><div class="kpi"><span>Demanda medida fora ponta</span><strong>{num(dem_fp,2)} kW</strong></div><div class="kpi"><span>Demanda contratada FP</span><strong>{num(dem_contr)} kW</strong></div><div class="kpi"><span>Ultrapassagem aparente</span><strong>Leve</strong></div></div><table><tr><th>Grandeza</th><th>Ponta</th><th>Fora ponta</th><th>Leitura</th></tr><tr><td>Consumo</td><td>{num(cons_p,2)} kWh</td><td>{num(cons_fp,2)} kWh</td><td>Ponta é pequena em energia, mas muito cara.</td></tr><tr><td>Demanda medida</td><td>{num(dem_p,2)} kW</td><td>{num(dem_fp,2)} kW</td><td>Fora ponta passou da contratada de {num(dem_contr)} kW; validar regra/cobrança.</td></tr><tr><td>Tarifa observada</td><td>{money(tar_p)}/kWh</td><td>{money(tar_fp)}/kWh</td><td>Spread ponta/fora ponta de {money(spread)}/kWh.</td></tr></table><div class="chart-pair"><div class="mini-chart"><h3>Consumo e demanda</h3>{bars}</div><div class="mini-chart"><h3>Leitura técnica</h3><p>A demanda medida de ponta é baixa ({num(dem_p,2)} kW), então o BESS não nasce limitado por potência. O limitador também não é energia, porque a ponta média diária é de apenas {num(ponta_dia,2)} kWh/dia. Assim, 1 unidade já cobre tecnicamente a necessidade preliminar da ponta.</p></div></div>
<h2>4. BESS isolado</h2><div class="grid"><div class="kpi"><span>Unidades preliminares</span><strong>{units}</strong></div><div class="kpi"><span>CAPEX BESS</span><strong>{money(capex_bess)}</strong></div><div class="kpi"><span>Economia mensal</span><strong>{money(econ_bess_m)}</strong></div><div class="kpi"><span>Payback simples</span><strong>{num(payback_bess,1)} anos</strong></div></div><div class="chart-pair"><div class="mini-chart"><h3>Fatura atual x BESS</h3>{compare}</div><div class="mini-chart"><h3>Dimensionamento</h3><table style="width:100%;margin:0"><tr><th>Limitador</th><th>Resultado</th></tr><tr><td>Energia</td><td>{units_energy} unidade</td></tr><tr><td>Potência</td><td>{units_power} unidade</td></tr><tr><td>Preliminar</td><td>{units} unidade LUNA2000-241</td></tr><tr><td>VPL BESS</td><td>{money(npv)}</td></tr><tr><td>TIR</td><td>{perc(irr*100)}</td></tr></table></div></div><div class="warn"><b>Leitura honesta:</b> BESS isolado não parece prioridade de investimento nesta UC com apenas esta fatura. O custo de ponta é alto, mas o volume de ponta é baixo. A oportunidade maior pode estar em ajuste de demanda/contrato, validação tarifária e Solar+BESS se houver área e regra de compensação favorável.</div>
<h2>5. Solar+BESS</h2><div class="grid"><div class="kpi"><span>FV preliminar</span><strong>{num(fv_kwp)} kWp</strong></div><div class="kpi"><span>Geração estimada</span><strong>{num(ger_fv)} kWh/mês</strong></div><div class="kpi"><span>CAPEX FV+BESS</span><strong>{money(capex_solar_bess)}</strong></div><div class="kpi"><span>Payback preliminar</span><strong>{num(payback_solar_bess,1)} anos</strong></div></div><table class="scenario-table"><tr><th>Cenário</th><th>CAPEX</th><th>Economia mensal</th><th>Economia Ano 1</th><th>Leitura</th></tr><tr><td>BESS isolado</td><td>{money(capex_bess)}</td><td>{money(econ_bess_m)}</td><td>{money(econ_bess_a)}</td><td>Baixo volume de ponta limita retorno.</td></tr><tr><td>Solar+BESS preliminar</td><td>{money(capex_solar_bess)}</td><td>{money(econ_solar_bess_m)}</td><td>{money(econ_solar_bess_a)}</td><td>Precisa validar área, crédito, tarifa e curva horária.</td></tr></table><div class="note">CAPEX Solar+BESS foi calculado corretamente como FV + BESS: FV {num(fv_kwp)} kWp × {money(capex_fv_kwp)}/kWp = {money(capex_fv)}; BESS = {money(capex_bess)}; total = {money(capex_solar_bess)}.</div><div class="flow-grid"><div class="mini-chart"><h3>Economia anual BESS isolado</h3>{cf_svg}</div><div class="mini-chart"><h3>Fluxo anual</h3><table style="width:100%;margin:0"><tr><th>Ano</th><th>Economia</th></tr>{year_rows}</table></div></div>
<div class="analysis"><h2>Análise Técnica Plugga</h2><p>O gatilho ESTUDO BESS foi aplicado para Porto Velho. A fatura mostra ponta cara, mas com baixo volume mensal: {num(cons_p,2)} kWh. Tecnicamente, 1 BESS LUNA2000-241 cobre a energia e a potência da ponta desta referência.</p><p>Financeiramente, o BESS isolado fica fraco com a fatura isolada: CAPEX de {money(capex_bess)} para economia estimada de {money(econ_bess_m)}/mês. O payback preliminar fica em {num(payback_bess,1)} anos, antes de O&M, degradação e custos acessórios.</p><p><b>Recomendação:</b> não vender BESS isolado agora sem memória de massa. Avançar para validação de 12 faturas, curva de carga e cenário Solar+BESS, porque a oportunidade pode estar na combinação com FV, ajuste de demanda e revisão tarifária/créditos.</p></div>
<h2>6. Próximos passos</h2><div class="timeline"><div class="step"><div class="num">1</div><h3>12 faturas</h3><p>Confirmar sazonalidade de ponta, demanda e créditos.</p></div><div class="step"><div class="num">2</div><h3>Memória de massa</h3><p>Validar duração da ponta e potência real em 15 minutos.</p></div><div class="step"><div class="num">3</div><h3>Regra tarifária</h3><p>Conferir TUSD, créditos APCEI e impostos.</p></div><div class="step"><div class="num">4</div><h3>Solar+BESS</h3><p>Confirmar área, geração, conexão e compensação.</p></div><div class="step"><div class="num">5</div><h3>Cotação</h3><p>Fechar CAPEX real FV+BESS antes da proposta.</p></div></div><div class="footer"><img src="{logo}" alt="Plugga"><strong>PLUGGA — VOCÊ NO CONTROLE DA SUA ENERGIA</strong></div></main></body></html>'''
OUTDIR.mkdir(parents=True, exist_ok=True)
OUT.write_text(html,encoding='utf-8')
print(OUT)
print('BESS units', units, 'CAPEX', money(capex_bess), 'Econ/m', money(econ_bess_m), 'Payback', num(payback_bess,1))
