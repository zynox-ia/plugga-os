"use client";

import { Building2, Filter, LayoutGrid, List, Plus, Search, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { ClientDetail, ClientDuplicateCandidate, ClientListItem, ClientOwner } from "@plugga/shared";

import { hrefDaFicha } from "../lib/clientes";
import { ClienteForm } from "./cliente-form";
import { FichaCliente } from "./ficha-cliente";
import { Modal } from "./modal";
import { Button, SelectField, TextField } from "./ui";
import { CardsDeClientes, ListaDeClientes } from "./clientes/visualizacoes-clientes";
import styles from "./clientes/tela-clientes.module.css";

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
        <header className={styles.cabecalho}>
          <div>
            <span className={styles.eyebrow}>Relacionamento</span>
            <h2>Clientes</h2>
            <p>Uma visão de quem faz parte da sua carteira.</p>
          </div>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCriando(true)} aria-label="+ Novo cliente">
            Novo cliente
          </Button>
        </header>

        <form className={styles.filtros} onSubmit={buscar} role="search" aria-label="Filtrar clientes">
          <div className={styles.busca}>
            <button type="submit" className={styles.botaoBusca} aria-label="Buscar clientes"><Search size={16} aria-hidden="true" /></button>
            <TextField id="clientes-busca" label="Buscar cliente" type="search" maxLength={150} value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Nome, documento ou contato…" />
          </div>
          <div className={styles.filtroSituacao}>
            <SelectField label="Situação" value={active || "todos"} onChange={(valor) => { const situacao = valor === "todos" ? "" : valor; setActive(situacao); setPagina(1); router.push(hrefDaFicha(null, { q: q.trim() || undefined, active: situacao || undefined }), { scroll: false }); }} options={[{ value: "todos", label: "Todos", icon: <Filter /> }, { value: "true", label: "Ativos", icon: <UserRound /> }, { value: "false", label: "Inativos", icon: <UserRound /> }]} />
          </div>
          <div className={styles.filtroTipo}>
            <SelectField label="Tipo de pessoa" value={tipo} onChange={(valor) => { setTipo(valor); setPagina(1); }} options={[{ value: "todos", label: "Todos os clientes", icon: <Users /> }, { value: "pj", label: "Pessoa Jurídica", icon: <Building2 /> }, { value: "pf", label: "Pessoa Física", icon: <UserRound /> }]} />
          </div>
          {temFiltros ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
          <div ref={abasRef} className={`ui-tabs-list ${styles.abas}`} role="tablist" aria-label="Visualização de clientes" onKeyDown={navegarAbas}>
            <button type="button" id="clientes-visao-cards" className="ui-tab" role="tab" aria-selected={visao === "cards"} aria-controls="clientes-cards" tabIndex={visao === "cards" ? 0 : -1} onClick={() => setVisao("cards")}><LayoutGrid size={14} aria-hidden="true" />Cards</button>
            <button type="button" id="clientes-visao-lista" className="ui-tab" role="tab" aria-selected={visao === "lista"} aria-controls="clientes-lista" tabIndex={visao === "lista" ? 0 : -1} onClick={() => setVisao("lista")}><List size={14} aria-hidden="true" />Lista</button>
          </div>
        </form>

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
