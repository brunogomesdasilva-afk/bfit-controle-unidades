"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { executarRegra, RELATORIOS, type RegraEnvio } from "@/lib/envios";
import { mensagemErro, texto } from "@/lib/planilha";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ehGrupo } from "@/lib/whatsapp";

type Resultado = { erro?: string; ok?: string };

export type DadosRegra = Pick<
  RegraEnvio,
  "nome" | "relatorio" | "canal" | "grupo_id" | "grupo_nome" | "para_admins" | "usuarios" | "dias" | "dias_semana" | "hora" | "com_faturamento" | "ativo"
>;

async function soAdmin() {
  const atual = await getPerfilAtual();
  return atual?.perfil === "admin";
}

function atualizarTela() {
  revalidatePath("/admin/envios");
  refresh();
}

// Cria (sem id) ou altera uma regra de envio automático.
export async function salvarRegra(id: string | null, dados: DadosRegra): Promise<Resultado> {
  if (!(await soAdmin())) return { erro: "Só o administrador altera os envios automáticos." };
  const nome = texto(dados.nome, 120);
  if (!nome) return { erro: "Dê um nome para a regra." };
  if (!(dados.relatorio in RELATORIOS)) return { erro: "Escolha o relatório." };
  if (dados.canal !== "whatsapp" && dados.canal !== "email") return { erro: "Escolha WhatsApp ou e-mail." };
  if (!Number.isInteger(dados.hora) || dados.hora < 0 || dados.hora > 23) return { erro: "Escolha a hora." };
  const diasSemana = [...new Set(dados.dias_semana.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  if (dados.dias === "semana" && !diasSemana.length) return { erro: "Marque pelo menos um dia da semana." };
  const grupo = (dados.grupo_id ?? "").trim();
  if (grupo && !ehGrupo(grupo)) return { erro: "ID de grupo inválido (ex.: 120363019502650977-group)." };
  const usuarios = dados.usuarios.filter((u) => /^[0-9a-f-]{36}$/i.test(u));
  if (dados.ativo && !(grupo && dados.canal === "whatsapp") && !dados.para_admins && !usuarios.length)
    return { erro: "Para ativar, escolha um grupo (WhatsApp), os administradores ou pelo menos uma pessoa." };

  const linha = {
    nome,
    relatorio: dados.relatorio,
    canal: dados.canal,
    grupo_id: grupo || null,
    grupo_nome: grupo ? texto(dados.grupo_nome ?? "", 120) || null : null,
    para_admins: Boolean(dados.para_admins),
    usuarios,
    dias: dados.dias === "semana" ? "semana" : "uteis",
    dias_semana: dados.dias === "semana" ? diasSemana : [],
    hora: dados.hora,
    com_faturamento: Boolean(dados.com_faturamento),
    ativo: Boolean(dados.ativo),
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("regras_envio").update(linha).eq("id", id) : await supabase.from("regras_envio").insert(linha);
  if (error) return { erro: mensagemErro(error) };
  atualizarTela();
  return { ok: id ? "Regra salva." : "Regra criada." };
}

export async function excluirRegra(id: string): Promise<Resultado> {
  if (!(await soAdmin())) return { erro: "Só o administrador altera os envios automáticos." };
  const supabase = await createClient();
  const { error } = await supabase.from("regras_envio").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  atualizarTela();
  return { ok: "Regra excluída." };
}

// "Enviar agora": manda a regra na hora (teste), sem contar como o envio automático do dia.
export async function enviarRegraAgora(id: string): Promise<Resultado> {
  if (!(await soAdmin())) return { erro: "Só o administrador envia." };
  const db = createAdminClient();
  if (!db) return { erro: "Chave de serviço do Supabase não configurada no servidor." };
  const { data: regra } = await db.from("regras_envio").select("*").eq("id", id).maybeSingle();
  if (!regra) return { erro: "Regra não encontrada." };
  const r = await executarRegra(db, regra as RegraEnvio);
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  await db.from("regras_envio").update({ ultimo_resultado: `${quando} (enviar agora): ${r.resultado}` }).eq("id", id);
  atualizarTela();
  return r.ok ? { ok: r.resultado } : { erro: r.resultado };
}
