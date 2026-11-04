"use client";

import { Building2, Filter, LayoutGrid, List, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { ClientDetail, ClientDuplicateCandidate, ClientListItem, ClientOwner } from "@plugga/shared";

import { hrefDaFicha } from "../lib/clientes";
import { ClienteForm } from "./cliente-form";
import { FichaCliente } from "./ficha-cliente";
import { Modal } from "./modal";
import { Button, IconPlus, IconSearch, SelectField } from "./ui";
import { CardsDeClientes, ListaDeClientes } from "./clientes/visualizacoes-clientes";
import styles from "./clientes/tela-clientes.module.css";
import estilosPipelines from "./pipelines/tela-pipelines.module.css";

type Filtros = { q?: string; active?: string };

/**
 * Clientes (PLU-268): cadastro único, PF ou PJ, das duas empresas. A lista
 * mostra CPF e telefone mascarados; a ficha abre em modal com endereço próprio.
 */
export function ClientesView({
  itens,
  filtros,
  responsaveis,
  ficha,
  fichaNaoEncontrada,
}: {
  itens: ClientListItem[];
  filtros: Filtros;
  responsaveis: ClientOwner[];
  ficha: ClientDetail | null;
  fichaNaoEncontrada: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filtros.q ?? "");
  const [active, setActive] = useState(filtros.active ?? "");
  const [tipo, setTipo] = useState("todos");
  const [visao, setVisao] = useState<"cards" | "lista">("cards");
  const [pagina, setPagina] = useState(1);
  const abasRef = useRef<HTMLDivElement>(null);
  const [criando, setCriando] = useState(false);
  const [avisos, setAvisos] = useState<ClientDuplicateCandidate[]>([]);

  useEffect(() => { setQ(filtros.q ?? ""); setActive(filtros.active ?? ""); }, [filtros.q, filtros.active]);

  const visiveis = itens.filter((item) => tipo === "todos" || item.personType === tipo);
  const temFiltros = Boolean(q || active || tipo !== "todos");

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setPagina(1);
    router.push(hrefDaFicha(null, { q: q.trim() || undefined, active: active || undefined }));
  }

  function limpar() {
    setQ("");
    setActive("");
    setTipo("todos");
    setPagina(1);
    router.push("/clientes");
  }

  function abrir(id: string) {
    setAvisos([]);
    router.push(hrefDaFicha(id, filtros), { scroll: false });
  }

  function fecharFicha() {
    setAvisos([]);
    router.push(hrefDaFicha(null, filtros), { scroll: false });
  }

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const proxima = evento.key === "Home" ? "cards" : evento.key === "End" ? "lista" : visao === "cards" ? "lista" : "cards";
    setVisao(proxima);
    abasRef.current?.querySelector<HTMLButtonElement>(`#clientes-visao-${proxima}`)?.focus();
  }

  return (
    <div className={styles.pagina}>
        <header className={estilosPipelines.cabecalho}>
          <div className={estilosPipelines.tituloGrupo}>
            <h1 className={estilosPipelines.titulo}>Clientes</h1>
            <h2 className={estilosPipelines.subtitulo}>Gerencie seus clientes e relacionamentos comerciais.</h2>
          </div>
          <div className={estilosPipelines.acoes}>
            <form className="equipe-busca" onSubmit={buscar} role="search" aria-label="Buscar clientes">
              <button type="submit" className={styles.botaoBusca} aria-label="Buscar clientes"><IconSearch className="equipe-busca-icon" /></button>
              <input id="clientes-busca" className="equipe-busca-input" aria-label="Buscar cliente" type="search" maxLength={150} value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar cliente, documento ou contato…" />
            </form>
            <Button icon={<IconPlus />} onClick={() => setCriando(true)} aria-label="+ Novo cliente">
              Novo cliente
            </Button>
          </div>
        </header>

        <div className={`${estilosPipelines.navegacao} ${styles.navegacao}`}>
          <div ref={abasRef} className={`${estilosPipelines.visoes} ${styles.abas}`} role="tablist" aria-label="Visualização de clientes" onKeyDown={navegarAbas}>
            <button type="button" id="clientes-visao-cards" className="ui-tab" role="tab" aria-selected={visao === "cards"} aria-controls="clientes-cards" tabIndex={visao === "cards" ? 0 : -1} onClick={() => setVisao("cards")}><LayoutGrid size={15} aria-hidden="true" />Cards</button>
            <button type="button" id="clientes-visao-lista" className="ui-tab" role="tab" aria-selected={visao === "lista"} aria-controls="clientes-lista" tabIndex={visao === "lista" ? 0 : -1} onClick={() => setVisao("lista")}><List size={15} aria-hidden="true" />Lista</button>
          </div>
          <div className={`${estilosPipelines.navegacaoDireita} ${styles.filtros}`} role="group" aria-label="Filtros de clientes">
          <div className={styles.filtroSituacao}>
            <SelectField label="Situação" value={active || "todos"} onChange={(valor) => { const situacao = valor === "todos" ? "" : valor; setActive(situacao); setPagina(1); router.push(hrefDaFicha(null, { q: q.trim() || undefined, active: situacao || undefined }), { scroll: false }); }} options={[{ value: "todos", label: "Todos", icon: <Filter /> }, { value: "true", label: "Ativos", icon: <UserRound /> }, { value: "false", label: "Inativos", icon: <UserRound /> }]} />
          </div>
          <div className={styles.filtroTipo}>
            <SelectField label="Tipo de pessoa" value={tipo} onChange={(valor) => { setTipo(valor); setPagina(1); }} options={[{ value: "todos", label: "Todos os clientes", icon: <Users /> }, { value: "pj", label: "Pessoa Jurídica", icon: <Building2 /> }, { value: "pf", label: "Pessoa Física", icon: <UserRound /> }]} />
          </div>
          {temFiltros ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
          </div>
        </div>

        {fichaNaoEncontrada ? (
          <p className="aviso aviso--alerta" role="status">
            Cliente não encontrado. O link pode estar errado ou você não tem acesso a ele.
          </p>
        ) : null}

        {(["cards", "lista"] as const).map((aba) => <section key={aba} id={`clientes-${aba}`} className={styles.conteudo} role="tabpanel" aria-labelledby={`clientes-visao-${aba}`} hidden={visao !== aba} tabIndex={0}>
          {visao === aba ? visiveis.length === 0 ? <div className={styles.vazio} role="status"><Users size={26} aria-hidden="true" /><h3>{temFiltros ? "Nenhum cliente encontrado para a busca." : "Nenhum cliente cadastrado ainda."}</h3><p>{temFiltros ? "Experimente outro nome ou ajuste os filtros." : "Cadastre o primeiro cliente para começar."}</p>{temFiltros ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : null}</div> : aba === "cards" ? <CardsDeClientes itens={visiveis} filtros={filtros} aoAbrir={abrir} /> : <ListaDeClientes itens={visiveis} filtros={filtros} aoAbrir={abrir} pagina={pagina} aoMudarPagina={setPagina} /> : null}
        </section>)}

      {criando ? (
        <ClienteForm
          modo="criar"
          responsaveis={responsaveis}
          aoCancelar={() => setCriando(false)}
          aoCriar={(resposta) => {
            setCriando(false);
            setAvisos(resposta.duplicateCandidates);
            router.push(hrefDaFicha(resposta.client.id, filtros), { scroll: false });
            router.refresh();
          }}
        />
      ) : null}

      {ficha ? (
        <Modal key={ficha.id} rotulo={`Ficha de ${ficha.name}`} largura="larga" aoFechar={fecharFicha}>
          <FichaCliente cliente={ficha} responsaveis={responsaveis} avisos={avisos} aoFechar={fecharFicha} />
        </Modal>
      ) : null}
    </div>
  );
}
