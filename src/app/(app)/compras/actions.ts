"use server";

import { refresh, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { data, hoje, mensagemErro, texto, verificarAcesso } from "@/lib/planilha";
import type { Resultado } from "../Planilha";

export async function salvarCompra(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };

  const academia_id = texto(dados.academia_id);
  const descricao = texto(dados.descricao);
  const necessario_ate = data(dados.necessario_ate);
  const data_efetivacao = data(dados.data_efetivacao);

  if (!academia_id) return { erro: "Escolha a academia." };
  if (!descricao) return { erro: "Informe o que é a compra." };
  if (necessario_ate === undefined || data_efetivacao === undefined) return { erro: "Data inválida." };

  // A data da solicitação é sempre o dia em que a compra foi incluída (preenchida aqui, não pelo usuário).
  const registro = { academia_id, descricao, necessario_ate, data_efetivacao };
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("compras").update(registro).eq("id", id);
    if (error) return { erro: mensagemErro(error) };
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("compras")
      .insert({ ...registro, data_solicitacao: hoje(), criado_por: user?.id });
    if (error) return { erro: mensagemErro(error) };
  }

  revalidatePath("/compras");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return {};
}

export async function excluirCompra(id: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from("compras").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/compras");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return {};
}
