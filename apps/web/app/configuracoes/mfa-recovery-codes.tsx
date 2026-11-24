"use client";

import { useState } from "react";
import { Alert, Button } from "../components/ui";
import styles from "./mfa.module.css";

export function MfaRecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  function download() {
    const text = `Plugga OS — códigos de recuperação\nCada código pode ser usado uma única vez. Guarde em um local seguro.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "plugga-codigos-de-recuperacao.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    setCopyError("");
    setCopied(false);
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopyError("Não foi possível copiar. Baixe os códigos ou selecione-os e copie manualmente.");
    }
  }

  return (
    <section className={styles.stack} aria-label="Salvar códigos de recuperação">
      <Alert tone="warning" title="Salve seus códigos de recuperação agora">
        Eles aparecem somente nesta tela, uma vez. Cada código substitui o app em um acesso e deixa de funcionar após o
        uso. Guarde-os em um local seguro, separado do seu autenticador. Ao sair, você não poderá consultá-los
        novamente.
      </Alert>
      <ul className={styles.codes} aria-label="Códigos de recuperação">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={download}>
          Baixar códigos
        </Button>
        <Button variant="secondary" onClick={copy}>
          {copied ? "Códigos copiados" : "Copiar códigos"}
        </Button>
      </div>
      {copyError && <p role="alert" className={styles.note}>{copyError}</p>}
      <label className={styles.saved}>
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        <span>Guardei os códigos em um local seguro</span>
      </label>
      <div className={styles.actions}>
        <Button disabled={!saved} onClick={onDone}>
          Concluir
        </Button>
      </div>
    </section>
  );
}
