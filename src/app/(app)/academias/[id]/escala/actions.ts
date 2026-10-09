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
  const r = await gerarEscalaDoMes(supabase, academiaId, opcoes.mes, { indisponiveis: opcoes.indisponiveis, criadoPor: user?.id ?? null });
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
