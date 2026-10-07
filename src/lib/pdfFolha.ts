import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { TURNOS, type AulasDoMes, type Turno } from "@/lib/aulasDoMes";
import { lerMarkdown, semMarcacao, trechos } from "@/lib/markdown";
import { limpar, quebrar } from "@/lib/pdfPendencias";

// PDFs da conferência da folha (menu RH): o relatório da conferência (o markdown que o Claude escreveu) e a
// planilha de coletivas e lutas do mês (para conferir as notas fiscais dos PJ quando chegarem).

const AZUL = rgb(0.043, 0.306, 0.635);
const CINZA = rgb(0.23, 0.25, 0.28);
const CINZA_CLARO = rgb(0.93, 0.94, 0.95);
const BORDA = rgb(0.8, 0.82, 0.85);
const MARGEM = 32;

// A fonte padrão do PDF só tem os caracteres latinos: troca símbolos comuns do relatório por texto.
const SIMBOLOS: [RegExp, string][] = [
  [/✅/g, "[LIBERAR]"],
  [/⛔/g, "[SEGURAR]"],
  [/🔧/g, "[CORRIGIR]"],
  [/⚠️?/g, "[!]"],
  [/[✓✔]/g, "OK"],
  [/[✗✘❌]/g, "X"],
  [/→/g, "->"],
  [/←/g, "<-"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≈/g, "~"],
  [/[•·]/g, "·"],
  [/️/g, ""],
];
const texto = (s: string) => limpar(SIMBOLOS.reduce((t, [re, por]) => t.replace(re, por), s));

type Documento = {
  pdf: PDFDocument;
  normal: PDFFont;
  negrito: PDFFont;
  pagina: PDFPage;
  y: number;
  largura: number;
  altura: number;
  titulo: string;
  subtitulo: string;
};

async function novoDocumento(titulo: string, subtitulo: string, deitado: boolean): Promise<Documento> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(texto(titulo));
  const [largura, altura] = deitado ? [842, 595] : [595, 842];
  const doc = {
    pdf,
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
    pagina: null as unknown as PDFPage,
    y: 0,
    largura,
    altura,
    titulo,
    subtitulo,
  };
  novaPagina(doc);
  return doc;
}

function novaPagina(d: Documento) {
  d.pagina = d.pdf.addPage([d.largura, d.altura]);
  d.y = d.altura - MARGEM;
  d.pagina.drawText("BFIT · Controle de unidades", { x: MARGEM, y: d.y, size: 8.5, font: d.negrito, color: AZUL });
  d.y -= 18;
  d.pagina.drawText(texto(d.titulo), { x: MARGEM, y: d.y, size: 14, font: d.negrito, color: CINZA });
  d.y -= 14;
  d.pagina.drawText(texto(d.subtitulo), { x: MARGEM, y: d.y, size: 9, font: d.normal, color: CINZA });
  d.y -= 20;
}

const garantir = (d: Documento, altura: number) => {
  if (d.y - altura < MARGEM) novaPagina(d);
};

// Texto com negrito no meio, quebrado na largura.
function escreverRico(d: Documento, md: string, x: number, largura: number, tamanho: number, cor = CINZA, tudoNegrito = false) {
  const palavras: { p: string; negrito: boolean }[] = [];
  // Separa as palavras antes de limpar o texto (a limpeza troca a quebra de linha por "?").
  for (const t of trechos(md))
    for (const p of t.texto.split(/(\s+)/)) if (p) palavras.push({ p: /\n/.test(p) ? "\n" : /^\s+$/.test(p) ? " " : texto(p), negrito: tudoNegrito || t.negrito });
  const linhas: { p: string; negrito: boolean }[][] = [[]];
  let usado = 0;
  for (const w of palavras) {
    if (w.p.includes("\n")) {
      linhas.push([]);
      usado = 0;
      continue;
    }
    const fonte = w.negrito ? d.negrito : d.normal;
    const larg = fonte.widthOfTextAtSize(w.p, tamanho);
    if (/^\s+$/.test(w.p) && usado === 0) continue;
    if (usado + larg > largura && usado > 0) {
      linhas.push([]);
      usado = 0;
      if (/^\s+$/.test(w.p)) continue;
    }
    linhas[linhas.length - 1].push(w);
    usado += larg;
  }
  const entre = tamanho + 3;
  for (const linha of linhas) {
    garantir(d, entre);
    let cx = x;
    for (const w of linha) {
      const fonte = w.negrito ? d.negrito : d.normal;
      d.pagina.drawText(w.p, { x: cx, y: d.y - tamanho, size: tamanho, font: fonte, color: cor });
      cx += fonte.widthOfTextAtSize(w.p, tamanho);
    }
    d.y -= entre;
  }
}

