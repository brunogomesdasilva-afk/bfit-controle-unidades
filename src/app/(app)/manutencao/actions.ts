"use server";

import { refresh, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TIPOS_MANUTENCAO } from "@/lib/database.types";
import { data, hoje, mensagemErro, texto, verificarAcesso } from "@/lib/planilha";
import type { Resultado } from "../Planilha";

export async function salvarManutencao(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };

  const academia_id = texto(dados.academia_id);
  const tipo = texto(dados.tipo);
  const descricao = texto(dados.descricao);
  const data_finalizacao = data(dados.data_finalizacao);

  if (!academia_id) return { erro: "Escolha a academia." };
  if (!tipo || !(tipo in TIPOS_MANUTENCAO)) return { erro: "Escolha o tipo de manutenção." };
  if (!descricao) return { erro: "Informe o que é a manutenção." };
  if (data_finalizacao === undefined) return { erro: "Data de finalização inválida." };

  // A data de inclusão é sempre o dia em que a manutenção foi incluída (preenchida aqui, não pelo usuário).
  const registro = { academia_id, tipo, descricao, data_finalizacao };
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("manutencoes").update(registro).eq("id", id);
    if (error) return { erro: mensagemErro(error) };
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("manutencoes")
      .insert({ ...registro, data_inclusao: hoje(), criado_por: user?.id });
    if (error) return { erro: mensagemErro(error) };
  }

  revalidatePath("/manutencao");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return {};
}

export async function excluirManutencao(id: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from("manutencoes").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/manutencao");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return {};
}
