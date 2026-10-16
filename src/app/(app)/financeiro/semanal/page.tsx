import { exigirModulo } from "@/lib/auth";
import { nomeDoCanal } from "@/lib/notificar";
import { ontem } from "@/lib/planilha";
import { htmlRelatorioSemanal, montarRelatorioSemanal } from "@/lib/relatorioSemanal";
import { createClient } from "@/lib/supabase/server";
import { BotaoEnviar } from "./BotaoEnviar";

// Financeiro > Conferências > Fechamento semanal: o mesmo relatório que chega por e-mail toda quinta às 8h
// (as 4 unidades, "Hoje" × 7 dias antes). Aqui dá para escolher o dia e enviar na hora.
export default async function FechamentoSemanalPage({ searchParams }: PageProps<"/financeiro/semanal">) {
  await exigirModulo("financeiro");
  const { dia } = await searchParams;
  const referencia = typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : ontem();
  const relatorio = await montarRelatorioSemanal(await createClient(), referencia);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Fechamento semanal</h1>
        <p className="text-sm text-slate-500">
          O relatório das 4 unidades que chega por {nomeDoCanal()} toda quinta-feira às 8h. Escolha o dia de referência (&quot;Hoje&quot;) para ver ou enviar agora.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <form className="flex items-end gap-2">
          <label className="text-xs text-slate-600">
            Dia de referência
            <input type="date" name="dia" defaultValue={referencia} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Ver
          </button>
        </form>
        <BotaoEnviar referencia={referencia} canal={nomeDoCanal()} />
      </div>
      {/* HTML montado pelo próprio sistema (o mesmo do e-mail). */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4" dangerouslySetInnerHTML={{ __html: htmlRelatorioSemanal(relatorio) }} />
    </div>
  );
}
