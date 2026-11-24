"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { numero } from "@/lib/planilha";
import { createAdminClient } from "@/lib/supabase/admin";

// Área (m²) da academia, digitada no Painel (cartão "Índice de ocupação"). O administrador muda qualquer academia;
// o gerente (perfil usuário), só a dele. O cadastro de academias é só do administrador no banco, por isso grava
// com a chave de serviço depois de conferir a permissão, e só o campo da área.
export async function salvarAreaAcademia(academiaId: string, valor: string): Promise<{ erro?: string }> {
  const atual = await getPerfilAtual();
  if (!atual) return { erro: "Sua sessão expirou. Entre novamente." };
  const pode = atual.perfil === "admin" || (atual.perfil === "usuario" && atual.academiaId === academiaId);
  if (!pode) return { erro: "Você só pode alterar a área da sua academia." };

  const area = numero(valor);
  if (area === undefined || (area !== null && area <= 0)) return { erro: "Área inválida. Use só números, por exemplo 850 ou 850,5." };

  const admin = createAdminClient();
  if (!admin) return { erro: "Chave de serviço do Supabase não configurada (SUPABASE_SERVICE_ROLE_KEY)." };
  const { error } = await admin.from("academias").update({ area_m2: area }).eq("id", academiaId);
  if (error) return { erro: "Não foi possível salvar a área. Tente de novo." };

  revalidatePath("/", "layout");
  refresh();
  return {};
}