type Coluna = { rotulo: string; largura: number; direita?: boolean };

// Tabela com cabeçalho repetido a cada página. destaque: linha em negrito com fundo cinza (ex.: totais).
function tabela(d: Documento, colunas: Coluna[], linhas: string[][], opcoes: { destaques?: boolean[]; tamanho?: number } = {}) {
  const tam = opcoes.tamanho ?? 8;
  const desenhar = (celulas: string[], fonte: PDFFont, fundo?: ReturnType<typeof rgb>) => {
    const quebradas = celulas.map((c, i) => quebrar(texto(c), fonte, tam, colunas[i].largura - 6));
    const altura = Math.max(...quebradas.map((l) => l.length)) * (tam + 2.5) + 6;
    if (d.y - altura < MARGEM) return false;
    let x = MARGEM;
    quebradas.forEach((ls, i) => {
      const w = colunas[i].largura;
      d.pagina.drawRectangle({ x, y: d.y - altura, width: w, height: altura, borderColor: BORDA, borderWidth: 0.5, color: fundo });
      ls.forEach((l, j) => {
        const lx = colunas[i].direita ? x + w - 3 - fonte.widthOfTextAtSize(l, tam) : x + 3;
        d.pagina.drawText(l, { x: lx, y: d.y - 9 - j * (tam + 2.5), size: tam, font: fonte, color: CINZA });
      });
      x += w;
    });
    d.y -= altura;
    return true;
  };
  const cabecalho = () => desenhar(colunas.map((c) => c.rotulo), d.negrito, CINZA_CLARO);
  garantir(d, 40);
  cabecalho();
  linhas.forEach((celulas, i) => {
    const destaque = opcoes.destaques?.[i];
    const args = [celulas, destaque ? d.negrito : d.normal, destaque ? CINZA_CLARO : undefined] as const;
    if (!desenhar(...args)) {
      novaPagina(d);
      cabecalho();
      desenhar(...args);
    }
  });
  d.y -= 10;
}

function secao(d: Documento, titulo: string, tamanho = 11) {
  garantir(d, 50);
  d.y -= 4;
  d.pagina.drawText(texto(titulo), { x: MARGEM, y: d.y - tamanho, size: tamanho, font: d.negrito, color: AZUL });
  d.y -= tamanho + 8;
}

// ---------------------------------------------------------------- Relatório da conferência (markdown)

