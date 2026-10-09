import { exigirModulo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FormFechamento } from "./FormFechamento";

// Administrador > Fechamento de período: a data até a qual o financeiro fica travado (contas a pagar e a receber
// pelo vencimento, baixas e extrato pela data). Cadastros continuam livres. A trava é do banco: vale para qualquer
// tela. Histórico de quem fechou ou reabriu e quando.
export default async function FechamentoPeriodoPage() {
  await exigirModulo("adm");
  const supabase = await createClient();
  const { data } = await supabase.from("fin_fechamentos").select("id, data_fechamento, observacao, criado_em, autor:profiles(nome)").order("criado_em", { ascending: false }).limit(50);
  const historico = (data ?? []).map((f) => ({
    id: f.id as string,
    data: f.data_fechamento as string,
    observacao: f.observacao as string | null,
    em: f.criado_em as string,
    autor: (f.autor as unknown as { nome: string } | null)?.nome ?? "",
  }));
  const atual = historico[0]?.data ?? null;
  const br = (d: string) => d.split("-").reverse().join("/");

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Fechamento de período</h1>
        <p className="mt-1 text-sm text-slate-500">
          Até a data fechada, nada do financeiro pode ser incluído, alterado ou excluído: contas a pagar e a receber (pelo vencimento), baixas e
          lançamentos do extrato e da conciliação (pela data). Cadastros de fornecedores, categorias e contas continuam livres.
        </p>
      </div>
      <div className={`rounded-lg px-4 py-3 ${atual ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>
        {atual ? (
          <p className="text-sm">
            Financeiro fechado até <strong className="text-lg">{br(atual)}</strong>
            {historico[0]?.autor ? <span className="text-slate-300"> · por {historico[0].autor}</span> : null}
          </p>
        ) : (
          <p className="text-sm">Nenhum período fechado ainda.</p>
        )}
      </div>
      <FormFechamento atual={atual} />
      {historico.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Histórico</h2>
          <table className="w-full rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">Fechado até</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h, i) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium tabular-nums">
                    {br(h.data)}
                    {i > 0 && historico[i - 1].data < h.data && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">reaberto depois</span>}
                  </td>
                  <td className="px-3 py-2">{h.autor}</td>
                  <td className="px-3 py-2 text-slate-600">{new Date(h.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-3 py-2 text-slate-600">{h.observacao ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
