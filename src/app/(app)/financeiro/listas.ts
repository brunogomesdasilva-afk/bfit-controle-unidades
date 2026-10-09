import type { createClient } from "@/lib/supabase/server";
import type { Categoria, Conta, Pessoa } from "@/lib/financeiro";

// Listas usadas nas telas do Financeiro (escolha de categoria, cliente/fornecedor e conta).
type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function todasPessoas(supabase: Supabase) {
  const pessoas: Pessoa[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await supabase.from("fin_pessoas").select("*").order("razao_social").range(de, de + 999);
    pessoas.push(...((data ?? []) as Pessoa[]));
    if (!data || data.length < 1000) break;
  }
  return pessoas;
}

export async function listasFinanceiro(supabase: Supabase) {
  const [{ data: categorias }, { data: contas }, pessoas] = await Promise.all([
    supabase.from("fin_categorias").select("*, fin_grupos(nome)").order("nome"),
    supabase.from("fin_contas").select("*").order("nome"),
    todasPessoas(supabase),
  ]);
  const cats = ((categorias ?? []) as (Categoria & { fin_grupos: { nome: string } | null })[])
    .map((c) => ({ ...c, grupo: c.fin_grupos?.nome ?? "" }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome));
  return {
    categorias: cats,
    contas: ((contas ?? []) as Conta[]).map((c) => ({ ...c, saldo_inicial: Number(c.saldo_inicial) })),
    pessoas,
    opcoesCategoria: (tipo?: "receita" | "despesa") =>
      cats
        .filter((c) => c.ativo && (!tipo || c.tipo === tipo || c.tipo === "transferencia"))
        .map((c) => ({ valor: c.id, rotulo: c.nome, grupo: c.grupo })),
  };
}
