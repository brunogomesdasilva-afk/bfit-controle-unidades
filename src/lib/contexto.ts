import { getPerfilAtual } from "@/lib/auth";
import type { Academia } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

// O que toda tela ligada a academias precisa: quem está usando, as academias que ele pode ver
// e qual está selecionada (quem só tem uma já fica nela).
export async function contextoAcademias(academiaNaUrl: string | undefined) {
  const [atual, supabase] = await Promise.all([getPerfilAtual(), createClient()]);
  const { data } = await supabase.from("academias").select("*").order("nome");
  const academias = (data ?? []) as Academia[];
  const selecionada = academias.some((a) => a.id === academiaNaUrl)
    ? academiaNaUrl!
    : academias.length === 1
      ? academias[0].id
      : null;
  return { atual, supabase, academias, selecionada, admin: atual?.perfil === "admin" };
}

export const AVISO_TODAS = "Visão de todas as academias: só consulta. Para incluir ou alterar, abra a aba da academia.";
