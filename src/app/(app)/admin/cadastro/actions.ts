"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { mensagemErro, texto } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { ehGrupo } from "@/lib/whatsapp";

type Resultado = { erro?: string; ok?: string };

async function soAdmin() {
  return (await getPerfilAtual())?.perfil === "admin";
}

function atualizarTelas() {
  revalidatePath("/admin/cadastro");
  revalidatePath("/admin/envios");
  refresh();
}

// Cadastra (sem id) ou altera um grupo de WhatsApp.
export async function salvarGrupo(id: string | null, dados: { nome: string; grupo_id: string }): Promise<Resultado> {
  if (!(await soAdmin())) return { erro: "Só o administrador altera o cadastro." };
  const nome = texto(dados.nome, 120);
  const grupoId = (dados.grupo_id ?? "").trim();
  if (!nome) return { erro: "Informe o nome do grupo." };
  if (!ehGrupo(grupoId)) return { erro: "ID de grupo inválido. Ele termina em -group, ex.: 120363019502650977-group." };
  const supabase = await createClient();
  const linha = { nome, grupo_id: grupoId };
  const { error } = id ? await supabase.from("grupos_whatsapp").update(linha).eq("id", id) : await supabase.from("grupos_whatsapp").insert(linha);
  if (error) return { erro: error.code === "23505" ? "Esse ID de grupo já está cadastrado." : mensagemErro(error) };
  // Regras que já usam o grupo passam a mostrar o nome novo.
  await supabase.from("regras_envio").update({ grupo_nome: nome }).eq("grupo_id", grupoId);
  atualizarTelas();
  return { ok: id ? "Grupo salvo." : `Grupo "${nome}" cadastrado.` };
}

export async function excluirGrupo(id: string): Promise<Resultado> {
  if (!(await soAdmin())) return { erro: "Só o administrador altera o cadastro." };
  const supabase = await createClient();
  const { error } = await supabase.from("grupos_whatsapp").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  atualizarTelas();
  return { ok: "Grupo removido do cadastro. Regras que já usavam o grupo continuam enviando para ele." };
}
