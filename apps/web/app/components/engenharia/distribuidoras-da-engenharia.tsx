"use client";

import type { Distribuidora, ListarDistribuidorasResposta } from "@plugga/shared";
import { Landmark, Pencil, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { enviar } from "../../lib/clientes";
import estilosConfig from "../financeiro/configuracoes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { Alert, Button, Checkbox, Dialog, TextField } from "../ui";
import styles from "./engenharia.module.css";

/** O catálogo de distribuidoras dos protocolos (PLU-348); só o gerente cadastra e edita. */
export function DistribuidorasDaEngenharia({ aoAviso }: { aoAviso: (texto: string) => void }) {
  const [dados, setDados] = useState<ListarDistribuidorasResposta | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [editando, setEditando] = useState<Distribuidora | "nova" | null>(null);

  useEffect(() => {
    let vivo = true;
    void enviar<ListarDistribuidorasResposta>("/api/protocolos/distribuidoras", "GET").then((r) => { if (vivo) { if (r.ok) setDados(r.dados); else setFalha(r.erro.mensagem); } });
    return () => { vivo = false; };
  }, []);

  if (falha) return <Alert tone="danger" title={`Erro: ${falha}`} />;
  if (!dados) return <p className={estilosConfig.vazio} role="status">Carregando as distribuidoras…</p>;
  const ativas = dados.itens.filter((d) => d.ativa).length;
  return <>
    <div className={estilosConfig.tabela}>
      <div className={`${estilosConfig.cabecalhoDaTabela} ${styles.cabecalhoComAcao}`}>
        <div><h3>{ativas} {ativas === 1 ? "distribuidora" : "distribuidoras"}</h3><p>As opções do Novo protocolo e do filtro dos protocolos.{dados.podeEditar ? "" : " Só o gerente muda."}</p></div>
        {dados.podeEditar ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditando("nova")}>Nova distribuidora</Button> : null}
      </div>
      {dados.itens.length === 0 ? <p className={estilosConfig.vazio} role="status">Nenhuma distribuidora cadastrada.</p> : <div className={estilosConfig.rolagem} role="region" aria-label="Distribuidoras" tabIndex={0}>
        <table>
          <caption className="sr-only">Distribuidoras, com a sigla, o estado e a situação</caption>
          <thead><tr><th scope="col">Distribuidora</th><th scope="col">Sigla</th><th scope="col">UF</th><th scope="col">Situação</th>{dados.podeEditar ? <th scope="col"><span className="sr-only">Editar</span></th> : null}</tr></thead>
          <tbody>{dados.itens.map((d) => <tr key={d.id}>
            <td data-l="Distribuidora"><div className={estilosLista.oportunidade}>
              <span className={`${estilosLista.iconeOportunidade} ${styles.iconeLinha}`} aria-hidden="true"><Landmark size={16} /></span>
              <div className="celula-lead-bloco"><span className={`lead-nome ${estilosLista.titulo}`}>{d.nome}</span></div>
            </div></td>
            <td data-l="Sigla">{d.sigla ?? <span className={styles.semTecnico}>—</span>}</td>
            <td data-l="UF">{d.uf ?? <span className={styles.semTecnico}>—</span>}</td>
            <td data-l="Situação"><span className={`ui-badge ${d.ativa ? "ui-tone--neutral" : "ui-tone--warning"}`}>{d.ativa ? "Ativa" : "Inativa"}</span></td>
            {dados.podeEditar ? <td><Button variant="secondary" size="sm" iconOnly icon={<Pencil size={14} />} className={styles.olho} aria-label={`Editar ${d.nome}`} title="Editar" onClick={() => setEditando(d)} /></td> : null}
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
    {editando ? <DistribuidoraForm distribuidora={editando === "nova" ? undefined : editando} aoCancelar={() => setEditando(null)}
      aoSalvar={(novos, texto) => { setDados(novos); setEditando(null); aoAviso(texto); }} /> : null}
  </>;
}

/** Nova distribuidora e Editar: nome, sigla, UF e se segue ativa. */
function DistribuidoraForm({ distribuidora, aoCancelar, aoSalvar }: { distribuidora?: Distribuidora; aoCancelar: () => void; aoSalvar: (d: ListarDistribuidorasResposta, aviso: string) => void }) {
  const [nome, setNome] = useState(distribuidora?.nome ?? "");
  const [sigla, setSigla] = useState(distribuidora?.sigla ?? "");
  const [uf, setUf] = useState(distribuidora?.uf ?? "");
  const [ativa, setAtiva] = useState(distribuidora?.ativa ?? true);
  const [erros, setErros] = useState<{ nome?: string; uf?: string; sigla?: string }>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const estado = uf.trim().toUpperCase();
    const problemas = { nome: nome.trim() ? undefined : "informe o nome da distribuidora.", uf: estado && !/^[A-Z]{2}$/.test(estado) ? "use a sigla do estado, como AM." : undefined };
    setErros(problemas);
    if (problemas.nome || problemas.uf) return;
    setEnviando(true); setFalha(null);
    const corpo = { nome: nome.trim(), sigla: sigla.trim() || null, uf: estado || null, ...(distribuidora ? { ativa } : {}) };
    const r = distribuidora
      ? await enviar<ListarDistribuidorasResposta>(`/api/protocolos/distribuidoras/${distribuidora.id}`, "PATCH", corpo)
      : await enviar<ListarDistribuidorasResposta>("/api/protocolos/distribuidoras", "POST", corpo);
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados, distribuidora ? `${nome.trim()} atualizada.` : `${nome.trim()} cadastrada.`); return; }
    setErros({ nome: r.erro.porCampo.nome, uf: r.erro.porCampo.uf, sigla: r.erro.porCampo.sigla });
    setFalha(r.erro.mensagem);
  }

  return <Dialog title={distribuidora ? `Editar ${distribuidora.nome}` : "Nova distribuidora"} size="estreita" icon={distribuidora ? <Pencil size={20} /> : <Landmark size={20} />} onClose={aoCancelar}
    description="A distribuidora entra no Novo protocolo e no filtro dos protocolos."
    footer={<Button type="submit" form="form-distribuidora" disabled={enviando}>{enviando ? "Salvando…" : distribuidora ? "Salvar" : "Cadastrar"}</Button>}>
    <form id="form-distribuidora" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <TextField label="Nome" required maxLength={80} autoFocus value={nome} onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: undefined })); }} error={erros.nome} placeholder="Ex.: Amazonas Energia" />
      <TextField label="Sigla" maxLength={20} value={sigla} onChange={(e) => { setSigla(e.target.value); setErros((x) => ({ ...x, sigla: undefined })); }} error={erros.sigla} />
      <TextField label="UF" maxLength={2} value={uf} onChange={(e) => { setUf(e.target.value.toUpperCase()); setErros((x) => ({ ...x, uf: undefined })); }} error={erros.uf} placeholder="AM" />
      {distribuidora ? <Checkbox label="Ativa" description="Inativa, sai do Novo protocolo; os protocolos dela continuam" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> : null}
    </form>
  </Dialog>;
}
