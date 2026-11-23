"use client";

import { DICA_DO_ACESSO_DA_PLATAFORMA, pareceCredencial, ROTULO_DO_ACESSO_DA_PLATAFORMA, type ListarPlataformasResposta, type PlataformaDeInversor } from "@plugga/shared";
import { KeyRound, Monitor, Pencil, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { enviar } from "../../lib/clientes";
import { contagemDeUsinas, kwpLegivel } from "../../lib/usinas";
import estilosConfig from "../financeiro/configuracoes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import { Alert, Button, Checkbox, Dialog, TextField } from "../ui";
import styles from "./engenharia.module.css";

/** Plataformas de inversor (PLU-347): as do monitoramento do dia; só o gerente cadastra e edita. */
export function PlataformasDaEngenharia({ aoAviso }: { aoAviso: (texto: string) => void }) {
  const [dados, setDados] = useState<ListarPlataformasResposta | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [editando, setEditando] = useState<PlataformaDeInversor | "nova" | null>(null);

  useEffect(() => {
    let vivo = true;
    void enviar<ListarPlataformasResposta>("/api/engenharia/plataformas", "GET").then((r) => { if (vivo) { if (r.ok) setDados(r.dados); else setFalha(r.erro.mensagem); } });
    return () => { vivo = false; };
  }, []);

  if (falha) return <Alert tone="danger" title={`Erro: ${falha}`} />;
  if (!dados) return <p className={estilosConfig.vazio} role="status">Carregando as plataformas…</p>;
  const ativas = dados.itens.filter((p) => p.ativa).length;
  return <>
    <div className={estilosConfig.tabela}>
      <div className={`${estilosConfig.cabecalhoDaTabela} ${styles.cabecalhoComAcao}`}>
        <div><h3>{ativas} {ativas === 1 ? "plataforma de inversor" : "plataformas de inversor"}</h3><p>Conferidas uma vez por dia útil, no monitoramento de hoje.{dados.podeEditar ? "" : " Só o gerente da Engenharia muda."}</p></div>
        {dados.podeEditar ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditando("nova")}>Nova plataforma</Button> : null}
      </div>
      <div className={estilosConfig.rolagem} role="region" aria-label="Plataformas de inversor" tabIndex={0}>
        <table>
          <caption className="sr-only">Plataformas de inversor, com as usinas, onde está o acesso e a situação</caption>
          <thead><tr><th scope="col">Plataforma</th><th scope="col">Usinas</th><th scope="col">Acesso</th><th scope="col">Situação</th>{dados.podeEditar ? <th scope="col"><span className="sr-only">Editar</span></th> : null}</tr></thead>
          <tbody>{dados.itens.map((p) => <tr key={p.id}>
            <td data-l="Plataforma"><div className={estilosLista.oportunidade}>
              <span className={`${estilosLista.iconeOportunidade} ${styles.iconeLinha}`} aria-hidden="true"><Monitor size={16} /></span>
              <div className="celula-lead-bloco"><span className={`lead-nome ${estilosLista.titulo}`}>{p.nome}</span><span className={estilosLista.codigo}>{kwpLegivel(p.potenciaKwp)} kWp monitorados</span></div>
            </div></td>
            <td data-l="Usinas">{contagemDeUsinas(p.usinas)}</td>
            <td data-l="Acesso">{p.observacaoDeAcesso ? <span className={styles.acessoDaPlataforma}><KeyRound size={13} aria-hidden="true" />{p.observacaoDeAcesso}</span> : <span className={styles.semTecnico}>Não informado</span>}</td>
            <td data-l="Situação"><span className={`ui-badge ${p.ativa ? "ui-tone--neutral" : "ui-tone--warning"}`}>{p.ativa ? "Ativa" : "Inativa"}</span></td>
            {dados.podeEditar ? <td><Button variant="secondary" size="sm" iconOnly icon={<Pencil size={14} />} className={styles.olho} aria-label={`Editar ${p.nome}`} title="Editar" onClick={() => setEditando(p)} /></td> : null}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    {editando ? <PlataformaForm plataforma={editando === "nova" ? undefined : editando} aoCancelar={() => setEditando(null)}
      aoSalvar={(novos, texto) => { setDados(novos); setEditando(null); aoAviso(texto); }} /> : null}
  </>;
}

/** Nova plataforma e Editar: o nome e onde está o acesso (nunca a senha), e se segue ativa. */
function PlataformaForm({ plataforma, aoCancelar, aoSalvar }: { plataforma?: PlataformaDeInversor; aoCancelar: () => void; aoSalvar: (d: ListarPlataformasResposta, aviso: string) => void }) {
  const [nome, setNome] = useState(plataforma?.nome ?? "");
  const [acesso, setAcesso] = useState(plataforma?.observacaoDeAcesso ?? "");
  const [ativa, setAtiva] = useState(plataforma?.ativa ?? true);
  const [erros, setErros] = useState<{ nome?: string; acesso?: string }>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const problemas = {
      nome: nome.trim() ? undefined : "informe o nome da plataforma.",
      // Onde está o acesso, nunca a senha: a API recusa o mesmo texto.
      acesso: acesso.trim() && pareceCredencial(acesso) ? "parece uma senha ou um token. Escreva só onde o acesso está (ex.: no cofre)." : undefined,
    };
    setErros(problemas);
    if (problemas.nome || problemas.acesso) return;
    setEnviando(true); setFalha(null);
    const corpo = { nome: nome.trim(), observacaoDeAcesso: acesso.trim() || null, ...(plataforma ? { ativa } : {}) };
    const r = plataforma
      ? await enviar<ListarPlataformasResposta>(`/api/engenharia/plataformas/${plataforma.id}`, "PATCH", corpo)
      : await enviar<ListarPlataformasResposta>("/api/engenharia/plataformas", "POST", corpo);
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados, plataforma ? `${nome.trim()} atualizada.` : `${nome.trim()} cadastrada.`); return; }
    setErros({ nome: r.erro.porCampo.nome, acesso: r.erro.porCampo.observacaoDeAcesso });
    setFalha(r.erro.mensagem);
  }

  return <Dialog title={plataforma ? `Editar ${plataforma.nome}` : "Nova plataforma"} size="estreita" icon={plataforma ? <Pencil size={20} /> : <Monitor size={20} />} onClose={aoCancelar}
    description="Uma plataforma de inversor entra no monitoramento do dia quando tiver usina ativa."
    footer={<Button type="submit" form="form-plataforma" disabled={enviando}>{enviando ? "Salvando…" : plataforma ? "Salvar" : "Cadastrar"}</Button>}>
    <form id="form-plataforma" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <TextField label="Nome" required maxLength={60} autoFocus value={nome} onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: undefined })); }} error={erros.nome} placeholder="Ex.: FusionSolar" />
      <TextField label={ROTULO_DO_ACESSO_DA_PLATAFORMA} maxLength={200} autoComplete="off" value={acesso} onChange={(e) => { setAcesso(e.target.value); setErros((x) => ({ ...x, acesso: undefined })); }} error={erros.acesso} hint={DICA_DO_ACESSO_DA_PLATAFORMA} />
      {plataforma ? <Checkbox label="Ativa" description="Inativa, sai do monitoramento do dia e dos menus" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> : null}
    </form>
  </Dialog>;
}
