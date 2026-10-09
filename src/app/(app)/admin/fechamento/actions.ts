"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { data as lerData, mensagemErro, texto } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";

// Grava a nova data de fechamento do financeiro (vale a mais recente; uma data anterior reabre o período).
export async function fecharPeriodo(dados: { data: string; observacao: string }): Promise<{ erro?: string; ok?: string }> {
  const atual = await getPerfilAtual();
  if (!atual || atual.perfil !== "admin" || !temModulo(atual, "adm")) return { erro: "Só o administrador com o módulo ADM fecha o período." };
  const data = lerData(dados.data);
  if (!data) return { erro: "Informe a data de fechamento." };
  const supabase = await createClient();
  const { error } = await supabase.from("fin_fechamentos").insert({ data_fechamento: data, observacao: texto(dados.observacao, 300), criado_por: atual.id });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/", "layout");
  refresh();
  return { ok: `Período fechado até ${data.split("-").reverse().join("/")}.` };
}
