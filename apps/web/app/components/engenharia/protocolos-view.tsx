"use client";

import type { CompanyKey, DepartamentoDoProtocolo, ListarProtocolosResposta, OpcoesDaEngenhariaResposta, OpcoesDosProtocolosResposta, Protocolo } from "@plugga/shared";
import { Building2, CalendarClock, CalendarRange, CheckCircle2, CircleAlert, Clock, FileCheck, FileText, Filter, History, Landmark, Layers, Settings, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { diaLegivel } from "../../lib/compras";
import {
  contagemDoFiltroDosProtocolos,
  GRUPOS_DO_FILTRO_DOS_PROTOCOLOS,
  hrefDosProtocolos,
  ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO,
  ROTULO_DO_FILTRO_DOS_PROTOCOLOS,
  temFiltroNosProtocolos,
  type FiltroDeSituacaoDoProtocolo,
  type FiltrosDosProtocolos,
} from "../../lib/protocolos";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus, IconSearch } from "../ui";
import { CardsDeProtocolos } from "./cards-de-protocolos";
import { ConfiguracoesDaEngenharia } from "./configuracoes-da-engenharia";
import { FichaDoProtocolo } from "./ficha-do-protocolo";
import { ProtocoloForm } from "./protocolo-form";
import styles from "./usinas.module.css";

const ICONE_DO_FILTRO: Record<FiltroDeSituacaoDoProtocolo, LucideIcon> = {
  em_andamento: Clock, aberto: FileText, em_analise: History, com_pendencia: CircleAlert,
  verificar_hoje: CalendarClock, vencendo: CalendarRange, respondido: CheckCircle2, liberado: FileCheck, indeferido: X,
};

/**
 * Protocolos na distribuidora (PLU-348): os pedidos à distribuidora em cards, com a
 * data-limite e "verificar hoje", e a ficha em ?protocolo=. Uma tela da Engenharia e
 * do Operacional; o departamento é filtro só para quem alcança os dois.
 */
