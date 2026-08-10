#!/usr/bin/env python3
from pathlib import Path
import hashlib, math, re

ROOT = Path('/root/.openclaw/workspace')
SKILL = ROOT/'brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica'
MODEL = ROOT/'reports/auditorias/jardim-floresta-uc-01374052-2026-06/auditoria_energetica_jardim_floresta_uc_01374052_2026_06_solar_bess_padrao.html'
OUT = ROOT/'reports/estudo-bess/nova-era-santa-tereza-uc-01939890-2026-06/PLG-ESTUDO-BESS-NOVA-ERA-SANTA-TEREZA-UC-01939890-06-2026-V03-R00-SOLAR-BESS-DUPLA-CONSULTA.html'
REQUIRED_REFS = [
    SKILL/'SKILL.md',
    SKILL/'MEMORY.md',
    SKILL/'references/metodologia-calculos.md',
    SKILL/'references/checklist-qualidade.md',
    SKILL/'references/prd-trava-dupla-consulta-estudo-bess.md',
]


def consult_sources(stage: str):
    print(f'[{stage}] consulta obrigatoria')
    srcs = [MODEL] + REQUIRED_REFS
    for p in srcs:
        data = p.read_bytes()
        print(f'- {p.relative_to(ROOT)} bytes={len(data)} sha256={hashlib.sha256(data).hexdigest()[:16]}')
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in srcs}


def money(v): return 'R$ ' + f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
def num(v, d=0): return f'{v:,.{d}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
def pct(v): return f'{v:.2f}%'.replace('.', ',')

def bar_svg(labels, values, colors, title_values=True, view=(920, 330)):
    w, h = view; left=76; base=260; top=42; gap=(w-left-35)/len(values); bw=min(46, gap*0.45); mx=max(values) or 1
    parts=[f'<svg class="chart-svg" viewBox="0 0 {w} {h}">', f'<line stroke="#e3ece8" x1="{left}" x2="{w-28}" y1="{base}" y2="{base}"/>', f'<line stroke="#e3ece8" x1="{left}" x2="{left}" y1="{top}" y2="{base}"/>']
    for i,(lab,val,c) in enumerate(zip(labels, values, colors)):
        x=left+18+i*gap; bh=(val/mx)*(base-top); y=base-bh
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="8" fill="{c}"/>')
        if title_values: parts.append(f'<text x="{x+bw/2:.1f}" y="{y-8:.1f}" text-anchor="middle" class="value">{money(val)}</text>')
        parts.append(f'<text x="{x+bw/2:.1f}" y="{base+23}" text-anchor="middle" class="axis">{lab}</text>')
    parts.append('<text x="80" y="26" class="axis">Eixo Y: valor (R$) • Eixo X: cenário</text></svg>')
    return ''.join(parts)

def line_svg(values, labels=None, y_title='valor (R$)', zero=True):
    w,h=920,330; left=78; right=898; top=42; base=272
    mn=min(values); mx=max(values)
    if zero: mn=min(0,mn); mx=max(0,mx)
    pad=(mx-mn)*0.08 or 1; mn-=pad; mx+=pad
    def xy(i,v):
        x=left+i*((right-left)/(len(values)-1)); y=base-((v-mn)/(mx-mn))*(base-top); return x,y
    pts=[xy(i,v) for i,v in enumerate(values)]
    y0=base-((0-mn)/(mx-mn))*(base-top)
    parts=[f'<svg class="chart-svg" viewBox="0 0 {w} {h}"><line stroke="#e3ece8" x1="{left}" x2="{right}" y1="{base}" y2="{base}"/><line stroke="#e3ece8" x1="{left}" x2="{left}" y1="{top}" y2="{base}"/>']
    parts.append(f'<line stroke="#c7d8d1" x1="{left}" x2="{right}" y1="{y0:.1f}" y2="{y0:.1f}"/>')
    parts.append(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)}" fill="none" stroke="#1faa7e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
    for i,(x,y) in enumerate(pts):
        if i in (0, len(pts)-1) or i%5==0:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#0f5740"/>')
            parts.append(f'<text x="{x:.1f}" y="{y-9:.1f}" text-anchor="middle" class="value">{money(values[i])}</text>')
    parts.append(f'<text x="80" y="26" class="axis">Eixo Y: {y_title} • Eixo X: tempo (anos)</text>')
    for i in range(len(values)):
        if i in (0,len(values)-1) or i%5==0:
            lab = labels[i] if labels else str(i+1)
            x,_=xy(i,values[i]); parts.append(f'<text x="{x:.1f}" y="310" text-anchor="middle" class="axis">{lab}</text>')
    parts.append('</svg>')
    return ''.join(parts)

