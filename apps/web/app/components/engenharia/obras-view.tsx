"use client";

import type { CompanyKey, ListarObrasResposta, Obra, OpcoesDaEngenhariaResposta, OpcoesDasObrasResposta } from "@plugga/shared";
import { Building2, CheckCircle2, Clock, Filter, Flag, HardHat, Layers, Settings, TriangleAlert, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { filtrosDeSituacaoDasObras, hrefDasObras, ROTULO_DO_FILTRO_DAS_OBRAS, temFiltroNasObras, type FiltroDeSituacaoDaObra, type FiltrosDasObras } from "../../lib/obras";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Button, IconPlus, IconSearch } from "../ui";
import { CardsDeObras } from "./cards-de-obras";
import { ConfiguracoesDaEngenharia } from "./configuracoes-da-engenharia";
import { FichaDaObra } from "./ficha-da-obra";
import obras from "./obras.module.css";
import { ObraForm } from "./obra-form";
import styles from "./usinas.module.css";

const ICONE_DO_FILTRO: Record<FiltroDeSituacaoDaObra, LucideIcon> = { em_andamento: Clock, atrasadas: TriangleAlert, entregue: CheckCircle2 };

/**
 * Obras (PLU-350): obras grandes com marcos e documentos, em cards, e a ficha em
 * ?obra=. O cronograma detalhado continua no MS Project; aqui ficam os 6 marcos.
 */
export function ObrasView({ filtros, lista, opcoes, opcoesDaEngenharia, ficha, falhaDaFicha, hoje }: {
  filtros: FiltrosDasObras;
  lista: ListarObrasResposta;
  opcoes: OpcoesDasObrasResposta | null;
  opcoesDaEngenharia: OpcoesDaEngenhariaResposta | null;
  ficha: Obra | null;
  falhaDaFicha: "nao_encontrada" | "indisponivel" | null;
  hoje: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [criando, setCriando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);

  const ir = (parcial: Partial<FiltrosDasObras>, obra: string | null = null) => router.push(hrefDasObras({ ...filtros, ...parcial }, obra), { scroll: false });
  const hrefDaFicha = (id: string) => hrefDasObras(filtros, id);
  const abrir = (id: string) => router.push(hrefDaFicha(id), { scroll: false });
  const fechar = () => router.push(hrefDasObras(filtros), { scroll: false });
  const limpar = () => { setBusca(""); router.push(hrefDasObras({ empresa: filtros.empresa }), { scroll: false }); };
  function buscar(evento: FormEvent) { evento.preventDefault(); ir({ busca: busca.trim() || undefined }); }

  const c = lista.contagens;
  const contagem: Record<FiltroDeSituacaoDaObra, number> = { em_andamento: c.emAndamento, atrasadas: c.comMarcoAtrasado, entregue: c.entregues };
  const situacoes = [
    { value: "todas", label: "Todas as obras", icon: <Layers /> },
    ...filtrosDeSituacaoDasObras.map((v) => { const Icone = ICONE_DO_FILTRO[v]; return { value: v, label: ROTULO_DO_FILTRO_DAS_OBRAS[v], icon: <Icone />, aside: String(contagem[v]) }; }),
  ];
  const empresas = [{ value: "todas", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const filtrado = temFiltroNasObras(filtros);

  const conteudo = lista.itens.length === 0 ? <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
    <div className="lista-negocios-vazia-icone" aria-hidden="true">{filtrado ? <Filter size={22} /> : <HardHat size={22} />}</div>
    <h3 className="lista-negocios-vazia-titulo">{filtrado ? "Nenhuma obra com esses filtros" : "Nenhuma obra"}</h3>
    <p className="lista-negocios-vazia-desc">{filtrado ? "Experimente outra busca ou limpe os filtros." : "Obras grandes (acima de uma instalação comum) entram aqui com marcos e documentos."}</p>
    {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : <Button size="sm" icon={<IconPlus />} onClick={() => setCriando(true)}>Nova obra</Button>}
  </div> : <>
    {lista.total > lista.itens.length ? <p className={styles.muted} role="status">Mostrando {lista.itens.length} de {lista.total} obras. Use a busca ou os filtros para ver as demais.</p> : null}
    <CardsDeObras obras={lista.itens} hrefDaFicha={hrefDaFicha} aoAbrir={abrir} />
    {opcoes?.marcosPadrao.length ? <p className={obras.nota}><Flag size={14} aria-hidden="true" />Marcos de cada obra: {opcoes.marcosPadrao.join(" → ")}.</p> : null}
  </>;

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Obras</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Obras grandes com marcos e documentos. O cronograma detalhado continua no MS Project.</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Nova obra</Button>
        <Button variant="secondary" iconOnly icon={<Settings size={18} />} aria-label="Configurações da Engenharia" title="Configurações da Engenharia" onClick={() => setConfigurando(true)} />
      </div>
    </header>

    <div className={styles.barra}>
      <form className={`equipe-busca ${styles.busca}`} onSubmit={buscar} role="search" aria-label="Buscar obras">
        <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
        <input className="equipe-busca-input" type="search" maxLength={150} aria-label="Buscar obra ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar obra ou cliente…" />
      </form>
      <span className={styles.espacoDaBarra} />
      <div className={styles.filtros} role="group" aria-label="Filtros das obras">
        <div className={styles.filtro}><FiltroComBusca label="Situação" icon={<Layers />} semFiltro="todas" value={filtros.situacao ?? "todas"}
          onChange={(v) => ir({ situacao: v === "todas" ? undefined : (v as FiltroDeSituacaoDaObra) })} options={situacoes} /></div>
        <div className={styles.filtro}><FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(v) => ir({ empresa: v === "todas" ? undefined : (v as CompanyKey) })} options={empresas} /></div>
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>
    </div>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
    {falhaDaFicha === "nao_encontrada" ? <p className="aviso aviso--alerta" role="status">Obra não encontrada. O link pode estar errado.</p> : null}
    {falhaDaFicha === "indisponivel" ? <p className="aviso aviso--erro" role="alert">Não foi possível abrir a obra agora. Tente de novo em instantes.</p> : null}
    <section className={`${estilosClientes.conteudo} ${styles.conteudo}`} aria-label="Obras">{conteudo}</section>

    {ficha ? <FichaDaObra key={ficha.id} obra={ficha} opcoes={opcoes} hoje={hoje} aoFechar={fechar} aoAtualizar={() => router.refresh()} /> : null}
    {criando ? <ObraForm opcoes={opcoes} hoje={hoje} empresaInicial={filtros.empresa} aoCancelar={() => setCriando(false)}
      aoSalvar={(o) => { setCriando(false); setAviso(`${o.nome} criada com os ${o.marcos.total} marcos.`); router.push(hrefDasObras(filtros, o.id), { scroll: false }); router.refresh(); }} /> : null}
    {configurando ? <ConfiguracoesDaEngenharia opcoes={opcoesDaEngenharia} aoFechar={() => setConfigurando(false)} /> : null}
  </div>;
}
