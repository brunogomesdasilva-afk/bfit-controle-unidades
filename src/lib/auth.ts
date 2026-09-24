import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PerfilAtual = {
  id: string;
  nome: string;
  perfil: "admin" | "usuario";
  // Academia que o usuário pode acessar (administrador acessa todas e fica sem academia).
  academiaId: string | null;
  academiaNome: string | null;
};

export async function getPerfilAtual(): Promise<PerfilAtual | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const completo = await supabase
    .from("profiles")
    .select("nome, perfil, ativo, academia_id, academia:academias(nome)")
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
  // A relação vem como objeto (um perfil tem uma academia), mas os tipos do supabase-js não sabem disso.
  const academia = data?.academia as unknown as { nome: string } | null;
  return {
    id: user.id,
    nome: data?.nome ?? user.email ?? "",
    perfil: admin ? "admin" : "usuario",
    academiaId: admin ? null : (data?.academia_id ?? null),
    academiaNome: admin ? null : (academia?.nome ?? null),
  };
}

export async function exigirAdmin(): Promise<PerfilAtual> {
  const atual = await getPerfilAtual();
  if (!atual) redirect("/login");
  if (atual.perfil !== "admin") redirect("/");
  return atual;
}
