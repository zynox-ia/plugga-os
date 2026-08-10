#!/usr/bin/env python3
from pathlib import Path
import base64, math, re

ROOT = Path('/root/.openclaw/workspace')
SKILL = ROOT/'brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica'
TEMPLATE = SKILL/'templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html'
LOGO = ROOT/'skills/relatorio-economia-plugga/assets/logo_clara.png'
OUT = ROOT/'reports/estudo-eficiencia-energetica-mercantil-nova-era-jardim-floresta-uc-01374052-2026-06.html'

approved = TEMPLATE.read_text(encoding='utf-8')
style = re.search(r'<style>(.*?)</style>', approved, re.S).group(1)
# keep approved CSS architecture and add only small compatibility rules for this case.
style += r'''
.logo-img,.footer img{object-fit:contain}.warn{border-left:5px solid #f59e0b;background:#fff8eb;padding:12px 14px;border-radius:10px;margin:10px 32px;color:#4b3412}.ok{border-left:5px solid #1faa7e;background:#f1fbf6;padding:12px 14px;border-radius:10px;margin:10px 32px;color:#173b30}.red{color:#b42318}.green{color:#0f5740}.bar-table td:nth-child(2),.bar-table td:nth-child(3){text-align:right}.scenario-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 32px}.scenario{background:#fff;border:1px solid var(--line);border-radius:18px;padding:15px}.scenario h3{min-height:36px}.scenario strong{color:var(--ink);font-size:18px;display:block;margin:6px 0}.scenario p{font-size:12px;color:#315347}.badge{display:inline-block;border-radius:999px;padding:4px 9px;background:#e6f7f0;color:#0f5740;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;margin-bottom:7px}@media print{.scenario-grid{grid-template-columns:repeat(4,1fr);gap:8px}.scenario{break-inside:avoid}.warn,.ok{break-inside:avoid}}
'''

def br_money(v):
    s = f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return 'R$ ' + s

def br_num(v, dec=0):
    s = f'{v:,.{dec}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return s

def pct(v):
    return f'{v:.2f}%'.replace('.', ',')

# Invoice data
cliente='MERCANTIL NOVA ERA LTDA'
cnpj='04.240.370/0039-20'
uc='01374052'
endereco='Elza Mesquita da Silva, 183 — Jardim Floresta — Boa Vista/RR'
distrib='Roraima Energia S.A.'
ref='06/2026'
venc='21/07/2026'
periodo='31/05/2026 a 30/06/2026'
grupo='Grupo A / A4 — Horosazonal Verde'
cons_p=6901
cons_fp=72330
cons_total=cons_p+cons_fp
valor_total=76295.48
valor_p=18557.99
valor_fp=45275.83
valor_dem=4625.90+7689.52
valor_reat=3.44+86.17
cosip=56.63
band=1491.05
icms=13709.86
base_icms=68549.33
contratada=500
reg_p=151
reg_fp=167
reg_max=max(reg_p,reg_fp)
util=reg_max/contratada*100
limite=contratada*1.05
folga=contratada-reg_max
custo_total=valor_total/cons_total
custo_energia_demanda=(valor_p+valor_fp+valor_dem)/cons_total
peso_ponta=valor_p/valor_total*100
peso_fp=valor_fp/valor_total*100
peso_dem=valor_dem/valor_total*100
peso_reat=valor_reat/valor_total*100
peso_cosip=cosip/valor_total*100
# invoice total closes without bandeira line
bandeira_diff=band
# preliminary opportunities
ideal_kw=180
reducao_kw=contratada-ideal_kw
econ_demanda_mes=7091.20
econ_demanda_ano=econ_demanda_mes*12
spread=2.689175-0.625962
bess_saving_month=cons_p*spread
bess_saving_year=bess_saving_month*12
capex=550000.00
# cash flow 20 years with 4% escalation and 5% TMA, capex year 0
cash=[]
for y in range(1,21):
    cash.append(bess_saving_year*((1.04)**(y-1)))
