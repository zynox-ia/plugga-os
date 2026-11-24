"use client";

import type { ConfiguracaoDeTipoDeOrdem, ConfiguracoesDaEngenharia, OpcoesDaEngenhariaResposta } from "@plugga/shared";
import { Landmark, Monitor, Pencil, Settings, UserRound, Users, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { enviar } from "../../lib/clientes";
import { dataEmManaus } from "../../lib/compras";
import { lerPrazoPadrao, textoDoPrazoPadrao } from "../../lib/engenharia";
import { ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosConfig from "../financeiro/configuracoes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Dialog, TextField } from "../ui";
import { DistribuidorasDaEngenharia } from "./distribuidoras-da-engenharia";
import styles from "./engenharia.module.css";
import { IconeDoTipo } from "./partes";
import { PlataformasDaEngenharia } from "./plataformas-da-engenharia";

const ABAS = [{ id: "plataformas", rotulo: "Plataformas", icone: Monitor }, { id: "tipos", rotulo: "Tipos de O.S.", icone: Wrench }, { id: "distribuidoras", rotulo: "Distribuidoras", icone: Landmark }] as const;
type Aba = (typeof ABAS)[number]["id"];

/**
 * Configurações da Engenharia (PLU-349), pela engrenagem do cabeçalho: os tipos de
 * O.S. com o prazo padrão (em dias úteis, que pré-preenche a Nova O.S.) e quem
 * agenda. Só o gerente da Engenharia edita. As Plataformas entram com as Usinas (PLU-347);
 * as Distribuidoras, com os Protocolos (PLU-348).
 */
export function ConfiguracoesDaEngenharia({ opcoes, aoFechar, abaInicial = "plataformas" }: { opcoes: OpcoesDaEngenhariaResposta | null; aoFechar: () => void; abaInicial?: Aba }) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const abasRef = useRef<HTMLDivElement>(null);
  function navegar(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = ABAS.findIndex((a) => a.id === aba);
    const j = evento.key === "Home" ? 0 : evento.key === "End" ? ABAS.length - 1 : (i + (evento.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length;
    const proxima: Aba = ABAS[j]!.id;
    setAba(proxima);
    abasRef.current?.querySelector<HTMLButtonElement>(`#config-eng-${proxima}`)?.focus();
  }
  const [dados, setDados] = useState<ConfiguracoesDaEngenharia | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [editando, setEditando] = useState<ConfiguracaoDeTipoDeOrdem | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void enviar<ConfiguracoesDaEngenharia>("/api/engenharia/configuracoes", "GET").then((r) => {
      if (!vivo) return;
      if (r.ok) setDados(r.dados); else setFalha(r.erro.mensagem);
    });
    return () => { vivo = false; };
  }, []);

  return <>
    <Dialog title="Configurações da Engenharia" size="larga" className={estilosConfig.telaCheia} icon={<Settings size={20} />} onClose={aoFechar} cancelText="Fechar"
      description="Plataformas de inversor, tipos de O.S. e distribuidoras. São as mesmas opções dos menus das telas.">
      <div className={estilosConfig.corpo}>
        <div className={estilosConfig.barra}>
          <div ref={abasRef} className={`${estilosClientes.abas} ${estilosConfig.abas}`} role="tablist" aria-label="Seções das configurações" onKeyDown={navegar}>
            {ABAS.map(({ id, rotulo, icone: Icone }) => <button key={id} type="button" id={`config-eng-${id}`} className="ui-tab" role="tab" aria-selected={aba === id}
              aria-controls="config-eng-painel" tabIndex={aba === id ? 0 : -1} onClick={() => setAba(id)}><Icone size={15} aria-hidden="true" />{rotulo}</button>)}
          </div>
        </div>
        {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
        <section id="config-eng-painel" role="tabpanel" aria-labelledby={`config-eng-${aba}`} className={estilosConfig.painel}>
        {aba === "plataformas" ? <PlataformasDaEngenharia aoAviso={setAviso} /> : aba === "distribuidoras" ? <DistribuidorasDaEngenharia aoAviso={setAviso} /> : <>
        {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
        {!dados && !falha ? <p className={estilosConfig.vazio} role="status">Carregando os tipos de O.S.…</p> : null}
        {dados ? <div className={estilosConfig.tabela}>
          <div className={estilosConfig.cabecalhoDaTabela}>
            <h3>{dados.tipos.length} tipos de O.S.</h3>
            <p>O prazo padrão, em dias úteis (feriado conta como dia útil), pré-preenche a Nova O.S.{dados.podeEditar ? "" : " Só o gerente da Engenharia muda."}</p>
          </div>
          <div className={estilosConfig.rolagem} role="region" aria-label="Tipos de O.S." tabIndex={0}>
            <table>
              <caption className="sr-only">Tipos de O.S., com o prazo padrão, quem agenda e as O.S. abertas</caption>
              <thead><tr><th scope="col">Tipo</th><th scope="col">Prazo padrão</th><th scope="col">Quem agenda</th><th scope="col">O.S. abertas</th>{dados.podeEditar ? <th scope="col"><span className="sr-only">Editar</span></th> : null}</tr></thead>
              <tbody>{dados.tipos.map((t) => <tr key={t.tipo}>
                <td data-l="Tipo"><div className={estilosLista.oportunidade}>
                  <span className={`${estilosLista.iconeOportunidade} ${styles.iconeLinha}`} aria-hidden="true"><IconeDoTipo tipo={t.tipo} tamanho={16} /></span>
                  <div className="celula-lead-bloco"><span className={`lead-nome ${estilosLista.titulo}`}>{ROTULO_DO_TIPO[t.tipo]}</span>
                    {t.atualizado ? <span className={estilosLista.codigo}>Mudado em {dataEmManaus(t.atualizado.em)}{t.atualizado.por ? ` por ${t.atualizado.por.nome}` : ""}</span> : null}</div>
                </div></td>
                <td data-l="Prazo padrão">{textoDoPrazoPadrao(t.prazoPadraoDiasUteis)}</td>
                <td data-l="Quem agenda">{t.agendador?.nome ?? <span className={styles.semTecnico}>Qualquer pessoa da Engenharia</span>}</td>
                <td data-l="O.S. abertas">{t.abertas}</td>
                {dados.podeEditar ? <td><Button variant="secondary" size="sm" iconOnly icon={<Pencil size={14} />} className={styles.olho} aria-label={`Editar ${ROTULO_DO_TIPO[t.tipo]}`} title="Editar" onClick={() => setEditando(t)} /></td> : null}
              </tr>)}</tbody>
            </table>
          </div>
        </div> : null}
        </>}
        </section>
      </div>
    </Dialog>
    {editando ? <EditarTipo tipo={editando} opcoes={opcoes} aoCancelar={() => setEditando(null)}
      aoSalvar={(novos) => { setDados(novos); setEditando(null); setAviso(`${ROTULO_DO_TIPO[editando.tipo]} atualizado.`); }} /> : null}
  </>;
}

/** Prazo padrão (0 a 30 dias úteis) e quem agenda o tipo. */
function EditarTipo({ tipo: t, opcoes, aoCancelar, aoSalvar }: { tipo: ConfiguracaoDeTipoDeOrdem; opcoes: OpcoesDaEngenhariaResposta | null; aoCancelar: () => void; aoSalvar: (d: ConfiguracoesDaEngenharia) => void }) {
  const [prazo, setPrazo] = useState(String(t.prazoPadraoDiasUteis));
  const [agendador, setAgendador] = useState(t.agendador?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Quem agenda: as pessoas da Engenharia; o agendador atual entra mesmo que não esteja mais na lista.
  const pessoas = [...(opcoes?.tecnicos ?? []), ...(t.agendador && !opcoes?.tecnicos.some((p) => p.id === t.agendador!.id) ? [t.agendador] : [])];

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const { valor, problema } = lerPrazoPadrao(prazo);
    setErro(problema);
    if (valor === null) return;
    setEnviando(true); setFalha(null);
    const r = await enviar<ConfiguracoesDaEngenharia>(`/api/engenharia/configuracoes/tipos/${t.tipo}`, "PUT", { prazoPadraoDiasUteis: valor, agendadorId: agendador || null });
    setEnviando(false);
    if (r.ok) aoSalvar(r.dados);
    else setFalha(r.erro.mensagem);
  }

  return <Dialog title={`Editar ${ROTULO_DO_TIPO[t.tipo]}`} size="estreita" icon={<Pencil size={20} />} onClose={aoCancelar}
    description="Vale para as próximas O.S. do tipo; as abertas mantêm o prazo que têm."
    footer={<Button type="submit" form="form-tipo-os" disabled={enviando}>{enviando ? "Salvando…" : "Salvar"}</Button>}>
    <form id="form-tipo-os" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <TextField label="Prazo padrão (dias úteis)" required inputMode="numeric" maxLength={2} autoFocus value={prazo} onChange={(e) => { setPrazo(e.target.value); setErro(null); }}
        error={erro ?? undefined} hint={lerPrazoPadrao(prazo).valor !== null ? `Fica "${textoDoPrazoPadrao(lerPrazoPadrao(prazo).valor!)}". 0 = no mesmo dia.` : "De 0 a 30. 0 = no mesmo dia."} />
      <CampoDeMenu label="Quem agenda" icon={<UserRound />} value={agendador || "qualquer"} onChange={(v) => setAgendador(v === "qualquer" ? "" : v)}
        options={[{ value: "qualquer", label: "Qualquer pessoa da Engenharia", icon: <Users /> }, ...pessoas.map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }))]} />
    </form>
  </Dialog>;
}
