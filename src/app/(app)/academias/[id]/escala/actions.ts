"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { gerarEscalaDoMes, type ResultadoEscala } from "@/lib/escalaUnidade";
import { mensagemErro, validar } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "../../../Planilha";

export type { ResultadoEscala };

async function semAcesso(academiaId: string) {
  const atual = await getPerfilAtual();
  if (!atual) return "Sua sessão expirou. Entre novamente.";
  if (atual.perfil !== "admin" && atual.academiaId !== academiaId) return "Você só pode alterar a escala da sua unidade.";
  return null;
}

export type OpcoesEscala = { mes: string; indisponiveis: { funcionarioId: string; data: string }[] };

// Gera (ou refaz) a escala de fins de semana e feriados de UM mês na tela da unidade (ver gerarEscalaDoMes).
// "indisponiveis" são folgas pedidas: o funcionário não entra na escala naquele dia.
export async function gerarEscalaDaUnidade(academiaId: string, opcoes: OpcoesEscala): Promise<ResultadoEscala> {
  const bloqueio = await semAcesso(academiaId);
  if (bloqueio) return { erro: bloqueio };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // As folgas do mês ficam gravadas (substituem as que estavam): a próxima geração, inclusive a automática, usa elas.
  if (!/^d{4}-(0[1-9]|1[0-2])$/.test(opcoes.mes)) return { erro: "Escolha o mês da escala." };
  const [ano, m] = opcoes.mes.split("-").map(Number);
  const fimMes = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  const { error: erroApagar } = await supabase.from("escala_folgas").delete().eq("academia_id", academiaId).gte("data", `${opcoes.mes}-01`).lte("data", fimMes);
  if (erroApagar) return { erro: mensagemErro(erroApagar) };
  const novas = opcoes.indisponiveis.filter((f) => f.funcionarioId && f.data >= `${opcoes.mes}-01` && f.data <= fimMes);
  if (novas.length) {
    const { error } = await supabase
      .from("escala_folgas")
      .upsert(novas.map((f) => ({ academia_id: academiaId, funcionario_id: f.funcionarioId, data: f.data, criado_por: user?.id ?? null })), { onConflict: "funcionario_id,data" });
    if (error) return { erro: mensagemErro(error) };
  }
  const r = await gerarEscalaDoMes(supabase, academiaId, opcoes.mes, { criadoPor: user?.id ?? null });
  revalidatePath(`/academias/${academiaId}/escala`);
  refresh();
  return r;
}

// Feriados da cidade da unidade (os nacionais já vêm cadastrados).
export async function salvarFeriado(academiaId: string, id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const bloqueio = await semAcesso(academiaId);
  if (bloqueio) return { erro: bloqueio };
  const { registro, erro } = validar(
    [
      { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
      { campo: "nome", rotulo: "Feriado", tipo: "texto", obrigatorio: true },
    ],
    dados
  );
  if (erro || !registro) return { erro };
  const fechada = dados.fechada === "sim";

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("feriados").update({ ...registro, fechada }).eq("id", id)
    : await supabase.from("feriados").insert({ ...registro, fechada, academia_id: academiaId });
  if (error) return { erro: error.code === "23505" ? "Já existe um feriado nesta data para esta unidade." : mensagemErro(error) };
  revalidatePath(`/academias/${academiaId}/escala`);
  refresh();
  return {};
}

export async function excluirFeriado(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("feriados").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  refresh();
  return {};
}
