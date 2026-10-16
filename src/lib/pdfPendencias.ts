import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// PDF "Compras e manutenção pendentes" de uma academia (anexo do e-mail).
// A4 deitado, duas tabelas (compras e manutenções) com quebra de linha nas descrições e de página.

export type LinhaPdf = string[];
type Tabela = { titulo: string; colunas: { rotulo: string; largura: number }[]; linhas: LinhaPdf[]; vazio: string };

const AZUL = rgb(0.043, 0.306, 0.635); // azul Bluefit (#0b4ea2)
const CINZA = rgb(0.23, 0.25, 0.28);
const CINZA_CLARO = rgb(0.93, 0.94, 0.95);
const BORDA = rgb(0.8, 0.82, 0.85);
const LARGURA = 842;
const ALTURA = 595;
const MARGEM = 36;
const CORPO = 8.5;

// As fontes padrão do PDF só conhecem os caracteres do português "comum" (latim): troca o resto.
export function limpar(texto: string) {
  return texto
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

export function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
  const linhas: string[] = [];
  for (const paragrafo of limpar(texto).split(/\r?\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(" ")) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

// soManutencoes: versão do pessoal de manutenção (sem as compras). soCompras: só as compras (envio das quintas).
export async function gerarPdfPendencias(dados: {
  academia: string;
  dataTexto: string;
  soManutencoes?: boolean;
  soCompras?: boolean;
  compras: LinhaPdf[];
  manutencoes: LinhaPdf[];
}) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`Pendências - ${dados.academia}`);

  let pagina: PDFPage = pdf.addPage([LARGURA, ALTURA]);
  let y = ALTURA - MARGEM;

  function cabecalhoDaPagina() {
    pagina.drawText("BFIT · Controle de unidades", { x: MARGEM, y, size: 9, font: negrito, color: AZUL });
    y -= 20;
    pagina.drawText(limpar(`${dados.soManutencoes ? "Manutenções pendentes" : dados.soCompras ? "Compras pendentes" : "Compras e manutenção pendentes"} - ${dados.academia}`), { x: MARGEM, y, size: 15, font: negrito, color: CINZA });
    y -= 16;
    pagina.drawText(limpar(`Situação em ${dados.dataTexto}`), { x: MARGEM, y, size: 9.5, font: normal, color: CINZA });
    y -= 22;
  }

  function novaPagina() {
    pagina = pdf.addPage([LARGURA, ALTURA]);
    y = ALTURA - MARGEM;
    cabecalhoDaPagina();
  }

  function linhaDaTabela(tabela: Tabela, celulas: string[], fonte: PDFFont, fundo?: ReturnType<typeof rgb>) {
    const quebradas = celulas.map((c, i) => quebrar(c, fonte, CORPO, tabela.colunas[i].largura - 8));
    const altura = Math.max(...quebradas.map((l) => l.length)) * (CORPO + 2.5) + 7;
    if (y - altura < MARGEM) return false;
    let x = MARGEM;
    quebradas.forEach((linhas, i) => {
      const w = tabela.colunas[i].largura;
      pagina.drawRectangle({ x, y: y - altura, width: w, height: altura, borderColor: BORDA, borderWidth: 0.6, color: fundo });
      linhas.forEach((texto, j) =>
        pagina.drawText(texto, { x: x + 4, y: y - 10 - j * (CORPO + 2.5), size: CORPO, font: fonte, color: CINZA })
      );
      x += w;
    });
    y -= altura;
    return true;
  }

  function tabela(t: Tabela) {
    if (y < MARGEM + 80) novaPagina();
    pagina.drawText(limpar(`${t.titulo} (${t.linhas.length})`), { x: MARGEM, y, size: 11, font: negrito, color: AZUL });
    y -= 8;
    const cabecalho = () => linhaDaTabela(t, t.colunas.map((c) => c.rotulo.toUpperCase()), negrito, CINZA_CLARO);
    cabecalho();
    if (t.linhas.length === 0) {
      y -= 12;
      pagina.drawText(limpar(t.vazio), { x: MARGEM + 4, y, size: CORPO, font: normal, color: CINZA });
    }
    for (const linha of t.linhas) {
      if (!linhaDaTabela(t, linha, normal)) {
        novaPagina();
        cabecalho();
        linhaDaTabela(t, linha, normal);
      }
    }
    y -= 24;
  }

  cabecalhoDaPagina();
  if (!dados.soManutencoes)
  tabela({
    titulo: "Compras pendentes",
    colunas: [
      { rotulo: "Solicitada em", largura: 80 },
      { rotulo: "O que é a compra", largura: 430 },
      { rotulo: "Necessário para", largura: 90 },
      { rotulo: "Dias em aberto", largura: 80 },
      { rotulo: "Situação", largura: 90 },
    ],
    linhas: dados.compras,
    vazio: "Nenhuma compra pendente.",
  });
  if (!dados.soCompras)
  tabela({
    titulo: "Manutenções pendentes",
    colunas: [
      { rotulo: "Tipo", largura: 90 },
      { rotulo: "Incluída em", largura: 80 },
      { rotulo: "O que é a manutenção", largura: 520 },
      { rotulo: "Dias em aberto", largura: 80 },
    ],
    linhas: dados.manutencoes,
    vazio: "Nenhuma manutenção pendente.",
  });

  return Buffer.from(await pdf.save());
}
