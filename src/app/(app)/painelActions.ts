"use server";

import { getPerfilAtual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Alunos de outras unidades, um por um (para o detalhe do painel): dias de acesso, passagens e o último dia.
// A regra de acesso do banco mostra só as academias que o usuário pode ver.
export async function alunosDeOutrasUnidades(unidade: string | null, inicio: string, fim: string, origem: string | null) {
  if (!(await getPerfilAtual())) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("visitantes_alunos", { p_academia: unidade, inicio, fim, p_origem: origem });
  return ((data ?? []) as { cliente_id: string; nome: string | null; unidade_origem: string; academia: string; dias: number; passagens: number; ultimo: string }[]).map((a) => ({
    ...a,
    dias: Number(a.dias),
    passagens: Number(a.passagens),
  }));
}
