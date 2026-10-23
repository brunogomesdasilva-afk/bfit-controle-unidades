"use server";

import { refresh, revalidatePath } from "next/cache";
import { APROVACAO_COMPRA, type Compra } from "@/lib/database.types";
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

  const supabase = await createClient();
  // Aprovação: só entra na gravação para quem pode aprovar (o banco também trava); para os demais fica como está.
  const { data: podeAprovar } = await supabase.rpc("pode_aprovar_compras");
  const aprovacao = dados.aprovacao in APROVACAO_COMPRA ? (dados.aprovacao as Compra["aprovacao"]) : undefined;

  // A data da solicitação é sempre o dia em que a compra foi incluída (preenchida aqui, não pelo usuário).
  const registro = { academia_id, descricao, necessario_ate, data_efetivacao, ...(podeAprovar && aprovacao ? { aprovacao } : {}) };

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

// Aprovação direto na linha (sem "Alterar"): só quem aprova compras; o banco também trava.
export async function alterarAprovacaoCompra(id: string, valor: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };
  if (!(valor in APROVACAO_COMPRA)) return { erro: "Aprovação inválida." };
  const supabase = await createClient();
  const { data: podeAprovar } = await supabase.rpc("pode_aprovar_compras");
  if (!podeAprovar) return { erro: "Só quem aprova compras pode alterar a aprovação." };
  const { error } = await supabase.from("compras").update({ aprovacao: valor }).eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/compras");
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
