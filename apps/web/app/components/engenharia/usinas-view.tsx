"use client";

import type { CompanyKey, ListarUsinasResposta, MonitoramentoDoDia, OpcoesDaEngenhariaResposta, PlataformaDeInversor, Usina } from "@plugga/shared";
import { Activity, Building2, FileSpreadsheet, Filter, Monitor, Settings, Sun, TriangleAlert, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { hrefDasOrdens } from "../../lib/ordens-de-servico";
import { hrefDasUsinas, temFiltroNoCadastro, type AbaDasUsinas, type FiltrosDasUsinas } from "../../lib/usinas";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus, IconSearch } from "../ui";
import { CadastroDeUsinas } from "./cadastro-de-usinas";
import { ConfiguracoesDaEngenharia } from "./configuracoes-da-engenharia";
import { FichaDaUsina } from "./ficha-da-usina";
import { ImportarUsinas } from "./importar-usinas";
import { MonitoramentoDoDiaView } from "./monitoramento-do-dia";
import { UsinaForm } from "./usina-form";
import styles from "./usinas.module.css";

const ABAS: { id: AbaDasUsinas; rotulo: string; icone: LucideIcon }[] = [
  { id: "monitoramento", rotulo: "Monitoramento de hoje", icone: Activity },
  { id: "cadastro", rotulo: "Cadastro", icone: Sun },
];

/**
 * Usinas (PLU-347): o monitoramento do dia por plataforma e o cadastro das usinas
 * dos clientes, com a ficha em ?usina=. Conferir e cadastrar pedem a tela de
 * Usinas (a API confere de novo); ver, qualquer tela da Engenharia.
 */
