import { exigirAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ImportarExcel } from "../frequencia/ImportarExcel";
import { importarClientes } from "./actions";

export const maxDuration = 300;

// Cadastro de clientes (só administrador): importação do Excel de clientes da rede. Cada importação
// substitui os clientes das unidades que estão no arquivo. Os números alimentam o Painel (perfil dos clientes).
export default async function ClientesPage() {
  await exigirAdmin();
  const supabase = await createClient();
  const { data: academias } = await supabase.from("academias").select("id, nome").order("nome");
  const resumo = await Promise.all(
    (academias ?? []).map(async (a) => {
      const [total, ativos, ultima] = await Promise.all([
        supabase.from("clientes").select("cliente_id", { count: "exact", head: true }).eq("academia_id", a.id),
        supabase.from("clientes").select("cliente_id", { count: "exact", head: true }).eq("academia_id", a.id).ilike("status", "ativo"),
        supabase.from("clientes").select("importado_em").eq("academia_id", a.id).limit(1).maybeSingle(),
      ]);
      return { nome: a.nome as string, total: total.count ?? 0, ativos: ativos.count ?? 0, importadoEm: ultima.data?.importado_em as string | undefined };
    })
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Clientes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Importe o Excel de clientes (uma aba por unidade, com o nome da academia na aba). A cada importação, os clientes
          das unidades do arquivo são substituídos pelos da nova planilha. O CPF não é guardado.
        </p>
      </div>
      <ImportarExcel importar={importarClientes} rotulo="Importar clientes" />
      <div className="overflow-auto rounded-md border border-slate-300 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Unidade</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Clientes</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Ativos</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Última importação</th>
            </tr>
          </thead>
          <tbody>
            {resumo.map((r) => (
              <tr key={r.nome}>
                <td className="border border-slate-300 px-2 py-1.5">{r.nome}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{r.total.toLocaleString("pt-BR")}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{r.ativos.toLocaleString("pt-BR")}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right">
                  {r.importadoEm ? new Date(r.importadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
