"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { mensagemErro, numero, texto } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "../Planilha";

// Cadastro das tarefas do checklist (módulo ADM). Tarefa não se exclui (o histórico aponta para ela):
// para tirar do checklist, marque Ativa = Não.
export async function salvarTarefa(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM cadastra tarefas." };

  const titulo = texto(dados.titulo, 200);
  if (!titulo) return { erro: "Informe a tarefa." };
  const modulo = dados.modulo === "todos" ? null : dados.modulo;
  if (modulo !== null && !["academia", "rh", "financeiro", "adm"].includes(modulo)) return { erro: "Escolha para quem é a tarefa." };
  const recorrencia = dados.recorrencia === "mensal" ? "mensal" : "diaria";
  const dia = numero(dados.dia_inicio, { inteiro: true });
  if (dia === undefined || (dia !== null && (dia < 1 || dia > 28))) return { erro: "“A partir do dia” vai de 1 a 28." };

  const registro = {
    titulo,
    descricao: texto(dados.descricao, 500),
    modulo,
    incluir_admin: dados.incluir_admin === "sim",
    recorrencia,
    dia_inicio: recorrencia === "mensal" ? (dia ?? 1) : 1,
    ativo: dados.ativo !== "nao",
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("tarefas").update(registro).eq("id", id) : await supabase.from("tarefas").insert(registro);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/", "layout");
  refresh();
  return {};
}
