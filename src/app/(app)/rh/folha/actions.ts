"use server";

import { revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Resultado = { erro?: string; ok?: string };
type Evento = { acao: "fechada" | "reaberta"; por: string; nome: string; em: string };

// Fecha a folha do mês com a conferência escolhida: ela vira o registro do que foi aprovado (relatório,
// arquivos e dados do sistema) e o mês fica travado para novas conferências.
export async function fecharFolha(conferenciaId: string): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "rh")) return { erro: "Você não tem o módulo RH." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("folha_conferencias").select("id, academia_id, mes, status, eventos").eq("id", conferenciaId).maybeSingle();
  if (!c) return { erro: "Conferência não encontrada." };
  if (c.status !== "conferida") return { erro: "Só uma conferência concluída pode fechar a folha." };
  const { data: jaFechada } = await supabase
    .from("folha_conferencias")
    .select("id")
    .eq("academia_id", c.academia_id)
    .eq("mes", c.mes)
    .eq("status", "fechada")
    .maybeSingle();
  if (jaFechada) return { erro: "A folha deste mês já está fechada." };

  const agora = new Date().toISOString();
  const eventos = [...((c.eventos as Evento[]) ?? []), { acao: "fechada", por: atual.id, nome: atual.nome, em: agora }];
  const { error } = await supabase
    .from("folha_conferencias")
    .update({ status: "fechada", fechada_por: atual.id, fechada_em: agora, eventos })
    .eq("id", conferenciaId);
  if (error) return { erro: error.message };
  revalidatePath("/rh/folha");
  return { ok: "Folha fechada." };
}

// Reabre uma folha fechada (só quem tem o módulo ADM). A reabertura fica registrada no histórico.
export async function reabrirFolha(conferenciaId: string): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "rh") || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM pode reabrir a folha." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("folha_conferencias").select("id, status, eventos").eq("id", conferenciaId).maybeSingle();
  if (!c || c.status !== "fechada") return { erro: "Esta folha não está fechada." };
  const eventos = [...((c.eventos as Evento[]) ?? []), { acao: "reaberta", por: atual.id, nome: atual.nome, em: new Date().toISOString() }];
  const { error } = await supabase
    .from("folha_conferencias")
    .update({ status: "conferida", fechada_por: null, fechada_em: null, eventos })
    .eq("id", conferenciaId);
  if (error) return { erro: error.message };
  revalidatePath("/rh/folha");
  return { ok: "Folha reaberta." };
}
