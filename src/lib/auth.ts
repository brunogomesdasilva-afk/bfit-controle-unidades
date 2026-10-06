import { redirect } from "next/navigation";
import { inicioDoUsuario, modulosDoPerfil, type Modulo } from "@/lib/modulos";
import { createClient } from "@/lib/supabase/server";

export type PerfilAtual = {
  id: string;
  nome: string;
  // "manutencao": só vê a tela de Manutenção das unidades escolhidas para ele.
  perfil: "admin" | "usuario" | "manutencao";
  // Academia que o usuário pode acessar (administrador acessa todas e fica sem academia).
  academiaId: string | null;
  academiaNome: string | null;
  // Módulos que o usuário pode usar (Academia, RH, Financeiro, ADM).
  modulos: Modulo[];
};

export async function getPerfilAtual(): Promise<PerfilAtual | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // "*": se o banco ainda não tiver a coluna "modulos", a consulta não falha (modulosDoPerfil supre).
  const completo = await supabase
    .from("profiles")
    .select("*, academia:academias(nome)")
    .eq("id", user.id)
    .single();
  let data = completo.data;

  // Banco ainda sem a migration 0003 (acesso por academia): lê o básico para não tirar o acesso de ninguém.
  if (completo.error) {
    const basico = await supabase.from("profiles").select("nome, perfil, ativo").eq("id", user.id).single();
    data = basico.data ? { ...basico.data, academia_id: null, academia: [] } : null;
  }

  // Usuário inativo não tem mais acesso (o proxy encerra a sessão dele).
  if (data?.ativo === false) return null;

  const admin = data?.perfil === "admin";
  const manutencao = data?.perfil === "manutencao";
  // A relação vem como objeto (um perfil tem uma academia), mas os tipos do supabase-js não sabem disso.
  const academia = data?.academia as unknown as { nome: string } | null;
  return {
    id: user.id,
    nome: data?.nome ?? user.email ?? "",
    perfil: admin ? "admin" : manutencao ? "manutencao" : "usuario",
    academiaId: admin || manutencao ? null : (data?.academia_id ?? null),
    academiaNome: admin ? null : manutencao ? "Manutenção" : (academia?.nome ?? null),
    modulos: modulosDoPerfil(data as { perfil?: string; modulos?: string[] } | null),
  };
}

// Acesso a todas as academias (perfil administrador), para as telas e ações de dados de todas as unidades.
export async function exigirAdmin(): Promise<PerfilAtual> {
  const atual = await getPerfilAtual();
  if (!atual) redirect("/login");
  if (atual.perfil !== "admin") redirect(inicioDoUsuario(atual.modulos));
  return atual;
}

// O módulo ADM (Usuários e Backup) só vale para quem também acessa todas as academias.
export function temModulo(atual: PerfilAtual | null, modulo: Modulo) {
  if (!atual || !atual.modulos.includes(modulo)) return false;
  return modulo !== "adm" || atual.perfil === "admin";
}

// Telas de um módulo: quem não tem o módulo vai para a tela inicial dele (o proxy já barra antes; aqui é a
// segunda trava, no servidor).
export async function exigirModulo(modulo: Modulo): Promise<PerfilAtual> {
  const atual = await getPerfilAtual();
  if (!atual) redirect("/login");
  if (!temModulo(atual, modulo)) redirect(inicioDoUsuario(atual.modulos));
  return atual;
}
