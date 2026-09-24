import { TIPOS_MANUTENCAO, type Compra, type Manutencao } from "@/lib/database.types";
import { hoje } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const diasEmAberto = (desde: string, ate = hoje()) => Math.round((Date.parse(ate) - Date.parse(desde)) / 86400000);
export const atrasada = (c: Compra, dataHoje = hoje()) => Boolean(c.necessario_ate && c.necessario_ate < dataHoje);
const dia = (d: string) => d.slice(0, 10).split("-").reverse().join("/");

// Compras e manutenções em aberto (da mais antiga para a mais nova), de uma academia ou de todas.
export async function carregarPendencias(supabase: Supabase, academiaId: string | null) {
  let compras = supabase.from("compras").select("*").is("data_efetivacao", null).order("data_solicitacao");
  let manutencoes = supabase.from("manutencoes").select("*").is("data_finalizacao", null).order("data_inclusao");
  if (academiaId) {
    compras = compras.eq("academia_id", academiaId);
    manutencoes = manutencoes.eq("academia_id", academiaId);
  }
  const [c, m] = await Promise.all([compras, manutencoes]);
  return { compras: (c.data ?? []) as Compra[], manutencoes: (m.data ?? []) as Manutencao[] };
}

// Linhas das tabelas do PDF, na mesma ordem das colunas do relatório.
export function linhasDoPdf(compras: Compra[], manutencoes: Manutencao[]) {
  const dataHoje = hoje();
  return {
    compras: compras.map((c) => [
      dia(c.data_solicitacao),
      c.descricao,
      c.necessario_ate ? dia(c.necessario_ate) : "-",
      String(diasEmAberto(c.data_solicitacao, dataHoje)),
      atrasada(c, dataHoje) ? "ATRASADA" : "No prazo",
    ]),
    manutencoes: manutencoes.map((m) => [
      TIPOS_MANUTENCAO[m.tipo],
      dia(m.data_inclusao),
      m.descricao,
      String(diasEmAberto(m.data_inclusao, dataHoje)),
    ]),
  };
}
