"use server";

import { refresh, revalidatePath } from "next/cache";
import { NOTAS, questionarioDoDepartamento } from "@/lib/adb";
import { createClient } from "@/lib/supabase/server";
import { hoje, mensagemErro, texto, verificarAcesso } from "@/lib/planilha";

export type ResultadoAdb = { erro?: string; ok?: string };

// Grava a A.D.B do funcionário no mês atual. Se ele já foi avaliado neste mês, a avaliação é atualizada
// (uma por funcionário por mês). O avaliador é quem está logado.
export async function salvarAvaliacao(
  academiaId: string,
  dados: { funcionarioId: string; notas: number[]; stop: string; start: string; continuar: string }
): Promise<ResultadoAdb> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };

  if (dados.notas.length !== NOTAS.length || dados.notas.some((n) => !Number.isInteger(n) || n < 1 || n > 5))
    return { erro: "Dê uma nota de 1 a 5 para todas as perguntas." };

  const supabase = await createClient();
  const { data: funcionario } = await supabase
    .from("funcionarios")
    .select("id, academia_id, departamento")
    .eq("id", dados.funcionarioId)
    .maybeSingle();
  if (!funcionario || funcionario.academia_id !== academiaId) return { erro: "Escolha um funcionário desta academia." };
  const questionario = questionarioDoDepartamento(funcionario.departamento);
  if (!questionario) return { erro: "O departamento deste funcionário não tem questionário de A.D.B." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const mes = `${hoje().slice(0, 7)}-01`;
  const registro = {
    questionario,
    ...Object.fromEntries(NOTAS.map((campo, i) => [campo, dados.notas[i]])),
    stop: texto(dados.stop, 2000),
    start: texto(dados.start, 2000),
    continuar: texto(dados.continuar, 2000),
    atualizado_por: user?.id,
  };

  const { data: existente } = await supabase
    .from("avaliacoes_adb")
    .select("id")
    .eq("funcionario_id", funcionario.id)
    .eq("mes", mes)
    .maybeSingle();
  const { error } = existente
    ? await supabase.from("avaliacoes_adb").update(registro).eq("id", existente.id)
    : await supabase
        .from("avaliacoes_adb")
        .insert({ ...registro, academia_id: academiaId, funcionario_id: funcionario.id, mes, criado_por: user?.id });
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/avaliacao", "layout");
  refresh();
  return { ok: existente ? "Avaliação atualizada." : "Avaliação gravada." };
}

export async function excluirAvaliacao(id: string): Promise<ResultadoAdb> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from("avaliacoes_adb").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/avaliacao", "layout");
  refresh();
  return { ok: "Avaliação excluída." };
}
