import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { hoje } from "@/lib/planilha";
import { montarRelatorio, RELATORIOS, type Celula, type Relatorio, type Tabela } from "./montar";

// Financeiro > Relatórios: contas em aberto, pagamentos e recebimentos realizados e o fluxo de caixa por
// categoria (realizado e previsto). Cada relatório também sai em Excel.

const formatar = (v: Celula, tipo: Tabela["colunas"][number]["tipo"]) =>
  v === null || v === ""
    ? ""
    : tipo === "moeda" && typeof v === "number"
      ? Math.abs(v) < 0.005
        ? "–"
        : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : tipo === "data" && typeof v === "string"
        ? v.split("-").reverse().join("/")
        : String(v);

export default async function RelatoriosFinanceiroPage({ searchParams }: PageProps<"/financeiro/relatorios">) {
  await exigirModulo("financeiro");
  const params = await searchParams;
  const p = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const { supabase, academias, selecionada } = await contextoAcademias(p("academia"));
  const rel: Relatorio = (p("rel") as Relatorio) in RELATORIOS ? (p("rel") as Relatorio) : "fluxo_pagamentos";
  const mes = hoje().slice(0, 7);
  const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  // Fluxo de pagamentos: por padrão, de hoje aos próximos 7 dias (o lote da semana).
  const de = p("de") ?? (rel === "fluxo_pagamentos" ? hoje() : rel === "fluxo" ? `${mes.slice(0, 4)}-01-01` : `${mes}-01`);
  // Último dia do mês atual + n meses.
  const fimDoMes = (n: number) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) + n, 0)).toISOString().slice(0, 10);
  // Padrão: previsto = próximos 3 meses; fluxo realizado = ano até hoje; os demais = mês atual.
  const ate = p("ate") ?? (rel === "fluxo_pagamentos" ? somarDias(hoje(), 7) : rel === "previsto" ? fimDoMes(2) : rel === "fluxo" ? hoje() : fimDoMes(0));
  const tabela = await montarRelatorio(supabase, rel, { academia: selecionada, de, ate, academias });
  const usaDe = rel !== "pagar_aberto" && rel !== "receber_aberto";
  const q = (mudar: Record<string, string | null>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ rel, academia: selecionada, de: p("de") ?? null, ate: p("ate") ?? null, ...mudar })) if (v) s.set(k, v);
    return s.toString();
  };
  const ehGrupo = (l: Celula[]) => (rel === "fluxo" || rel === "previsto") && l[1] === "";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Relatórios financeiros</h1>
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(RELATORIOS) as [Relatorio, string][]).map(([k, r]) => (
          <Link key={k} href={`/financeiro/relatorios?${q({ rel: k, de: null, ate: null })}`} className={`rounded-full px-3 py-1 text-sm ${k === rel ? "bg-marca font-medium text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {r}
          </Link>
        ))}
      </div>
      {academias.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Academias">
          {[{ id: null as string | null, nome: "Todas" }, ...academias].map((a) => (
            <Link
              key={a.id ?? "todas"}
              href={`/financeiro/relatorios?${q({ academia: a.id })}`}
              className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${a.id === selecionada ? "border-slate-200 border-b-white bg-white font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            >
              {a.nome}
            </Link>
          ))}
        </nav>
      )}
      <form className="flex flex-wrap items-end gap-3" action="/financeiro/relatorios">
        <input type="hidden" name="rel" value={rel} />
        {selecionada && <input type="hidden" name="academia" value={selecionada} />}
        {usaDe && (
          <label className="text-xs text-slate-600">
            {rel === "fluxo_pagamentos" ? "Data de pagamento de" : "De"}
            <input type="date" name="de" defaultValue={de} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        )}
        <label className="text-xs text-slate-600">
          {usaDe ? "Até" : "Vencimento até"}
          <input type="date" name="ate" defaultValue={ate} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <button type="submit" className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro">
          Atualizar
        </button>
        <a href={`/financeiro/relatorios/excel?${q({ de, ate })}`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Baixar Excel
        </a>
      </form>
      {tabela.nota && <p className="text-xs text-slate-500">{tabela.nota}</p>}
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              {tabela.colunas.map((c) => (
                <th key={c.rotulo} className={`px-3 py-2 ${c.tipo === "moeda" ? "text-right" : "text-left"}`}>
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map((l, i) => (
              <tr key={i} className={`border-t border-slate-100 ${ehGrupo(l) ? "bg-slate-50 font-semibold" : ""}`}>
                {l.map((v, j) => (
                  <td key={j} className={`whitespace-nowrap px-3 py-1.5 ${tabela.colunas[j].tipo === "moeda" ? `text-right tabular-nums ${typeof v === "number" && v < -0.004 ? "text-red-700" : ""}` : ""}`}>
                    {formatar(v, tabela.colunas[j].tipo)}
                  </td>
                ))}
              </tr>
            ))}
            {tabela.linhas.length === 0 && (
              <tr>
                <td colSpan={tabela.colunas.length} className="px-3 py-8 text-center text-slate-500">
                  Nada neste período.
                </td>
              </tr>
            )}
          </tbody>
          {tabela.totais && tabela.linhas.length > 0 && (
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <tr>
                {tabela.totais.map((v, j) => (
                  <td key={j} className={`whitespace-nowrap px-3 py-2 ${tabela.colunas[j].tipo === "moeda" ? "text-right tabular-nums" : ""}`}>
                    {formatar(v, tabela.colunas[j].tipo)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
