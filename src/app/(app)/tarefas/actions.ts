"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { data, mensagemErro, numero, texto } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "../Planilha";

// Cadastro das tarefas do checklist (módulo ADM). Tarefa não se exclui (o histórico aponta para ela): para tirar
// do checklist, cancele (sai do cadastro e fica no log) ou marque Ativa = Não (suspensa).
export async function salvarTarefa(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM cadastra tarefas." };

  const titulo = texto(dados.titulo, 200);
  if (!titulo) return { erro: "Informe a tarefa." };
  // "Para quem": u:<usuário> ou g:<grupo>.
  const [tipoDestino, destino] = (dados.para ?? "").split(":");
  if (!["u", "g"].includes(tipoDestino) || !/^[0-9a-f-]{36}$/.test(destino ?? "")) return { erro: "Escolha para quem é a tarefa (usuário ou grupo)." };
  const recorrencia = dados.recorrencia === "mensal" ? "mensal" : dados.recorrencia === "pontual" ? "pontual" : "diaria";
  const dia = numero(dados.dia_inicio, { inteiro: true });
  if (dia === undefined || (dia !== null && (dia < 1 || dia > 28))) return { erro: "O dia do mês vai de 1 a 28." };
  if (recorrencia === "mensal" && dia === null) return { erro: "Na tarefa mensal, informe o dia do mês em que ela aparece." };
  const dataInicio = data(dados.data_inicio);
  if (dataInicio === undefined) return { erro: "Data inválida em “A partir de”." };

  const registro = {
    titulo,
    descricao: texto(dados.descricao, 500),
    usuario_id: tipoDestino === "u" ? destino : null,
    grupo_id: tipoDestino === "g" ? destino : null,
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

// Bloco "Pontuais pendentes" do cadastro: a planilha não tem a coluna "Repete", então a tarefa é sempre pontual.
export async function salvarTarefaPontual(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  return salvarTarefa(id, { ...dados, recorrencia: "pontual" });
}

// Cancela a tarefa: sai do cadastro e do checklist de todos; fica no log como cancelada (com quem e quando).
export async function cancelarTarefa(id: string): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM cancela tarefas." };
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").update({ cancelada_em: new Date().toISOString(), cancelada_por: atual.id, ativo: false }).eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/", "layout");
  refresh();
  return {};
}

// Grupos de usuários das tarefas (ex.: Gerentes, Operacional): nome e membros.
export async function salvarGrupoTarefas(id: string | null, nome: string, membros: string[]): Promise<{ erro?: string; ok?: string }> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM altera os grupos." };
  const n = texto(nome, 80);
  if (!n) return { erro: "Dê um nome ao grupo." };
  const supabase = await createClient();
  const registro = { nome: n, membros: [...new Set(membros)] };
  const { error } = id ? await supabase.from("tarefa_grupos").update(registro).eq("id", id) : await supabase.from("tarefa_grupos").insert(registro);
  if (error) return { erro: error.code === "23505" ? "Já existe um grupo com esse nome." : mensagemErro(error) };
  revalidatePath("/", "layout");
  refresh();
  return { ok: "Grupo salvo." };
}