export function ProtocolosView({ filtros, lista, opcoes, opcoesDaEngenharia, ficha, falhaDaFicha, podeConfigurar, hoje }: {
  filtros: FiltrosDosProtocolos;
  lista: ListarProtocolosResposta;
  opcoes: OpcoesDosProtocolosResposta | null;
  opcoesDaEngenharia: OpcoesDaEngenhariaResposta | null;
  ficha: Protocolo | null;
  falhaDaFicha: "nao_encontrado" | "indisponivel" | null;
  podeConfigurar: boolean;
  hoje: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [criando, setCriando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);

  const ir = (parcial: Partial<FiltrosDosProtocolos>, protocolo: string | null = null) => router.push(hrefDosProtocolos({ ...filtros, ...parcial }, protocolo), { scroll: false });
  const hrefDaFicha = (id: string) => hrefDosProtocolos(filtros, id);
  const abrir = (id: string) => router.push(hrefDaFicha(id), { scroll: false });
  const fechar = () => router.push(hrefDosProtocolos(filtros), { scroll: false });
  const limpar = () => { setBusca(""); router.push(hrefDosProtocolos({ empresa: filtros.empresa }), { scroll: false }); };
  function buscar(evento: FormEvent) { evento.preventDefault(); ir({ busca: busca.trim() || undefined }); }

  const c = lista.contagens;
  const departamentos = opcoes?.departamentos ?? [];
  const situacoes = [
    { value: "todas", label: "Todas as situações", icon: <Layers /> },
    ...GRUPOS_DO_FILTRO_DOS_PROTOCOLOS.flatMap(({ rotulo, valores }) => valores.map((v) => {
      const Icone = ICONE_DO_FILTRO[v];
      const n = contagemDoFiltroDosProtocolos(v, c);
      return { value: v, label: ROTULO_DO_FILTRO_DOS_PROTOCOLOS[v], icon: <Icone />, grupo: rotulo, ...(n === null ? {} : { aside: String(n) }) };
    })),
  ];
  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const filtrado = temFiltroNosProtocolos(filtros);

  const conteudo = lista.itens.length === 0 ? <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
    <div className="lista-negocios-vazia-icone" aria-hidden="true">{filtrado ? <Filter size={22} /> : <FileCheck size={22} />}</div>
    <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhum protocolo com esses filtros" : "Nenhum protocolo"}</h3>
    <p className="lista-negocios-vazia-desc">{filtrado ? "Experimente outra busca ou limpe os filtros." : "Ao abrir um pedido na distribuidora, registre o número aqui: o lembrete avisa quando verificar."}</p>
    {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : opcoes ? <Button size="sm" icon={<IconPlus />} onClick={() => setCriando(true)}>Novo protocolo</Button> : null}
  </div> : <>
    {lista.total > lista.itens.length ? <p className={styles.muted} role="status">Mostrando {lista.itens.length} de {lista.total} protocolos. Use a busca ou os filtros para ver os demais.</p> : null}
    <CardsDeProtocolos protocolos={lista.itens} hoje={hoje} mostrarDepartamento={departamentos.length > 1} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} />
  </>;

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Protocolos</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Pedidos na distribuidora, do protocolo à resposta. O lembrete substitui a tarefa de &ldquo;acompanhar&rdquo;.</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        {opcoes ? <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Novo protocolo</Button> : null}
        {podeConfigurar ? <Button variant="secondary" iconOnly icon={<Settings size={18} />} aria-label="Configurações da Engenharia" title="Configurações da Engenharia" onClick={() => setConfigurando(true)} /> : null}
      </div>
    </header>

    <div className={styles.barra}>
      <form className={`equipe-busca ${styles.busca}`} onSubmit={buscar} role="search" aria-label="Buscar protocolos">
        <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
        <input className="equipe-busca-input" type="search" maxLength={150} aria-label="Buscar protocolo, cliente ou UC" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar protocolo, cliente ou UC…" />
      </form>
      <span className={styles.espacoDaBarra} />
      <div className={styles.filtros} role="group" aria-label="Filtros dos protocolos">
        <div className={styles.filtro}><FiltroComBusca label="Situação" icon={<Layers />} semFiltro="todas" value={filtros.situacao ?? "todas"}
          onChange={(v) => ir({ situacao: v === "todas" ? undefined : (v as FiltroDeSituacaoDoProtocolo) })} options={situacoes} /></div>
        {opcoes && opcoes.distribuidoras.length ? <div className={styles.filtro}><FiltroComBusca label="Distribuidora" icon={<Landmark />} semFiltro="todas" value={filtros.distribuidoraId ?? "todas"}
          onChange={(v) => ir({ distribuidoraId: v === "todas" ? undefined : v })}
          options={[{ value: "todas", label: "Todas as distribuidoras", icon: <Landmark /> }, ...opcoes.distribuidoras.map((d) => ({ value: d.id, label: d.nome, icon: <Landmark /> }))]} /></div> : null}
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as CompanyKey) })} options={empresas} /></div>
        {departamentos.length > 1 ? <div className={styles.filtro}><FiltroComBusca label="Departamento" icon={<Layers />} semFiltro="todos" value={filtros.departamento ?? "todos"}
          onChange={(v) => ir({ departamento: v === "todos" ? undefined : (v as DepartamentoDoProtocolo) })}
          options={[{ value: "todos", label: "Todos os departamentos", icon: <Layers /> }, ...departamentos.map((d) => ({ value: d, label: ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO[d], icon: <Layers /> }))]} /></div> : null}
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>
    </div>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {falhaDaFicha === "nao_encontrado" ? <p className="aviso aviso--alerta" role="status">Protocolo não encontrado. O link pode estar errado ou ele é de um departamento que você não alcança.</p> : null}
    {falhaDaFicha === "indisponivel" ? <p className="aviso aviso--erro" role="alert">Não foi possível abrir o protocolo agora. Tente de novo em instantes.</p> : null}
    {opcoes === null ? <p className="aviso aviso--alerta" role="status">Não foi possível carregar as distribuidoras: o Novo protocolo e o filtro de distribuidora voltam ao recarregar a página.</p> : null}
    <section className={`${estilosClientes.conteudo} ${styles.conteudo}`} aria-label="Protocolos">{conteudo}</section>

    {ficha ? <FichaDoProtocolo key={ficha.id} protocolo={ficha} opcoes={opcoes} hoje={hoje} aoFechar={fechar} aoAtualizar={() => router.refresh()} /> : null}
    {criando && opcoes ? <ProtocoloForm opcoes={opcoes} hoje={hoje} empresaInicial={filtros.empresa} departamentoInicial={filtros.departamento} aoCancelar={() => setCriando(false)}
      aoSalvar={(p) => { setCriando(false); setAviso(`Protocolo ${p.numero} registrado.${p.proximaVerificacao ? ` Lembrete para ${diaLegivel(p.proximaVerificacao)}.` : ""}`); router.push(hrefDosProtocolos(filtros, p.id), { scroll: false }); router.refresh(); }} /> : null}
    {configurando ? <ConfiguracoesDaEngenharia opcoes={opcoesDaEngenharia} aoFechar={() => setConfigurando(false)} /> : null}
  </div>;
}
