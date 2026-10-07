"use server";

import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { periodoDe, seAplica, type Tarefa } from "@/lib/tarefas";

// Marca uma tarefa do checklist como feita, no período atual (o dia ou o mês de hoje): não dá para marcar
// um período passado nem uma tarefa que não é do usuário.
export async function marcarTarefa(tarefaId: string): Promise<{ erro?: string }> {
  const atual = await getPerfilAtual();
  if (!atual) return { erro: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data } = await supabase.from("tarefas").select("*").eq("id", tarefaId).maybeSingle();
  const tarefa = data as Tarefa | null;
  if (!tarefa || !seAplica(tarefa, atual)) return { erro: "Esta tarefa não é sua." };
  const periodo = periodoDe(tarefa, hoje());
  if (!periodo) return { erro: "Esta tarefa ainda não começou neste mês." };

  const { error } = await supabase.from("tarefas_feitas").insert({ tarefa_id: tarefaId, usuario_id: atual.id, periodo });
  // Já marcada (duas abas abertas, por exemplo): fica como está.
  if (error && error.code !== "23505") return { erro: error.message };
  revalidatePath("/", "layout");
  return {};
}
