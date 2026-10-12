import { exigirModulo } from "@/lib/auth";
import type { Grupo } from "@/lib/financeiro";
import { createClient } from "@/lib/supabase/server";
import { ArvoreCategorias, type CategoriaArvore } from "./ArvoreCategorias";

// Financeiro > Cadastros > Categorias: o plano de contas em árvore (grupo → categorias), separado em receber, pagar
// e transferências. O tipo da categoria (receita, despesa, transferência) é o do grupo.

export default async function CategoriasPage() {
  await exigirModulo("financeiro");
  const supabase = await createClient();
  const [{ data: gruposData }, { data: categoriasData }, { data: titulos }, { data: movimentos }] = await Promise.all([
    supabase.from("fin_grupos").select("*").order("nome"),
    supabase.from("fin_categorias").select("id, nome, grupo_id, ativo"),
    // Quantos lançamentos usam cada categoria (ajuda a decidir o que inativar).
    supabase.from("fin_titulos").select("categoria_id").not("categoria_id", "is", null),
    supabase.from("fin_movimentos").select("categoria_id").not("categoria_id", "is", null),
  ]);
  const usos = new Map<string, number>();
  for (const r of [...(titulos ?? []), ...(movimentos ?? [])] as { categoria_id: string }[]) usos.set(r.categoria_id, (usos.get(r.categoria_id) ?? 0) + 1);
  const categorias: CategoriaArvore[] = ((categoriasData ?? []) as Omit<CategoriaArvore, "usos">[]).map((c) => ({ ...c, usos: usos.get(c.id) ?? 0 }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Grupos e categorias</h1>
        <p className="text-sm text-slate-500">O plano de contas do fluxo de caixa: cada grupo com as suas categorias.</p>
      </div>
      <ArvoreCategorias grupos={(gruposData ?? []) as Grupo[]} categorias={categorias} />
    </div>
  );
}
