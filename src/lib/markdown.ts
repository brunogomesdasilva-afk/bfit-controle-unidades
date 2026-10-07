// Leitura simples do markdown do relatório da conferência (títulos, parágrafos, listas, tabelas, citações e
// linhas), usada para mostrar o relatório na tela e para gerar o PDF com o mesmo conteúdo.

export type Bloco =
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; ordenada: boolean; itens: string[] }
  | { tipo: "tabela"; cabecalho: string[]; linhas: string[][] }
  | { tipo: "citacao"; texto: string }
  | { tipo: "linha" };

// Trechos de uma linha: negrito (**texto**) ou normal. Código (`x`) vira texto normal.
export type Trecho = { texto: string; negrito: boolean };
export function trechos(texto: string): Trecho[] {
  const partes: Trecho[] = [];
  const limpo = texto.replace(/`([^`]*)`/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  const re = /\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  for (let m = re.exec(limpo); m; m = re.exec(limpo)) {
    if (m.index > ultimo) partes.push({ texto: limpo.slice(ultimo, m.index), negrito: false });
    partes.push({ texto: m[1], negrito: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < limpo.length) partes.push({ texto: limpo.slice(ultimo), negrito: false });
  return partes.map((p) => ({ ...p, texto: p.texto.replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:])/g, "$1$2") }));
}
export const semMarcacao = (texto: string) => trechos(texto).map((t) => t.texto).join("");

const celulas = (linha: string) =>
  linha
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function lerMarkdown(md: string): Bloco[] {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    const t = l.trim();
    if (!t) {
      i++;
      continue;
    }
    const titulo = t.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      blocos.push({ tipo: "titulo", nivel: titulo[1].length, texto: titulo[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      blocos.push({ tipo: "linha" });
      i++;
      continue;
    }
    // Tabela: linha com | seguida da linha separadora |---|---|
    if (t.includes("|") && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linhas[i + 1])) {
      const cabecalho = celulas(t);
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && linhas[i].trim().includes("|")) {
        const c = celulas(linhas[i]);
        corpo.push(cabecalho.map((_, j) => c[j] ?? ""));
        i++;
      }
      blocos.push({ tipo: "tabela", cabecalho, linhas: corpo });
      continue;
    }
    if (t.startsWith(">")) {
      const texto: string[] = [];
      while (i < linhas.length && linhas[i].trim().startsWith(">")) {
        texto.push(linhas[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocos.push({ tipo: "citacao", texto: texto.join("\n") });
      continue;
    }
    const item = (s: string) => s.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/);
    if (item(l)) {
      const ordenada = Boolean(item(l)![1]);
      const itens: string[] = [];
      while (i < linhas.length && linhas[i].trim()) {
        const m = item(linhas[i]);
        if (m) itens.push(m[2]);
        else if (itens.length) itens[itens.length - 1] += ` ${linhas[i].trim()}`; // continuação do item
        i++;
      }
      blocos.push({ tipo: "lista", ordenada, itens });
      continue;
    }
    const paragrafo: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,6}\s|>|\s*(?:[-*+]|\d+[.)])\s)/.test(linhas[i].trim()) && !(linhas[i].includes("|") && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] ?? ""))) {
      paragrafo.push(linhas[i].trim());
      i++;
    }
    if (paragrafo.length) blocos.push({ tipo: "paragrafo", texto: paragrafo.join("\n") });
    else i++;
  }
  return blocos;
}
