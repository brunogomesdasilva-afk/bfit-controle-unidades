import { createClient } from "@/lib/supabase/server";

// Totais por academia num período, calculados no banco (função relatorio_periodo).
export type TotaisAcademia = {
  academia_id: string;
  academia: string;
  dias_lancados: number;
  ativos_pagantes: number | null;
  visitas: number;
  vendas: number;
  inadimplentes: number | null;
  faturamento: number;
  cancelamentos_solicitados: number;
  cancelamentos_efetivados: number;
  nps: number | null;
  vendas_site: number;
  nao_convertidas: number;
  passagens: number;
  gympass: number;
  gympass_valor: number;
  contagem_sala: number;
  alunos_coletivas: number;
  alunos_lutas: number;
};

export async function totaisPorAcademia(inicio: string, fim: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("relatorio_periodo", { inicio, fim });
  // Números chegam do banco como texto em alguns tipos (bigint/numeric): converte tudo para número.
  const linhas = ((data ?? []) as Record<string, unknown>[]).map((l) => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(l))
      r[k] = k === "academia" || k === "academia_id" || v === null ? v : Number(v);
    return r as TotaisAcademia;
  });
  return { linhas, erro: error?.message ?? null };
}

// Soma de um campo em todas as academias (linha de total).
export function soma(linhas: TotaisAcademia[], campo: keyof TotaisAcademia) {
  return linhas.reduce((t, l) => t + (Number(l[campo]) || 0), 0);
}

export const divisao = (a: number, b: number | null) => (b ? a / b : null);
