import ExcelJS from "exceljs";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { montarRelatorio, RELATORIOS, type Relatorio } from "../montar";

// Relatório financeiro em Excel (mesmos filtros da tela).
export async function GET(request: Request) {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return new Response("Sem acesso ao módulo Financeiro.", { status: 403 });
  const url = new URL(request.url);
  const rel = (url.searchParams.get("rel") ?? "") as Relatorio;
  if (!(rel in RELATORIOS)) return new Response("Relatório inválido.", { status: 400 });
  const de = url.searchParams.get("de") ?? "";
  const ate = url.searchParams.get("ate") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return new Response("Período inválido.", { status: 400 });
  const { supabase, academias, selecionada } = await contextoAcademias(url.searchParams.get("academia") ?? undefined);
  const tabela = await montarRelatorio(supabase, rel, { academia: selecionada, de, ate, academias });

  if (rel === "fluxo_pagamentos") return fluxoDePagamentos(tabela, selecionada ? (academias.find((a) => a.id === selecionada)?.nome ?? "") : "Todas", de, ate);

  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet(RELATORIOS[rel].slice(0, 31));
  aba.addRow([`${RELATORIOS[rel]} · ${selecionada ? academias.find((a) => a.id === selecionada)?.nome : "Todas as academias"} · ${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}`]).font = { bold: true, size: 12 };
  aba.addRow([]);
  const cab = aba.addRow(tabela.colunas.map((c) => c.rotulo));
  cab.font = { bold: true };
  cab.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }));
  const converter = (v: string | number | null, tipo: string) => (tipo === "data" && typeof v === "string" && v ? new Date(`${v}T12:00:00Z`) : v);
  for (const l of tabela.linhas) aba.addRow(l.map((v, j) => converter(v, tabela.colunas[j].tipo)));
  if (tabela.totais) aba.addRow(tabela.totais).font = { bold: true };
  tabela.colunas.forEach((c, j) => {
    const col = aba.getColumn(j + 1);
    col.width = c.tipo === "moeda" ? 16 : c.tipo === "data" ? 12 : 32;
    if (c.tipo === "moeda") col.numFmt = "#,##0.00;[Red]-#,##0.00";
    if (c.tipo === "data") col.numFmt = "dd/mm/yyyy";
  });
  if (tabela.nota) {
    aba.addRow([]);
    aba.addRow([tabela.nota]).font = { italic: true, color: { argb: "FF64748B" } };
  }
  const buffer = await livro.xlsx.writeBuffer();
  const nome = `${RELATORIOS[rel]} ${de} a ${ate}.xlsx`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "no-store",
    },
  });
}

// Fluxo de pagamentos no formato da planilha usada na conferência (aba "Contas por Período"): uma linha por título
// e o "Total" com a fórmula de soma embaixo (a conferência de pagamentos confere essa fórmula).
async function fluxoDePagamentos(tabela: Awaited<ReturnType<typeof montarRelatorio>>, academia: string, de: string, ate: string) {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet("Contas por Período");
  const titulo = aba.addRow([`Contas por Período Relatório ${academia}`]);
  titulo.font = { bold: true, size: 12 };
  aba.addRow([`Data de pagamento de ${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}`]).font = { italic: true, color: { argb: "FF64748B" } };
  const cab = aba.addRow(tabela.colunas.map((c) => c.rotulo));
  cab.font = { bold: true };
  cab.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }));
  const primeira = aba.rowCount + 1;
  for (const l of tabela.linhas) aba.addRow(l.map((v, j) => (tabela.colunas[j].tipo === "data" && typeof v === "string" && v ? new Date(`${v}T12:00:00Z`) : v)));
  const ultima = aba.rowCount;
  aba.addRow([]);
  const colValor = tabela.colunas.findIndex((c) => c.tipo === "moeda") + 1;
  const letra = String.fromCharCode(64 + colValor);
  const total = aba.addRow([]);
  total.getCell(colValor - 1).value = "Total";
  total.getCell(colValor).value = tabela.linhas.length ? { formula: `SUM(${letra}${primeira}:${letra}${ultima})`, result: Number(tabela.totais?.[colValor - 1] ?? 0) } : 0;
  total.font = { bold: true };
  tabela.colunas.forEach((c, j) => {
    const col = aba.getColumn(j + 1);
    col.width = c.tipo === "moeda" ? 16 : c.tipo === "data" ? 14 : j === 1 ? 42 : 22;
    if (c.tipo === "moeda") col.numFmt = "#,##0.00;[Red]-#,##0.00";
    if (c.tipo === "data") col.numFmt = "dd/mm/yyyy";
  });
  const buffer = await livro.xlsx.writeBuffer();
  const nome = `Fluxo de pagamentos ${academia} ${de} a ${ate}.xlsx`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "no-store",
    },
  });
}
