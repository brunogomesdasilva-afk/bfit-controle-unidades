import Link from "next/link";
import { contextoAcademias } from "@/lib/contexto";
import type { VisitantesPorOrigem } from "@/lib/painelDados";
import { hoje } from "@/lib/planilha";
import { OrigensVisitantes } from "../../OrigensVisitantes";
import { SemAcademias } from "../../SemAcademias";

// Relatórios > Alunos de outras unidades: no período escolhido, por unidade de origem, as passagens, os alunos,
// os dias de acesso (um aluno que veio 3 dias conta 3), a média de dias por aluno e a média de acessos por dia.
// Clicar numa origem abre aluno por aluno.

const n = (v: number, casas = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000) + 1;

export default async function VisitantesPage({ searchParams }: PageProps<"/relatorios/visitantes">) {
  const params = await searchParams;
  const p = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const { supabase, academias, selecionada, admin } = await contextoAcademias(p("academia"));
  if (academias.length === 0) return <SemAcademias admin={admin} />;
  const de = p("de") ?? `${hoje().slice(0, 7)}-01`;
  const ate = p("ate") ?? hoje();
  const [{ data: total }, { data: origens }] = await Promise.all([
    supabase.rpc("visitantes_outras_unidades_total", { p_academia: selecionada, inicio: de, fim: ate }),
    supabase.rpc("visitantes_outras_unidades", { p_academia: selecionada, inicio: de, fim: ate }),
  ]);
  const t = (total as { passagens: number; alunos: number; dias: number }[] | null)?.[0];
  const passagens = Number(t?.passagens ?? 0);
  const alunos = Number(t?.alunos ?? 0);
  const dias = Number(t?.dias ?? 0);
  const diasPeriodo = Math.max(1, diasEntre(de, ate));
  const linhas = ((origens ?? []) as VisitantesPorOrigem[]).map((o) => ({ ...o, passagens: Number(o.passagens), alunos: Number(o.alunos), dias: Number(o.dias) }));
  const link = (academia: string | null) => {
    const q = new URLSearchParams({ de, ate });
    if (academia) q.set("academia", academia);
    return `/relatorios/visitantes?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">BFIT · Relatórios</p>
        <h1 className="text-lg font-semibold text-slate-900">Alunos de outras unidades</h1>
        <p className="text-sm text-slate-500">Quem passou na catraca vindo de outra unidade da rede, por unidade de origem. Clique numa origem para ver aluno por aluno.</p>
      </div>
      {academias.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Academias">
          {[{ id: null as string | null, nome: "Todas" }, ...academias].map((a) => (
            <Link
              key={a.id ?? "todas"}
              href={link(a.id)}
              className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${a.id === selecionada ? "border-slate-200 border-b-white bg-white font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            >
              {a.nome}
            </Link>
          ))}
        </nav>
      )}
      <form className="flex flex-wrap items-end gap-3" action="/relatorios/visitantes">
        {selecionada && <input type="hidden" name="academia" value={selecionada} />}
        <label className="text-xs text-slate-600">
          De
          <input type="date" name="de" defaultValue={de} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-600">
          Até
          <input type="date" name="ate" defaultValue={ate} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <button type="submit" className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro">
          Atualizar
        </button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Alunos (sem repetir)", n(alunos)],
          ["Passagens", n(passagens)],
          ["Dias no período", n(diasPeriodo)],
          ["Média de acessos por dia", n(passagens / diasPeriodo, 1)],
          ["Dias de acesso", n(dias)],
          ["Média de dias por aluno", alunos ? n(dias / alunos, 1) : "—"],
        ].map(([r, v]) => (
          <div key={r} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">{r}</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <OrigensVisitantes titulo="Por unidade de origem" linhas={linhas} unidade={selecionada} inicio={de} fim={ate} mostrarAcademia={!selecionada} />
      </div>
    </div>
  );
}