npv=-capex+sum(cf/((1.05)**i) for i,cf in enumerate(cash, start=1))
payback=capex/bess_saving_year
# IRR bisection
lo,hi=-0.9,1.0
for _ in range(200):
    mid=(lo+hi)/2
    val=-capex+sum(cf/((1+mid)**i) for i,cf in enumerate(cash, start=1))
    if val>0: lo=mid
    else: hi=mid
irr=(lo+hi)/2
cum=-capex; disc_cum=-capex; dpb=None
for i,cf in enumerate(cash,1):
    prev=disc_cum
    disc_cum += cf/(1.05**i)
    if dpb is None and disc_cum>=0:
        dpb = i-1 + (-prev)/(cf/(1.05**i))

logo_b64 = base64.b64encode(LOGO.read_bytes()).decode('ascii')
logo_src = f'data:image/png;base64,{logo_b64}'

# chart helpers
components=[('Consumo fora ponta',valor_fp,'#2563eb'),('Consumo ponta',valor_p,'#f59e0b'),('Demanda',valor_dem,'#7c3aed'),('Reativo',valor_reat,'#dc2626'),('COSIP',cosip,'#0ea5e9')]
maxv=max(v for _,v,_ in components)
bars=''
for i,(name,v,color) in enumerate(components):
    h=150*v/maxv
    x=55+i*82
    y=180-h
    bars += f'<rect x="{x}" y="{y:.1f}" width="42" height="{h:.1f}" rx="6" fill="{color}"/><text x="{x+21}" y="{y-7:.1f}" text-anchor="middle" class="value">{br_money(v)}</text><text x="{x+21}" y="204" text-anchor="middle" class="axis">{name[:13]}</text>'
comp_svg=f'''<svg class="chart-svg" viewBox="0 0 480 230" role="img" aria-label="Composição da fatura"><line x1="40" y1="180" x2="455" y2="180" stroke="#d9e7e1"/><line x1="40" y1="25" x2="40" y2="180" stroke="#d9e7e1"/>{bars}</svg>'''

# simple pie legend, use approved visual donut-like block with conic css inline
pcts=[]; acc=0
for n,v,c in components:
    p=v/sum(x[1] for x in components)*100; pcts.append((n,p,c))
conic=[]; a=0
for n,p,c in pcts:
    conic.append(f'{c} {a:.2f}% {a+p:.2f}%'); a+=p
pie_style='conic-gradient('+','.join(conic)+')'
legend=''.join([f'<li><b style="background:{c}"></b>{n}<strong>{pct(p)}</strong></li>' for n,p,c in pcts])

# annual cash chart
maxcf=max(cash)
pts=[]; prev=None
for i,cf in enumerate(cash,1):
    x=45+(i-1)*(620/19)
    y=255-(cf/maxcf)*195
    pts.append((x,y,cf))
poly=' '.join(f'{x:.1f},{y:.1f}' for x,y,_ in pts)
year_rows=''.join(f'<tr><td>Ano {i}</td><td>{br_money(cf)}</td><td>{br_money(cf/(1.05**i))}</td></tr>' for i,cf in enumerate(cash,1))
cf_svg=f'''<svg class="chart-svg" viewBox="0 0 720 300" role="img" aria-label="Fluxo de caixa projetado"><line x1="40" y1="255" x2="690" y2="255" stroke="#d9e7e1"/><line x1="40" y1="35" x2="40" y2="255" stroke="#d9e7e1"/><polyline points="{poly}" fill="none" stroke="#1faa7e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>''' + ''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="#0f5740"/>' for x,y,_ in pts[::2]) + '<text x="40" y="285" class="axis">Ano 1</text><text x="650" y="285" class="axis">Ano 20</text><text x="44" y="28" class="axis">valor anual</text></svg>'