export async function gerarPdfRelatorio(dados: { academia: string; mesTexto: string; markdown: string; rodape: string }) {
  const d = await novoDocumento(`Conferência da folha - ${dados.academia}`, `Competência ${dados.mesTexto} · ${dados.rodape}`, false);
  const util = d.largura - 2 * MARGEM;
  for (const b of lerMarkdown(dados.markdown)) {
    if (b.tipo === "titulo") {
      const tam = b.nivel === 1 ? 13 : b.nivel === 2 ? 11.5 : 10;
      garantir(d, 40);
      d.y -= 6;
      escreverRico(d, b.texto, MARGEM, util, tam, AZUL, true);
      d.y -= 2;
    } else if (b.tipo === "paragrafo") {
      escreverRico(d, b.texto, MARGEM, util, 8.5);
      d.y -= 5;
    } else if (b.tipo === "citacao") {
      const antes = d.y;
      escreverRico(d, b.texto, MARGEM + 10, util - 10, 8.5);
      if (d.y < antes) d.pagina.drawRectangle({ x: MARGEM, y: d.y + 2, width: 2.5, height: Math.min(antes - d.y, d.altura), color: BORDA });
      d.y -= 5;
    } else if (b.tipo === "lista") {
      b.itens.forEach((item, i) => {
        const marcador = b.ordenada ? `${i + 1}.` : "-";
        garantir(d, 12);
        d.pagina.drawText(marcador, { x: MARGEM + 4, y: d.y - 8.5, size: 8.5, font: d.normal, color: CINZA });
        escreverRico(d, item, MARGEM + 18, util - 18, 8.5);
      });
      d.y -= 5;
    } else if (b.tipo === "linha") {
      garantir(d, 12);
      d.pagina.drawLine({ start: { x: MARGEM, y: d.y - 4 }, end: { x: d.largura - MARGEM, y: d.y - 4 }, thickness: 0.6, color: BORDA });
      d.y -= 12;
    } else if (b.tipo === "tabela") {
      // Cada coluna tem pelo menos a largura da sua palavra mais longa (nada é cortado); o espaço que sobra
      // é dividido conforme o tamanho do texto de cada coluna.
      const celulasDa = (j: number) => [b.cabecalho[j], ...b.linhas.map((l) => l[j] ?? "")].map((c) => texto(semMarcacao(c)));
      const minimos = b.cabecalho.map((_, j) =>
        Math.max(28, ...celulasDa(j).flatMap((c) => c.split(/\s+/)).map((p) => d.negrito.widthOfTextAtSize(p, 7.5) + 8))
      );
      const pesos = b.cabecalho.map((_, j) => Math.min(60, Math.max(4, ...celulasDa(j).map((c) => c.length))));
      const somaMin = minimos.reduce((a, p) => a + p, 0);
      const somaPesos = pesos.reduce((a, p) => a + p, 0);
      const sobra = Math.max(0, util - somaMin);
      const escala = somaMin > util ? util / somaMin : 1;
      const colunas = b.cabecalho.map((c, j) => ({ rotulo: semMarcacao(c), largura: minimos[j] * escala + (sobra * pesos[j]) / somaPesos }));
      tabela(d, colunas, b.linhas.map((l) => l.map(semMarcacao)), { tamanho: 7.5 });
    }
  }
  return Buffer.from(await d.pdf.save());
}

// ---------------------------------------------------------------- Planilha de coletivas e lutas