def rows(items):
    return ''.join(f'<tr><td>{a}</td><td>{b}</td></tr>' for a,b in items)

def validate(html: str):
    titles=[re.sub('<[^>]+>','',m.group(1)).strip() for m in re.finditer(r'<h[12][^>]*>(.*?)</h[12]>', html, re.S)]
    required = ['Relatório de Auditoria Energética','1. Resumo executivo da fatura','2. Identificação da unidade consumidora','3. Análise de demanda','4. Consumo, custo médio efetivo e tarifa aplicada','5. Composição da fatura, reativo e benefício fiscal','6. Diagnóstico e recomendações da auditoria','7. Oportunidades','Análise de eficiência energética','8. Próximos passos']
    missing=[t for t in required if t not in titles]
    forbidden=['debug','teste','rascunho','corrigido','final','conforme Dilkson','all-in']
    bad=[x for x in forbidden if x.lower() in html.lower()]
    must=['Solar+BESS','CAPEX Solar+BESS','Economia acumulada projetada — Solar+BESS','Fluxo de caixa acumulado — Solar+BESS','R$ 4.515.000,00','R$ 111.292,41']
    miss=[x for x in must if x not in html]
    if missing or bad or miss:
        raise SystemExit(f'VALIDACAO FALHOU missing_titles={missing} forbidden={bad} missing_terms={miss}')
    print('[validacao] OK titles=', titles)


