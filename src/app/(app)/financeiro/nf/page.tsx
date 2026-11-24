import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { listasFinanceiro } from "../listas";
import { ImportarNf } from "./ImportarNf";
import { PastaNotas } from "./PastaNotas";

// Financeiro > Importar NF: lança uma nota fiscal no contas a pagar a partir do PDF, ou (administrador) todas as
// notas de uma pasta do computador.
export default async function ImportarNfPage() {
  await exigirModulo("financeiro");
  const { supabase, academias, admin } = await contextoAcademias(undefined);
  const [listas, { data: feriados }, { data: config }] = await Promise.all([
    listasFinanceiro(supabase),
    supabase.from("feriados").select("data, academia_id"),
    admin ? supabase.from("nf_drive_config").select("pasta_notas, pasta_contabilidade").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const categorias = listas.opcoesCategoria("despesa");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Importar NF</h1>
        <p className="text-sm text-slate-500">
          Envie o PDF da nota: o sistema lê fornecedor, academia (pelo CNPJ do tomador), número, valores, retenções e vencimentos. Fornecedor novo é
          cadastrado antes da nota (você escolhe só a categoria padrão dele, que passa a vir preenchida nas próximas notas).
        </p>
      </div>
      {admin && (
        <PastaNotas
          categorias={categorias}
          caminhos={{ notas: (config?.pasta_notas as string | null) ?? null, contabilidade: (config?.pasta_contabilidade as string | null) ?? null }}
        />
      )}
      <ImportarNf
        academias={academias.map((a) => ({ valor: a.id, rotulo: a.nome }))}
        categorias={categorias}
        contas={listas.contas.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome, academia_id: c.academia_id }))}
        feriados={(feriados ?? []) as { data: string; academia_id: string | null }[]}
      />
    </div>
  );
}
