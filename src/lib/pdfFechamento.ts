import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { limpar, quebrar } from "@/lib/pdfPendencias";

// PDF "Fechamento do mês" de uma academia (aberto na tela e anexado ao e-mail). A4 em pé, uma tabela
// por seção (aniversariantes do mês seguinte, dias sem diário, contagens não feitas...).

const AZUL = rgb(0.043, 0.306, 0.635); // azul Bluefit (#0b4ea2)
const CINZA = rgb(0.23, 0.25, 0.28);
const CINZA_CLARO = rgb(0.93, 0.94, 0.95);
const BORDA = rgb(0.8, 0.82, 0.85);
const LARGURA = 595;
const ALTURA = 842;
const MARGEM = 36;
const CORPO = 8.5;

export type SecaoPdf = { titulo: string; colunas: { rotulo: string; largura: number }[]; linhas: string[][]; vazio: string };

export async function gerarPdfFechamento(dados: { academia: string; mesTexto: string; secoes: SecaoPdf[] }) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(limpar(`Fechamento ${dados.mesTexto} - ${dados.academia}`));

  let pagina: PDFPage = pdf.addPage([LARGURA, ALTURA]);
  let y = ALTURA - MARGEM;

  function cabecalhoDaPagina() {
    pagina.drawText("BFIT · Controle de unidades", { x: MARGEM, y, size: 9, font: negrito, color: AZUL });
    y -= 20;
    pagina.drawText(limpar(`Fechamento do mês - ${dados.academia}`), { x: MARGEM, y, size: 15, font: negrito, color: CINZA });
    y -= 16;
    pagina.drawText(limpar(`Mês de ${dados.mesTexto}`), { x: MARGEM, y, size: 9.5, font: normal, color: CINZA });
    y -= 26;
  }
  function novaPagina() {
    pagina = pdf.addPage([LARGURA, ALTURA]);
    y = ALTURA - MARGEM;
    cabecalhoDaPagina();
  }

  function linha(secao: SecaoPdf, celulas: string[], fonte = normal, fundo?: ReturnType<typeof rgb>) {
    const quebradas = celulas.map((c, i) => quebrar(c, fonte, CORPO, secao.colunas[i].largura - 8));
    const altura = Math.max(...quebradas.map((l) => l.length)) * (CORPO + 2.5) + 7;
    if (y - altura < MARGEM) return false;
    let x = MARGEM;
    quebradas.forEach((linhas, i) => {
      const w = secao.colunas[i].largura;
      pagina.drawRectangle({ x, y: y - altura, width: w, height: altura, borderColor: BORDA, borderWidth: 0.6, color: fundo });
      linhas.forEach((texto, j) => pagina.drawText(texto, { x: x + 4, y: y - 10 - j * (CORPO + 2.5), size: CORPO, font: fonte, color: CINZA }));
      x += w;
    });
    y -= altura;
    return true;
  }

  cabecalhoDaPagina();
  for (const secao of dados.secoes) {
    if (y < MARGEM + 80) novaPagina();
    pagina.drawText(limpar(`${secao.titulo} (${secao.linhas.length})`), { x: MARGEM, y, size: 11, font: negrito, color: AZUL });
    y -= 8;
    const cabecalho = () => linha(secao, secao.colunas.map((c) => c.rotulo.toUpperCase()), negrito, CINZA_CLARO);
    cabecalho();
    if (secao.linhas.length === 0) {
      y -= 12;
      pagina.drawText(limpar(secao.vazio), { x: MARGEM + 4, y, size: CORPO, font: normal, color: CINZA });
    }
    for (const celulas of secao.linhas) {
      if (!linha(secao, celulas)) {
        novaPagina();
        cabecalho();
        linha(secao, celulas);
      }
    }
    y -= 24;
  }

  return Buffer.from(await pdf.save());
}