def main():
    before = consult_sources('ANTES')
    model = MODEL.read_text(encoding='utf-8')

    # Dados Santa Tereza — fatura Roraima Energia ref. 06/2026
    cliente='MERCANTIL NOVA ERA LTDA — SANTA TEREZA'; uc='01939890'; ref='06/2026'; venc='26/07/2026'
    valor_total=174636.70; cons_p=17419.0; cons_fp=183153.0; cons=cons_p+cons_fp
    dem_p=346.0; dem_fp=367.0; dem_contratada=500.0
    tarifa_p=2.689175; tarifa_fp=0.625962
    valor_p=46842.74; valor_fp=114648.76; valor_dem=12632.41; valor_reat=153.83
    custo_p=valor_p/cons_p; custo_fp=valor_fp/cons_fp; custo_total=valor_total/cons
    spread=tarifa_p-tarifa_fp
    bess_energy=math.ceil((cons_p/30)/241)
    bess_power=math.ceil(dem_p/108)
    bess_units=max(bess_energy,bess_power)
    capex_bess=bess_units*550000.0
    fv_kwp=math.ceil((cons*0.60)/130)
    capex_fv=fv_kwp*2500.0
    capex_total=capex_fv+capex_bess
    ger_fv=fv_kwp*130
    econ_bess_m=cons_p*spread
    econ_fv_m=min(ger_fv, cons_fp)*tarifa_fp
    econ_m=econ_bess_m+econ_fv_m
    econ_a=econ_m*12
    fatura_proj=valor_total-econ_m
    payback=capex_total/econ_a
    cash=[econ_a*(1.04**(y-1)) for y in range(1,21)]
    econ_acum=[]; c=0
    for cf in cash:
        c+=cf; econ_acum.append(c)
    fluxo=[-capex_total]; c=-capex_total
    for cf in cash:
        c+=cf; fluxo.append(c)
    vpl=-capex_total+sum(cf/(1.05**i) for i,cf in enumerate(cash,1))
    lo,hi=-0.95,1.5
    for _ in range(120):
        mid=(lo+hi)/2
        val=-capex_total+sum(cf/((1+mid)**i) for i,cf in enumerate(cash,1))
        if val>0: lo=mid
        else: hi=mid
    tir=(lo+hi)/2

    # Cabeçalho do modelo preservado, trocando apenas dados do caso.
    html = model
    html = re.sub(r'<title>.*?</title>', '<title>Relatório de Auditoria Energética — Nova Era Santa Tereza | Plugga</title>', html, count=1, flags=re.S)
    html = re.sub(r'Cliente <b>.*?</b> • UC .*? • Roraima Energia S\.A\. • Referência .*? • Base de análise: fatura cativa e oportunidades energéticas', f'Cliente <b>{cliente}</b> • UC {uc} • Roraima Energia S.A. • Referência {ref} • Base de análise: fatura cativa e oportunidades energéticas', html, count=1, flags=re.S)

    comp_svg=bar_svg(['Ponta','Fora ponta','Demanda','Reativo'], [valor_p,valor_fp,valor_dem,valor_reat], ['#f59e0b','#2563eb','#7c3aed','#dc2626'], view=(480,230))
    consumo_svg=bar_svg(['Ponta','Fora ponta','Dem. ponta','Dem. FP'], [cons_p,cons_fp,dem_p*100,dem_fp*100], ['#f59e0b','#2563eb','#0f5740','#1faa7e'], False, view=(480,230))
    compare_svg=bar_svg(['Atual','Solar+BESS','Economia'], [valor_total, max(fatura_proj,0), econ_m], ['#0f5740','#1faa7e','#f59e0b'], view=(480,230))
    annual_svg=line_svg(cash, [str(i) for i in range(1,21)], 'economia anual (R$)', True)
    econ_acum_svg=line_svg(econ_acum, [str(i) for i in range(1,21)], 'economia acumulada (R$)', True)
    fluxo_svg=line_svg(fluxo, [str(i) for i in range(0,21)], 'fluxo de caixa acumulado (R$)', True)
    cash_rows=''.join(f'<tr><td>Ano {i}</td><td>{money(cf)}</td></tr>' for i,cf in enumerate(cash,1))
    econ_acum_rows=''.join(f'<tr><td>Ano {i}</td><td>{money(cf)}</td></tr>' for i,cf in enumerate(econ_acum,1))
    fluxo_rows=''.join(f'<tr><td>Ano {i}</td><td>{money(cf)}</td></tr>' for i,cf in enumerate(fluxo))

    sections = f'''
<h2>1. Resumo executivo da fatura</h2><div class="grid"><div class="kpi"><span>Valor total</span><strong>{money(valor_total)}</strong></div><div class="kpi"><span>Mês / vencimento</span><strong>{ref}</strong><small>{venc}</small></div><div class="kpi"><span>Consumo total</span><strong>{num(cons)} kWh</strong></div><div class="kpi"><span>Custo médio total</span><strong>{money(custo_total)}/kWh</strong></div></div><div class="note">A unidade Santa Tereza apresenta alto consumo em ponta e demanda medida ponta relevante. O gatilho <b>ESTUDO BESS</b> foi aplicado como <b>Solar+BESS</b>, usando FV preliminar de {num(fv_kwp)} kWp e {bess_units} unidades BESS LUNA2000-241. A decisão de investimento exige 12 faturas, memória de massa, área disponível e cotação EPC.</div>
<h2>2. Identificação da unidade consumidora</h2><table><tr><th>Campo</th><th>Informação</th></tr>{rows([('Consumidor',cliente),('Unidade consumidora',uc),('Concessionária/distribuidora','Roraima Energia S.A.'),('Localidade','Boa Vista/RR'),('Grupo/modalidade','Grupo A · A4 · Modalidade Verde'),('Referência/vencimento',f'{ref} · {venc}'),('Base analisada','Fatura cativa e pré-viabilidade Solar+BESS')])}</table>
<h2>3. Análise de demanda</h2><div class="grid"><div class="kpi"><span>Demanda contratada</span><strong>{num(dem_contratada)} kW</strong></div><div class="kpi"><span>Demanda medida ponta</span><strong>{num(dem_p)} kW</strong></div><div class="kpi"><span>Demanda medida fora ponta</span><strong>{num(dem_fp)} kW</strong></div><div class="kpi"><span>Limitador BESS</span><strong>Potência</strong></div></div><table><tr><th>Indicador</th><th>Ponta</th><th>Fora ponta</th><th>Leitura</th></tr><tr><td>Demanda medida</td><td>{num(dem_p)} kW</td><td>{num(dem_fp)} kW</td><td>Para ranking de oportunidade, usar demanda medida ponta: {num(dem_p)} kW.</td></tr><tr><td>Dimensionamento BESS por potência</td><td>{num(dem_p)} kW ÷ 108 kW/un.</td><td>—</td><td>{bess_power} unidades por potência.</td></tr><tr><td>Dimensionamento BESS por energia</td><td>{num(cons_p/30,2)} kWh/dia ÷ 241 kWh/un.</td><td>—</td><td>{bess_energy} unidades por energia.</td></tr></table><div class="demand-box"><div class="demand-head"><span>Demanda crítica para o estudo</span><strong>{num(dem_p)} kW</strong></div><div class="demand-grid"><div><span>Consumo ponta</span><b>{num(cons_p)} kWh</b></div><div><span>Custo kWh ponta</span><b>{money(custo_p)}/kWh</b></div><div><span>BESS adotado</span><b>{bess_units} unidades</b></div></div><p>O pré-dimensionamento adota o maior limitador entre energia diária de ponta e potência medida de ponta. Neste caso, a potência exige {bess_units} unidades BESS.</p></div>
<h2>4. Consumo, custo médio efetivo e tarifa aplicada</h2><div class="grid"><div class="kpi"><span>Consumo ponta</span><strong>{num(cons_p)} kWh</strong></div><div class="kpi"><span>Consumo fora ponta</span><strong>{num(cons_fp)} kWh</strong></div><div class="kpi"><span>Custo kWh ponta</span><strong>{money(custo_p)}/kWh</strong></div><div class="kpi"><span>Custo kWh fora ponta</span><strong>{money(custo_fp)}/kWh</strong></div></div><table><tr><th>Posto/componente</th><th>Consumo/base</th><th>Tarifa/custo aplicado</th><th>Valor faturado</th><th>Leitura</th></tr><tr><td>Energia ponta</td><td>{num(cons_p)} kWh</td><td>{money(custo_p)}/kWh</td><td>{money(valor_p)}</td><td>Ponta cara e com volume suficiente para priorização.</td></tr><tr><td>Energia fora ponta</td><td>{num(cons_fp)} kWh</td><td>{money(custo_fp)}/kWh</td><td>{money(valor_fp)}</td><td>Base para abatimento FV.</td></tr><tr><td>Demanda</td><td>Conforme fatura</td><td>—</td><td>{money(valor_dem)}</td><td>Validar com histórico e memória de massa.</td></tr></table>
<h2>5. Composição da fatura, reativo e benefício fiscal</h2><div class="grid"><div class="kpi"><span>Energia ponta</span><strong>{money(valor_p)}</strong></div><div class="kpi"><span>Energia fora ponta</span><strong>{money(valor_fp)}</strong></div><div class="kpi"><span>Demanda</span><strong>{money(valor_dem)}</strong></div><div class="kpi"><span>Reativo</span><strong>{money(valor_reat)}</strong></div></div><div class="chart-pair"><div class="mini-chart"><h3>Consumo e demanda</h3>{consumo_svg}</div><div class="mini-chart"><h3>Composição econômica</h3>{comp_svg}</div></div><div class="note">A fatura concentra valor na energia fora ponta, mas a ponta tem custo unitário muito superior e torna o Solar+BESS tecnicamente atrativo quando combinado com FV.</div>
<h2>6. Diagnóstico e recomendações da auditoria</h2><div class="note">Diagnóstico: Santa Tereza tem volume de ponta e demanda medida ponta suficientes para estudo prioritário Solar+BESS. O BESS deve ser tratado como parte da solução integrada com FV, não como produto isolado. Antes de proposta fechada, validar 12 faturas, memória de massa, área disponível, restrições de conexão, regra tributária e cotação EPC.</div>
<h2>7. Oportunidades</h2><div class="note">Cenário principal: <b>Solar+BESS</b>. BESS sozinho aparece apenas como subdimensionamento técnico do banco de baterias. CAPEX Solar+BESS = CAPEX FV + CAPEX BESS.</div><div class="grid"><div class="kpi"><span>FV preliminar</span><strong>{num(fv_kwp)} kWp</strong></div><div class="kpi"><span>BESS preliminar</span><strong>{bess_units} un.</strong></div><div class="kpi"><span>CAPEX Solar+BESS</span><strong>{money(capex_total)}</strong></div><div class="kpi"><span>Payback simples</span><strong>{num(payback,1)} anos</strong></div></div><table class="scenario-table"><tr><th>Cenário</th><th>CAPEX estimado</th><th>Fatura projetada</th><th>Economia mensal</th><th>Economia Ano 1</th><th>Payback</th><th>Leitura executiva</th></tr><tr><td>Sem investimento</td><td>{money(0)}</td><td>{money(valor_total)}</td><td>—</td><td>—</td><td>—</td><td>Permanece a fatura atual.</td></tr><tr><td>Solar+BESS</td><td>{money(capex_total)}</td><td>{money(max(fatura_proj,0))}</td><td>{money(econ_m)}</td><td>{money(econ_a)}</td><td>{num(payback,1)} anos</td><td>Cenário principal: FV reduz consumo comprado da rede e BESS desloca ponta.</td></tr><tr><td>Subdimensionamento BESS</td><td>{money(capex_bess)}</td><td>Não aplicável isolado</td><td>{money(econ_bess_m)}</td><td>{money(econ_bess_m*12)}</td><td>—</td><td>Referência técnica da bateria dentro do Solar+BESS.</td></tr><tr><td>Subdimensionamento FV</td><td>{money(capex_fv)}</td><td>Não aplicável isolado</td><td>{money(econ_fv_m)}</td><td>{money(econ_fv_m*12)}</td><td>—</td><td>Referência técnica da geração FV dentro do Solar+BESS.</td></tr></table><div class="chart-pair"><div class="mini-chart"><h3>Fatura atual x Solar+BESS</h3>{compare_svg}</div><div class="mini-chart"><h3>Pré-dimensionamento Solar+BESS</h3><div class="dim" style="margin:0;grid-template-columns:repeat(2,1fr)"><div class="box"><b>{num(fv_kwp)}</b><br><span>kWp FV</span></div><div class="box"><b>{bess_units}</b><br><span>BESS</span></div><div class="box"><b>{money(capex_fv)}</b><br><span>CAPEX FV</span></div><div class="box"><b>{money(capex_bess)}</b><br><span>CAPEX BESS</span></div></div></div></div><div class="full-chart"><h3>Economia anual projetada — Solar+BESS</h3>{annual_svg}<div class="year-table"><div class="tbl-title">Economia projetada ano a ano</div><table><tr><th>Período</th><th>Valor</th></tr>{cash_rows}</table></div></div><div class="full-chart"><h3>Economia acumulada projetada — Solar+BESS</h3>{econ_acum_svg}<div class="year-table"><div class="tbl-title">Economia acumulada ano a ano</div><table><tr><th>Período</th><th>Valor acumulado</th></tr>{econ_acum_rows}</table></div></div><div class="full-chart"><h3>Fluxo de caixa acumulado — Solar+BESS</h3>{fluxo_svg}<div class="year-table"><div class="tbl-title">Fluxo de caixa acumulado ano a ano</div><table><tr><th>Período</th><th>Valor acumulado</th></tr>{fluxo_rows}</table></div></div><div class="grid3"><div class="kpi"><span>VPL preliminar</span><strong>{money(vpl)}</strong></div><div class="kpi"><span>TIR preliminar</span><strong>{pct(tir*100)}</strong></div><div class="kpi"><span>CAPEX FV + BESS</span><strong>{money(capex_fv)} + {money(capex_bess)}</strong></div></div><div class="note">Premissas: FV de {num(fv_kwp)} kWp × R$ 2.500,00/kWp = {money(capex_fv)}; BESS {bess_units} unidades × R$ 550.000,00 = {money(capex_bess)}; CAPEX Solar+BESS = {money(capex_total)}. Horizonte de 20 anos, reajuste tarifário de 4% a.a. e TMA de 5% a.a.</div><div class="analysis"><div class="eyebrow">ANÁLISE TÉCNICA</div><h2>Análise de eficiência energética</h2><p>O estudo Santa Tereza deve ser lido obrigatoriamente como <b>Solar+BESS</b>. A bateria entra para deslocar a ponta e a geração FV reduz a energia comprada da rede, melhorando o retorno do conjunto.</p><p>Com os dados da fatura de {ref}, o cenário preliminar indica {num(fv_kwp)} kWp FV + {bess_units} BESS LUNA2000-241, CAPEX total de {money(capex_total)} e economia mensal estimada de {money(econ_m)}.</p><p><b>Recomendação Plugga:</b> priorizar Santa Tereza para validação técnica/comercial com histórico de 12 meses, memória de massa, área disponível, parecer de conexão e cotação EPC antes de proposta fechada.</p></div>
<h2>8. Próximos passos</h2><div class="timeline"><div class="step"><div class="num">1</div><h3>Enviar histórico</h3><p>Reunir 12 faturas para confirmar sazonalidade, demanda e consumo em ponta.</p></div><div class="step"><div class="num">2</div><h3>Memória de massa</h3><p>Enviar memória de massa em 15 minutos para validar potência real, duração da ponta e cargas críticas.</p></div><div class="step"><div class="num">3</div><h3>Área e conexão</h3><p>Validar área disponível para FV, conexão, proteção, restrições e layout preliminar.</p></div><div class="step"><div class="num">4</div><h3>Cotação EPC</h3><p>Obter cotação fechada de FV, BESS, instalação, O&M e garantias.</p></div><div class="step"><div class="num">5</div><h3>Proposta fechada</h3><p>Fechar proposta comercial somente após validação técnica, regulatória e financeira.</p></div></div>'''

    start = html.index('<h2>1. Resumo executivo da fatura</h2>')
    end = html.index('<div class="footer">')
    html = html[:start] + sections + html[end:]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    validate(html)
    OUT.write_text(html, encoding='utf-8')
    after = consult_sources('DEPOIS')
    if before != after:
        print('[alerta] fontes consultadas mudaram durante a geração')
    validate(OUT.read_text(encoding='utf-8'))
    print('[saida]', OUT)
    print('[resumo]', 'fv_kwp=',fv_kwp,'bess_units=',bess_units,'capex=',money(capex_total),'econ_m=',money(econ_m),'payback=',num(payback,1),'vpl=',money(vpl),'tir=',pct(tir*100))

if __name__ == '__main__':
    main()
