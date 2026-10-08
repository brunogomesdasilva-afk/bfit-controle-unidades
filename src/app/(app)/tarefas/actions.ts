"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { data, mensagemErro, numero, texto } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "../Planilha";

// Cadastro das tarefas do checklist (módulo ADM). Tarefa não se exclui (o histórico aponta para ela):
// para tirar do checklist, marque Ativa = Não.
export async function salvarTarefa(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM cadastra tarefas." };

  const titulo = texto(dados.titulo, 200);
  if (!titulo) return { erro: "Informe a tarefa." };
  const usuarioId = dados.usuario_id ?? "";
  if (!/^[0-9a-f-]{36}$/.test(usuarioId)) return { erro: "Escolha o usuário da tarefa." };
  const recorrencia = dados.recorrencia === "mensal" ? "mensal" : dados.recorrencia === "pontual" ? "pontual" : "diaria";
  const dia = numero(dados.dia_inicio, { inteiro: true });
  if (dia === undefined || (dia !== null && (dia < 1 || dia > 28))) return { erro: "O dia do mês vai de 1 a 28." };
  if (recorrencia === "mensal" && dia === null) return { erro: "Na tarefa mensal, informe o dia do mês em que ela aparece." };
  const dataInicio = data(dados.data_inicio);
  if (dataInicio === undefined) return { erro: "Data inválida em “A partir de”." };

  const registro = {
    titulo,
    descricao: texto(dados.descricao, 500),
    usuario_id: usuarioId,
    // Por usuário: o módulo e o "inclui administradores" das tarefas antigas deixam de valer.
    modulo: null,
    incluir_admin: false,
    recorrencia,
    dia_inicio: recorrencia === "mensal" ? (dia ?? 1) : 1,
    // Pontual: aparece a partir desta data (vazia = desde já) até ser marcada.
    data_inicio: recorrencia === "pontual" ? dataInicio : null,
    ativo: dados.ativo !== "nao",
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("tarefas").update(registro).eq("id", id) : await supabase.from("tarefas").insert(registro);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/", "layout");
  refresh();
  return {};
}
