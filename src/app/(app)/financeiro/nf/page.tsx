import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { listasFinanceiro } from "../listas";
import { ImportarNf } from "./ImportarNf";

// Financeiro > Importar NF: lança uma nota fiscal no contas a pagar a partir do PDF.
export default async function ImportarNfPage() {
  await exigirModulo("financeiro");
  const { supabase, academias } = await contextoAcademias(undefined);
  const [listas, { data: feriados }] = await Promise.all([listasFinanceiro(supabase), supabase.from("feriados").select("data, academia_id")]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Importar NF</h1>
        <p className="text-sm text-slate-500">
          Envie o PDF da nota: o sistema lê fornecedor, academia (pelo CNPJ do tomador), número, valores, retenções e vencimentos. Fornecedor novo é
          cadastrado na hora, com a categoria que você escolher, que passa a vir preenchida nas próximas notas dele.
        </p>
      </div>
      <ImportarNf
        academias={academias.map((a) => ({ valor: a.id, rotulo: a.nome }))}
        categorias={listas.opcoesCategoria("despesa")}
        contas={listas.contas.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome, academia_id: c.academia_id }))}
        feriados={(feriados ?? []) as { data: string; academia_id: string | null }[]}
      />
    </div>
  );
}