export function UsinasView({ filtros, monitoramento, cadastro, plataformas, ficha, fichaNaoEncontrada, opcoes, podeCadastrar, hoje }: {
  filtros: FiltrosDasUsinas;
  monitoramento: MonitoramentoDoDia | null;
  cadastro: ListarUsinasResposta | null;
  plataformas: PlataformaDeInversor[];
  ficha: Usina | null;
  fichaNaoEncontrada: boolean;
  opcoes: OpcoesDaEngenhariaResposta | null;
  podeCadastrar: boolean;
  hoje: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [criando, setCriando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);

  const ir = (parcial: Partial<FiltrosDasUsinas>, usina: string | null = null) => router.push(hrefDasUsinas({ ...filtros, ...parcial }, usina), { scroll: false });
  const hrefDaFicha = (id: string) => hrefDasUsinas(filtros, id);
  const abrir = (id: string) => router.push(hrefDaFicha(id), { scroll: false });
  const fechar = () => router.push(hrefDasUsinas(filtros), { scroll: false });
  const limpar = () => { setBusca(""); router.push(hrefDasUsinas({ aba: filtros.aba, empresa: filtros.empresa }), { scroll: false }); };
  const cadastroAberto = filtros.aba === "cadastro";

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const proxima = filtros.aba === "monitoramento" ? "cadastro" : "monitoramento";
    ir({ aba: proxima });
    abasRef.current?.querySelector<HTMLButtonElement>(`#usinas-aba-${proxima}`)?.focus();
  }
  function buscar(evento: FormEvent) { evento.preventDefault(); ir({ busca: busca.trim() || undefined }); }

  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];

  let conteudo: ReactNode;
  if (!cadastroAberto) {
    conteudo = monitoramento ? <MonitoramentoDoDiaView dia={monitoramento} aoConferir={(texto) => { setAviso(texto); router.refresh(); }} /> : null;
  } else if (!cadastro || cadastro.itens.length === 0) {
    const filtrado = temFiltroNoCadastro(filtros);
    conteudo = <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
      <div className="lista-negocios-vazia-icone" aria-hidden="true">{filtrado ? <Filter size={22} /> : <Sun size={22} />}</div>
      <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhuma usina com esses filtros" : "Nenhuma usina cadastrada"}</h3>
      <p className="lista-negocios-vazia-desc">{filtrado ? "Experimente outra busca ou limpe os filtros." : "Cadastre a usina com o cliente e a UC, ou ela nasce no comissionamento."}</p>
      {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : podeCadastrar ? <Button size="sm" icon={<IconPlus />} onClick={() => setCriando(true)}>Nova usina</Button> : null}
    </div>;
  } else {
    conteudo = <>
      {cadastro.total > cadastro.itens.length ? <p className={styles.muted} role="status">Mostrando {cadastro.itens.length} de {cadastro.total} usinas. Use a busca ou os filtros para ver as demais.</p> : null}
      <CadastroDeUsinas usinas={cadastro.itens} hoje={hoje} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} />
    </>;
  }

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Usinas</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Monitoramento diário e cadastro das usinas dos clientes.</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as CompanyKey) })} options={empresas} /></div>
        {cadastroAberto && podeCadastrar ? <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => setImportando(true)}>Importar planilha</Button> : null}
        {cadastroAberto && podeCadastrar ? <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Nova usina</Button> : null}
        <Button variant="secondary" iconOnly icon={<Settings size={18} />} aria-label="Configurações da Engenharia" title="Configurações da Engenharia" onClick={() => setConfigurando(true)} />
      </div>
    </header>

    <div className={styles.barra}>
      <div ref={abasRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas} ${styles.abas}`} role="tablist" aria-label="Seções das usinas" onKeyDown={navegarAbas}>
        {ABAS.map(({ id, rotulo, icone: Icone }) => <button key={id} type="button" id={`usinas-aba-${id}`} className="ui-tab" role="tab" aria-selected={filtros.aba === id}
          aria-controls="usinas-conteudo" tabIndex={filtros.aba === id ? 0 : -1} onClick={() => ir({ aba: id })}><Icone size={15} aria-hidden="true" />{rotulo}</button>)}
      </div>
      {cadastroAberto ? <>
        <form className={`equipe-busca ${styles.busca}`} onSubmit={buscar} role="search" aria-label="Buscar usinas">
          <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
          <input className="equipe-busca-input" type="search" maxLength={150} aria-label="Buscar usina, cliente ou UC" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar usina, cliente ou UC…" />
        </form>
        <span className={styles.espacoDaBarra} />
        <div className={styles.filtros} role="group" aria-label="Filtros do cadastro">
          <div className={styles.filtro}><FiltroComBusca label="Plataforma" icon={<Monitor />} semFiltro="todas" value={filtros.plataformaId ?? "todas"} onChange={(v) => ir({ plataformaId: v === "todas" ? undefined : v })}
            options={[{ value: "todas", label: "Todas as plataformas", icon: <Monitor /> }, ...plataformas.map((p) => ({ value: p.id, label: p.nome, icon: <Monitor />, aside: String(p.usinas) }))]} /></div>
          <div className={styles.filtro}><FiltroComBusca label="Situação" icon={<TriangleAlert />} semFiltro="todas" value={filtros.atencao ? "atencao" : "todas"} onChange={(v) => ir({ atencao: v === "atencao" || undefined })}
            options={[{ value: "todas", label: "Todas as usinas", icon: <Sun /> }, { value: "atencao", label: "Com atenção (anomalia ou sem comunicação)", icon: <TriangleAlert /> }]} /></div>
          {temFiltroNoCadastro(filtros) ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
        </div>
      </> : null}
    </div>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {fichaNaoEncontrada ? <p className="aviso aviso--alerta" role="status">Usina não encontrada. O link pode estar errado.</p> : null}
    <section id="usinas-conteudo" className={`${estilosClientes.conteudo} ${styles.conteudo}`} role="tabpanel" aria-labelledby={`usinas-aba-${filtros.aba}`}>{conteudo}</section>

    {ficha ? <FichaDaUsina key={ficha.id} usina={ficha} plataformas={plataformas} hoje={hoje} prazoSugerido={opcoes?.prazoSugerido} aoFechar={fechar}
      aoAtualizar={(texto, ordemId) => { setAviso(texto); if (ordemId) router.push(hrefDasOrdens({ visao: "cards" }, ordemId)); else router.refresh(); }} /> : null}
    {criando ? <UsinaForm plataformas={plataformas} hoje={hoje} empresaInicial={filtros.empresa} aoCancelar={() => setCriando(false)}
      aoSalvar={(u) => { setCriando(false); setAviso(`${u.nome} cadastrada.`); router.push(hrefDasUsinas({ ...filtros, aba: "cadastro" }, u.id), { scroll: false }); router.refresh(); }} /> : null}
    {importando ? <ImportarUsinas empresaInicial={filtros.empresa} aoCancelar={() => setImportando(false)}
      aoGravar={(n) => { setImportando(false); setAviso(`${n} ${n === 1 ? "usina importada" : "usinas importadas"} da planilha.`); router.refresh(); }} /> : null}
    {configurando ? <ConfiguracoesDaEngenharia opcoes={opcoes} aoFechar={() => setConfigurando(false)} /> : null}
  </div>;
}
