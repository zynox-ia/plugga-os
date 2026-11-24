import { describe, expect, it } from "vitest";

import { EXTRATO_MAX_BYTES, ExtratoRecusado, extratoEhDaConta, lerOfx } from "./extrato-ofx";

/** OFX 1.x (SGML): cabeçalho em linhas, tags sem fechamento nos campos, CHARSET 1252. */
const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>999<BRANCHID>9999<ACCTID>99999-9<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261101000000[-3:BRT]
<DTEND>20261130235959[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261121100000[-3:BRT]
<TRNAMT>-1742.18
<FITID>2026112100001
<MEMO>PIX ENVIADO PREFEITURA MUNICIPAL
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261114
<TRNAMT>7200,00
<FITID>2026111400007
<NAME>SUPERM BOM PRECO
<MEMO>PIX RECEBIDO SUPERM BOM PRECO NORTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>FEE
<DTPOSTED>20261122
<TRNAMT>-2.5
<MEMO>TAR PIX ENVIADO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>15320.42<DTASOF>20261130</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;

/** OFX 2.x (XML), com as tags fechadas. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>999</BANKID><BRANCHID>9999</BRANCHID><ACCTID>999999</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261130</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261120</DTPOSTED><TRNAMT>-312.40</TRNAMT><FITID>A-1</FITID><MEMO>PAG BOLETO PAPELARIA CENTRO</MEMO></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-50.00</BALAMT><DTASOF>20261130120000</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const latin1 = (texto: string) => Buffer.from(texto, "latin1");

describe("leitura do extrato OFX (PLU-339, C1)", () => {
  it("OFX 1.x: conta, período, saldo e movimentos, com o valor com sinal e o dia de Manaus", () => {
    const extrato = lerOfx(latin1(SGML));
    expect(extrato.conta).toEqual({ banco: "999", agencia: "9999", conta: "99999-9" });
    expect(extrato.periodo).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(extrato.saldo).toEqual({ valor: "15320.42", em: "2026-11-30" });
    expect(extrato.movimentos).toEqual([
      { identificador: "2026112100001", conteudo: expect.any(String), dia: "2026-11-21", valor: "-1742.18", descricao: "PIX ENVIADO PREFEITURA MUNICIPAL" },
      { identificador: "2026111400007", conteudo: expect.any(String), dia: "2026-11-14", valor: "7200.00", descricao: "PIX RECEBIDO SUPERM BOM PRECO NORTE" },
      // Sem FITID: um identificador estável do conteúdo e da posição no arquivo.
      { identificador: expect.stringMatching(/^sem-fitid:[0-9a-f]{32}$/), conteudo: expect.any(String), dia: "2026-11-22", valor: "-2.50", descricao: "TAR PIX ENVIADO" },
    ]);
  });

  it("o mesmo arquivo dá os mesmos identificadores (o que já entrou não entra de novo)", () => {
    expect(lerOfx(latin1(SGML)).movimentos.map((m) => m.identificador)).toEqual(lerOfx(latin1(SGML)).movimentos.map((m) => m.identificador));
  });

  it("CHARSET 1252: os acentos do memo saem certos", () => {
    const comAcento = SGML.replace("PIX ENVIADO PREFEITURA MUNICIPAL", "PIX ENVIADO PREFEITURA DE MANAUS - SÃO JOSÉ");
    expect(lerOfx(latin1(comAcento)).movimentos[0]?.descricao).toBe("PIX ENVIADO PREFEITURA DE MANAUS - SÃO JOSÉ");
  });

  it("OFX 2.x (XML): mesmo resultado, com as tags fechadas e o saldo negativo", () => {
    const extrato = lerOfx(Buffer.from(XML, "utf8"));
    expect(extrato.conta).toEqual({ banco: "999", agencia: "9999", conta: "999999" });
    expect(extrato.saldo).toEqual({ valor: "-50.00", em: "2026-11-30" });
    expect(extrato.movimentos).toEqual([{ identificador: "A-1", conteudo: expect.any(String), dia: "2026-11-20", valor: "-312.40", descricao: "PAG BOLETO PAPELARIA CENTRO" }]);
  });

  it("recusa DOCTYPE e ENTITY (XXE), mesmo em OFX 1.x", () => {
    const xxe = XML.replace("<OFX>", '<!DOCTYPE OFX [<!ENTITY x SYSTEM "file:///etc/passwd">]><OFX>');
    expect(() => lerOfx(Buffer.from(xxe))).toThrow(ExtratoRecusado);
    expect(() => lerOfx(latin1(SGML.replace("<OFX>", "<!ENTITY a 'b'><OFX>")))).toThrow(ExtratoRecusado);
  });

  it("recusa o que não é OFX, o arquivo grande demais, o sem movimentos e o movimento sem data ou valor válidos", () => {
    expect(() => lerOfx(Buffer.from("data;valor\n2026-11-01;10"))).toThrow(/não é um extrato OFX/);
    expect(() => lerOfx(Buffer.alloc(EXTRATO_MAX_BYTES + 1, 0x41))).toThrow(/maior que o limite/);
    expect(() => lerOfx(latin1(SGML.replace(/<STMTTRN>[\s\S]*<\/STMTTRN>/, "")))).toThrow(/nenhum movimento/);
    expect(() => lerOfx(latin1(SGML.replace("<DTPOSTED>20261114", "<DTPOSTED>2026-11-14")))).toThrow(/data inválida/);
    expect(() => lerOfx(latin1(SGML.replace("<TRNAMT>-2.5", "<TRNAMT>abc")))).toThrow(/valor inválido/);
    expect(() => lerOfx(latin1(SGML.replace("<TRNAMT>-2.5", "<TRNAMT>0.00")))).toThrow(/valor zero/);
  });

  it("recusa arquivo com linhas ou movimentos demais", () => {
    const muitasLinhas = `${SGML}${"\n".repeat(200_001)}`;
    expect(() => lerOfx(latin1(muitasLinhas))).toThrow(/linhas demais/);
  });
});

describe("o extrato é da conta escolhida?", () => {
  it("confere os dígitos, com ou sem o dígito verificador e os zeros à esquerda; sem número de um lado, aceita", () => {
    expect(extratoEhDaConta("99999-9", "999999")).toBe(true);
    expect(extratoEhDaConta("99999-9", "99999")).toBe(true);
    expect(extratoEhDaConta("0099999-9", "999999")).toBe(true);
    expect(extratoEhDaConta("99999-9", "88888-8")).toBe(false);
    expect(extratoEhDaConta("99999-9", "9999")).toBe(false);
    expect(extratoEhDaConta(null, "88888")).toBe(true);
    expect(extratoEhDaConta("99999-9", null)).toBe(true);
  });
});

describe("extrato com a marca de ordem de bytes (BOM)", () => {
  it("o UTF-8 com BOM é lido como sem", () => {
    const comBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(XML, "utf8")]);
    expect(lerOfx(comBom).movimentos).toHaveLength(1);
  });
});

describe("identidade dos movimentos sem FITID (revisão da C1)", () => {
  const semFitid = (linhas: [string, string, string][]) => `OFXHEADER:100
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
${linhas.map(([d, v, memo]) => `<STMTTRN><DTPOSTED>${d}<TRNAMT>${v}<MEMO>${memo}</STMTTRN>`).join("\n")}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it("o mesmo movimento em dois arquivos que se sobrepõem tem o mesmo identificador (a posição não entra)", () => {
    const quinzena = lerOfx(Buffer.from(semFitid([["20261105", "-10.00", "TAR A"], ["20261110", "-20.00", "PIX B"]]), "latin1"));
    const mes = lerOfx(Buffer.from(semFitid([["20261101", "5.00", "PIX C"], ["20261105", "-10.00", "TAR A"], ["20261110", "-20.00", "PIX B"], ["20261120", "-1.00", "TAR D"]]), "latin1"));
    const ids = new Set(mes.movimentos.map((m) => m.identificador));
    expect(quinzena.movimentos.every((m) => ids.has(m.identificador))).toBe(true);
  });

  it("dois movimentos idênticos no mesmo dia continuam distintos (a ordem da ocorrência entra)", () => {
    const extrato = lerOfx(Buffer.from(semFitid([["20261122", "-2.50", "TAR PIX"], ["20261122", "-2.50", "TAR PIX"]]), "latin1"));
    expect(new Set(extrato.movimentos.map((m) => m.identificador)).size).toBe(2);
  });

  it("cada movimento traz a chave do conteúdo (dia, valor e descrição), que separa FITID repetido com conteúdo diferente", () => {
    const extrato = lerOfx(Buffer.from(SGML, "latin1"));
    expect(extrato.movimentos.map((m) => m.conteudo)).toEqual(extrato.movimentos.map(() => expect.stringMatching(/^[0-9a-f]{16}$/)));
    expect(new Set(extrato.movimentos.map((m) => m.conteudo)).size).toBe(3);
  });
});
