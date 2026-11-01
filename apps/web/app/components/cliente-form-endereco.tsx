"use client";

import { useState } from "react";
import { formatarCep, somenteDigitos, type ClientDetail } from "@plugga/shared";

import { UFS } from "../lib/clientes";
import { Heading, IconMapPin, SelectField, TextField } from "./ui";

function mascaraCep(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function useEnderecoDoCliente(cliente: ClientDetail | null) {
  const [cep, setCep] = useState(cliente?.postalCode ? formatarCep(cliente.postalCode) : "");
  const [logradouro, setLogradouro] = useState(cliente?.street ?? "");
  const [complemento, setComplemento] = useState(cliente?.addressComplement ?? "");
  const [bairro, setBairro] = useState(cliente?.district ?? "");
  const [cidade, setCidade] = useState(cliente?.city ?? "");
  const [uf, setUf] = useState(cliente?.state ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);

  async function consultarCep(cepDigitado: string) {
    const limpo = somenteDigitos(cepDigitado);
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`/api/cep/${limpo}`);
      if (res.ok) {
        const dados = (await res.json()) as {
          logradouro?: string;
          bairro?: string;
          cidade?: string;
          uf?: string;
          complemento?: string;
        };
        if (dados.logradouro) setLogradouro(dados.logradouro);
        if (dados.bairro) setBairro(dados.bairro);
        if (dados.cidade) setCidade(dados.cidade);
        if (dados.uf) setUf(dados.uf);
        if (dados.complemento && !complemento) setComplemento(dados.complemento);
      }
    } catch {
      // Silencioso em caso de indisponibilidade
    } finally {
      setBuscandoCep(false);
    }
  }

  return { cep, setCep, logradouro, setLogradouro, complemento, setComplemento, bairro, setBairro, cidade, setCidade, uf, setUf, buscandoCep, consultarCep };
}

export function ClienteFormEndereco({ endereco, erroDo }: {
  endereco: ReturnType<typeof useEnderecoDoCliente>;
  erroDo: (campo: string) => string | undefined;
}) {
  const { cep, setCep, logradouro, setLogradouro, complemento, setComplemento, bairro, setBairro, cidade, setCidade, uf, setUf, buscandoCep, consultarCep } = endereco;
  return (
      <section className="ui-dialog-section">
        <div className="ui-dialog-section-header">
          <Heading as="h3" icon={<IconMapPin />}>Endereço</Heading>
          <p className="ui-dialog-section-desc">
            Localização da sede comercial ou residência do cliente.
          </p>
        </div>
        <div className="ui-dialog-grid">
          <TextField
            id="cliente-postalCode"
            name="postalCode"
            label="CEP"
            inputMode="numeric"
            maxLength={9}
            value={cep}
            placeholder="69000-000"
            error={erroDo("postalCode")}
            hint={buscandoCep ? "Buscando endereço pelo CEP…" : undefined}
            onChange={(ev) => {
              const novoCep = mascaraCep(ev.target.value);
              setCep(novoCep);
              if (somenteDigitos(novoCep).length === 8) {
                void consultarCep(novoCep);
              }
            }}
            onBlur={() => {
              if (somenteDigitos(cep).length === 8) {
                void consultarCep(cep);
              }
            }}
          />
          <TextField
            id="cliente-street"
            name="street"
            label="Logradouro e número"
            maxLength={200}
            value={logradouro}
            placeholder="Rua, Avenida, Número"
            error={erroDo("street")}
            onChange={(ev) => setLogradouro(ev.target.value)}
          />
        </div>
        <div className="ui-dialog-grid">
          <TextField
            id="cliente-addressComplement"
            name="addressComplement"
            label="Complemento"
            maxLength={100}
            value={complemento}
            placeholder="Sala, Bloco, Galpão"
            error={erroDo("addressComplement")}
            onChange={(ev) => setComplemento(ev.target.value)}
          />
          <TextField
            id="cliente-district"
            name="district"
            label="Bairro"
            maxLength={100}
            value={bairro}
            placeholder="Bairro"
            error={erroDo("district")}
            onChange={(ev) => setBairro(ev.target.value)}
          />
        </div>
        <div className="ui-dialog-grid">
          <TextField
            id="cliente-city"
            name="city"
            label="Cidade"
            maxLength={100}
            value={cidade}
            placeholder="Cidade"
            error={erroDo("city")}
            onChange={(ev) => setCidade(ev.target.value)}
          />
          <SelectField
            id="cliente-state"
            label="UF"
            value={uf}
            onChange={setUf}
            options={[
              { value: "", label: "—" },
              ...UFS.map((sigla) => ({ value: sigla, label: sigla })),
            ]}
          />
        </div>
      </section>
  );
}