html=f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estudo de Eficiência Energética — Jardim Floresta 06/2026 | Plugga</title><style>{style}</style></head><body><main class="page">
<header class="hero"><div class="eyebrow">ESTUDO DE EFICIÊNCIA ENERGÉTICA</div><h1>Auditoria energética e oportunidades — Jardim Floresta</h1><p class="client"><b>{cliente}</b><br>UC/Código único {uc} • Referência {ref} • {distrib}</p><div class="brandmark"><img class="logo-img" src="{logo_src}" alt="Plugga"><div class="tag">você no controle da sua energia</div></div><div class="chips"><span class="chip">Grupo A / A4</span><span class="chip">Horosazonal Verde</span><span class="chip">Fatura única</span><span class="chip">Prévia técnica</span></div></header>
<div class="toc"><span>Resumo</span><span>Identificação da UC</span><span>Demanda</span><span>Consumo e custos</span><span>Reativo e benefícios</span><span>Diagnóstico</span><span>Oportunidades</span><span>Próximos passos</span></div>
<div class="grid"><div class="kpi"><span>Total da fatura</span><strong>{br_money(valor_total)}</strong></div><div class="kpi"><span>Consumo total</span><strong>{br_num(cons_total)} kWh</strong></div><div class="kpi"><span>Custo médio total</span><strong>{br_money(custo_total)}/kWh</strong></div><div class="kpi"><span>Vencimento</span><strong>{venc}</strong></div></div>
<section><h2>1. Resumo da fatura</h2></section><div class="note">A unidade Jardim Floresta apresentou consumo total de <b>{br_num(cons_total)} kWh</b>, com forte concentração financeira em consumo fora ponta, consumo ponta e demanda. A fatura tem bom controle de reativo, mas mostra duas frentes relevantes: <b>demanda contratada aparentemente acima do uso medido</b> e <b>alto custo no horário de ponta</b>.</div><div class="warn"><b>Ponto de conferência:</b> a fatura exibe uma linha de “Adicional Bandeira Amarela” de {br_money(band)}, porém o total a pagar fecha exatamente sem adicionar esse item. O campo inferior da própria fatura informa bandeira verde. Antes de qualquer cobrança ou contestação, a Plugga deve validar a NF3e/portal da Roraima Energia.</div>
<h2>2. Identificação da unidade consumidora</h2><table><tr><th>Campo</th><th>Informação</th></tr><tr><td>Consumidor</td><td>{cliente}</td></tr><tr><td>CNPJ</td><td>{cnpj}</td></tr><tr><td>UC / Código único</td><td>{uc}</td></tr><tr><td>Endereço</td><td>{endereco}</td></tr><tr><td>Distribuidora</td><td>{distrib}</td></tr><tr><td>Grupo / modalidade</td><td>{grupo}</td></tr><tr><td>Período de leitura</td><td>{periodo}</td></tr><tr><td>Emissão / apresentação</td><td>01/07/2026 / 10/07/2026</td></tr></table>
<h2>3. Análise de demanda</h2><div class="grid3"><div class="kpi"><span>Demanda contratada FP</span><strong>{br_num(contratada)} kW</strong></div><div class="kpi"><span>Maior demanda registrada</span><strong>{br_num(reg_max)} kW</strong></div><div class="kpi"><span>Utilização do contrato</span><strong>{pct(util)}</strong></div></div><table><tr><th>Indicador</th><th>Leitura da fatura</th><th>Leitura Plugga</th></tr><tr><td>Registrada ponta</td><td>{br_num(reg_p)} kW</td><td>Sem ultrapassagem aparente.</td></tr><tr><td>Registrada fora ponta</td><td>{br_num(reg_fp)} kW</td><td>Maior demanda medida no mês.</td></tr><tr><td>Limite de tolerância do contrato atual</td><td>{br_num(limite)} kW</td><td>Contrato com folga operacional relevante.</td></tr><tr><td>Folga contra demanda contratada</td><td>{br_num(folga)} kW</td><td>Potencial de revisão contratual, sujeito a histórico.</td></tr></table><div class="demand-box"><div class="demand-head"><span>Prévia de demanda ideal</span><strong>{br_num(ideal_kw)} kW</strong></div><div class="demand-grid"><div><span>Redução potencial</span><b>{br_num(reducao_kw)} kW</b></div><div><span>Economia mensal estimada</span><b>{br_money(econ_demanda_mes)}</b></div><div><span>Economia anual estimada</span><b>{br_money(econ_demanda_ano)}</b></div></div><p>Como há apenas uma fatura, esta é uma prévia técnica. A recomendação comercial só deve ser fechada depois de validar 12 faturas e/ou memória de massa de 15 minutos, porque o contrato de demanda precisa proteger picos sazonais.</p></div>
<h2>4. Consumo, custo médio efetivo e tarifa aplicada</h2><div class="grid3"><div class="kpi"><span>Consumo ponta</span><strong>{br_num(cons_p)} kWh</strong></div><div class="kpi"><span>Consumo fora ponta</span><strong>{br_num(cons_fp)} kWh</strong></div><div class="kpi"><span>Custo energia + demanda</span><strong>{br_money(custo_energia_demanda)}/kWh</strong></div></div><table><tr><th>Item</th><th>Quantidade</th><th>Tarifa com tributos</th><th>Valor</th><th>Peso no total</th></tr><tr><td>Consumo ponta</td><td>{br_num(cons_p)} kWh</td><td>R$ 2,689175/kWh</td><td>{br_money(valor_p)}</td><td>{pct(peso_ponta)}</td></tr><tr><td>Consumo fora ponta</td><td>{br_num(cons_fp)} kWh</td><td>R$ 0,625962/kWh</td><td>{br_money(valor_fp)}</td><td>{pct(peso_fp)}</td></tr><tr><td>Demanda faturada</td><td>514 kW descritos na fatura</td><td>R$ 27,700000/kW e R$ 22,160000/kW</td><td>{br_money(valor_dem)}</td><td>{pct(peso_dem)}</td></tr></table>
<h2>5. Composição da fatura, reativo e benefícios</h2><div class="chart-pair"><div class="mini-chart"><h3>Composição por valor</h3>{comp_svg}</div><div class="mini-chart"><h3>Participação dos itens</h3><div class="pie-wrap"><div class="pie" style="background:{pie_style}"></div><ul class="pie-legend">{legend}</ul></div></div></div><table><tr><th>Item de controle</th><th>Valor identificado</th><th>Leitura</th></tr><tr><td>Reativo excedente</td><td>{br_money(valor_reat)} ({pct(peso_reat)})</td><td>Valor baixo. Não é o principal vazamento financeiro desta fatura.</td></tr><tr><td>Benefício fiscal / base tributária</td><td>ICMS {br_money(icms)} sobre base {br_money(base_icms)}</td><td>Não há PIS/Cofins na fatura. Validar se a composição tributária está aderente à atividade e ao cadastro.</td></tr><tr><td>Bandeira tarifária</td><td>Campo inferior informa Verde; linha superior lista Amarela</td><td>Inconsistência documental a validar no portal/NF3e.</td></tr></table>
<h2>6. Diagnóstico e recomendações da auditoria</h2><div class="grid3"><div class="panel"><h3>Demanda</h3><p>Há indício forte de demanda contratada acima do uso medido em junho. Prioridade: buscar 12 meses para validar redução segura.</p></div><div class="panel"><h3>Horário de ponta</h3><p>O kWh de ponta custa mais de quatro vezes o fora ponta. A operação deve mapear cargas que podem ser deslocadas, reduzidas ou atendidas por armazenamento.</p></div><div class="panel"><h3>Reativo</h3><p>O valor é baixo nesta referência. Manter monitoramento, mas não priorizar CAPEX para correção sem reincidência.</p></div></div><div class="ok"><b>Ação sem investimento mais relevante:</b> validar redução de demanda contratada. Se o histórico confirmar comportamento parecido, o potencial financeiro pode superar {br_money(econ_demanda_ano)} por ano antes de qualquer projeto com CAPEX.</div>
<h2>7. Oportunidades</h2><div class="scenario-grid"><div class="scenario"><span class="badge">Sem investimento</span><h3>Revisão de demanda</h3><strong>{br_money(econ_demanda_mes)}/mês</strong><p>Prévia baseada na diferença entre contrato atual e demanda observada em junho. Exige 12 faturas/memória de massa.</p></div><div class="scenario"><span class="badge">BESS</span><h3>1 unidade LUNA2000-241</h3><strong>{br_money(bess_saving_month)}/mês</strong><p>Pré-viabilidade para deslocar consumo de ponta usando 241 kWh / 108 kW. CAPEX base: {br_money(capex)}.</p></div><div class="scenario"><span class="badge">Solar+BESS</span><h3>Dimensionar com curva</h3><strong>A validar</strong><p>Precisa área, perfil de carga e cotação EPC para não prometer economia artificial.</p></div><div class="scenario"><span class="badge">Mercado Livre</span><h3>Simular preço de mesa</h3><strong>A validar</strong><p>Requer preço vigente, demanda contratada e elegibilidade comercial da unidade.</p></div></div><table><tr><th>Cenário</th><th>CAPEX</th><th>Economia mensal</th><th>Economia Ano 1</th><th>Payback</th><th>VPL com TMA</th><th>TIR</th><th>Payback descontado</th></tr><tr><td>Apenas BESS — 1 unidade</td><td>{br_money(capex)}</td><td>{br_money(bess_saving_month)}</td><td>{br_money(bess_saving_year)}</td><td>{br_num(payback,1)} anos</td><td>{br_money(npv)}</td><td>{pct(irr*100)}</td><td>{br_num(dpb,1)} anos</td></tr><tr><td>Revisão de demanda</td><td>{br_money(0)}</td><td>{br_money(econ_demanda_mes)}</td><td>{br_money(econ_demanda_ano)}</td><td>Imediato após aprovação</td><td>A validar</td><td>A validar</td><td>A validar</td></tr></table>
<div class="full-chart"><h3>Economia anual projetada — cenário BESS</h3>{cf_svg}<div class="year-table"><div class="tbl-title">Fluxo de caixa sintético</div><table><tr><th>Ano</th><th>Economia nominal</th><th>Valor presente</th></tr>{year_rows}</table></div></div>
<div class="analysis"><div class="eyebrow">ANÁLISE TÉCNICA</div><h2>Análise de eficiência energética</h2><p>A fatura de junho mostra uma unidade com custo total relevante e dois sinais técnicos claros: <b>contrato de demanda possivelmente superdimensionado</b> e <b>alto custo concentrado no horário de ponta</b>. A primeira frente pode gerar economia sem investimento. A segunda abre caminho para BESS, desde que a curva de carga confirme descarga diária no período de ponta.</p><p><b>Recomendação Plugga:</b> não iniciar CAPEX antes de fechar a base técnica. O próximo passo correto é coletar 12 faturas e memória de massa de 15 minutos para validar demanda ideal, curva de ponta, recorrência do consumo e dimensionamento do BESS.</p></div>
<h2>8. Dados para próximos passos</h2><div class="timeline"><div class="step"><div class="num">1</div><h3>Histórico</h3><p>Enviar 12 faturas da UC Jardim Floresta.</p></div><div class="step"><div class="num">2</div><h3>Memória de massa</h3><p>Coletar curva 15 minutos no portal/distribuidora.</p></div><div class="step"><div class="num">3</div><h3>Validação tarifária</h3><p>Conferir REH, tributos, cadastro e bandeira/NF3e.</p></div><div class="step"><div class="num">4</div><h3>Cenários</h3><p>Simular demanda ideal, BESS, Solar+BESS e Mercado Livre.</p></div><div class="step"><div class="num">5</div><h3>Proposta</h3><p>Fechar recomendação técnica e plano comercial.</p></div></div>
<div class="footer"><img src="{logo_src}" alt="Plugga"><div>CONFIDENCIAL • Plugga Gestão de Energia • contato@pluggaenergia.com.br</div><strong>PLUGGA — VOCÊ NO CONTROLE DA SUA ENERGIA.</strong></div>
</main></body></html>'''
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding='utf-8')
print(OUT)
print('BESS mensal', br_money(bess_saving_month), 'VPL', br_money(npv), 'TIR', pct(irr*100))