const horas = (h: number) => (h ? h.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "");
const reais = (v: number | null) => (v === null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export async function gerarPdfPlanilhaColetivas(dados: { academia: string; mesTexto: string; aulas: AulasDoMes }) {
  const { aulas } = dados;
  const feriados = aulas.feriados.length ? aulas.feriados.map((f) => `${dia(f.data)} ${f.nome}`).join(", ") : "nenhum";
  const d = await novoDocumento(
    `${dados.academia} · ${dados.mesTexto}`,
    `Aulas pela grade de ${dia(aulas.periodo.inicio)} a ${dia(aulas.periodo.fim)} · feriados sem aula: ${feriados}`,
    true
  );
  if (!aulas.quadros.length) {
    escreverRico(d, "Esta academia ainda não tem grade de aulas nem contagens no mês.", MARGEM, 600, 10);
    return Buffer.from(await d.pdf.save());
  }

  for (const q of aulas.quadros) {
    secao(d, q.nome, 13);

    // Quadro por dia da semana: uma linha por professor de cada turno.
    const turnos = Object.keys(TURNOS) as Turno[];
    const colunas: Coluna[] = [
      { rotulo: "Dia da semana", largura: 78 },
      { rotulo: "Qtd. no mês", largura: 48, direita: true },
      ...turnos.flatMap((t) => [
        { rotulo: `${TURNOS[t]} (h/dia)`, largura: 52, direita: true },
        { rotulo: "Professor", largura: 96 },
        { rotulo: "Horas no mês", largura: 52, direita: true },
      ]),
      { rotulo: "Total de horas", largura: 52, direita: true },
    ];
    const linhas: string[][] = [];
    const destaques: boolean[] = [];
    for (const l of q.dias) {
      const n = Math.max(1, ...turnos.map((t) => l.turnos[t].length));
      for (let i = 0; i < n; i++) {
        linhas.push([
          i === 0 ? l.nome : "",
          i === 0 ? String(l.quantidade) : "",
          ...turnos.flatMap((t) => {
            const a = l.turnos[t][i];
            return a ? [horas(a.horasPorDia), a.professor, horas(a.horasNoMes)] : ["", "", ""];
          }),
          i === 0 ? horas(l.total) : "",
        ]);
        destaques.push(false);
      }
    }
    const totalGeral = turnos.reduce((t, x) => t + q.totaisTurno[x], 0);
    linhas.push(["Total de horas", "", ...turnos.flatMap((t) => ["", "", horas(q.totaisTurno[t])]), horas(totalGeral)]);
    destaques.push(true);
    tabela(d, colunas, linhas, { destaques });

    // Resumo por professor: PJ é pago por fora (valor da hora x horas a pagar); CLT recebe na folha.
    const resumo: Coluna[] = [
      { rotulo: "Professor", largura: 130 },
      { rotulo: "Vínculo", largura: 70 },
      { rotulo: "Horas previstas", largura: 62, direita: true },
      { rotulo: "Horas que faltou", largura: 62, direita: true },
      { rotulo: "Horas de cobertura", largura: 66, direita: true },
      { rotulo: "Aulas extras (h)", largura: 62, direita: true },
      { rotulo: "Horas a pagar", largura: 62, direita: true },
      { rotulo: "Valor hora", largura: 66, direita: true },
      { rotulo: "Total", largura: 80, direita: true },
      { rotulo: "NF conferida", largura: 118 },
    ];
    const vinculo = (p: (typeof q.professores)[number]) => (!p.cadastro ? "sem cadastro" : p.cadastro.pj ? "PJ" : "CLT");
    const soma = (c: "previstas" | "faltou" | "cobriu" | "extras" | "aPagar") => q.professores.reduce((t, p) => t + p[c], 0);
    const totalPj = q.professores.reduce((t, p) => t + (p.total ?? 0), 0);
    const linhasResumo = q.professores.map((p) => [
      p.professor,
      vinculo(p),
      horas(p.previstas),
      horas(p.faltou),
      horas(p.cobriu),
      horas(p.extras),
      horas(p.aPagar),
      p.cadastro?.pj ? reais(p.cadastro.valorHora) || "sem valor" : "",
      p.cadastro?.pj ? (p.total === null ? "sem valor hora" : reais(p.total)) : p.cadastro ? "na folha" : "",
      "",
    ]);
    linhasResumo.push(["Total", "", horas(soma("previstas")), horas(soma("faltou")), horas(soma("cobriu")), horas(soma("extras")), horas(soma("aPagar")), "", reais(totalPj), ""]);
    tabela(d, resumo, linhasResumo, { destaques: linhasResumo.map((_, i) => i === linhasResumo.length - 1) });
    escreverRico(d, `**Total a pagar por fora da folha (PJ): ${reais(totalPj)}**. Professores CLT aparecem só para conferir as horas: recebem na folha.`, MARGEM, d.largura - 2 * MARGEM, 8.5);
    d.y -= 6;

    secao(d, `${q.nome} · coberturas (professor substituto nas contagens)`, 10);
    tabela(
      d,
      [
        { rotulo: "Dia", largura: 50 },
        { rotulo: "Horário", largura: 50 },
        { rotulo: "Modalidade", largura: 140 },
        { rotulo: "Professor que faltou", largura: 150 },
        { rotulo: "Quem deu a aula", largura: 150 },
        { rotulo: "Horas", largura: 50, direita: true },
        { rotulo: "Já foi pago?", largura: 188 },
      ],
      q.coberturas.length ? q.coberturas.map((c) => [dia(c.data), c.horario, c.modalidade, c.titular, c.quemDeu, horas(c.horas), ""]) : [["", "", "Nenhuma cobertura no mês.", "", "", "", ""]]
    );

    if (q.semContagem.length) {
      secao(d, `${q.nome} · aulas da grade sem contagem (não lançadas ou não dadas)`, 10);
      tabela(
        d,
        [
          { rotulo: "Dia", largura: 50 },
          { rotulo: "Horário", largura: 50 },
          { rotulo: "Modalidade", largura: 160 },
          { rotulo: "Professor da grade", largura: 160 },
          { rotulo: "Horas", largura: 50, direita: true },
        ],
        q.semContagem.map((c) => [dia(c.data), c.horario, c.modalidade, c.titular, horas(c.horas)])
      );
    }
    d.y -= 8;
  }
  escreverRico(
    d,
    "Horas previstas = aulas da grade em cada dia do período, sem feriados. Horas que faltou = aulas dele dadas por outro professor ou sem contagem. Horas a pagar = aulas da grade dadas por ele + coberturas + aulas extras.",
    MARGEM,
    d.largura - 2 * MARGEM,
    7.5
  );
  return Buffer.from(await d.pdf.save());
}
