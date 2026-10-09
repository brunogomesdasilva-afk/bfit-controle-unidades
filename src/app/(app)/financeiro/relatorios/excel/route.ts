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
