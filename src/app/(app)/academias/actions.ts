"use server";

import { refresh, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensagemErro, numero, texto, verificarAcesso } from "@/lib/planilha";
import type { Resultado } from "../Planilha";

const MAQUINAS = [
  ["maquinas_peitoral", "Peitoral"],
  ["maquinas_costas", "Costas"],
  ["maquinas_pernas", "Pernas"],
  ["maquinas_bracos", "Braços"],
] as const;

export async function salvarAcademia(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const nome = texto(dados.nome, 120);
  if (!nome) return { erro: "Informe o nome da academia." };

  const area_m2 = numero(dados.area_m2);
  if (area_m2 === undefined) return { erro: "Área inválida. Use só números, por exemplo 850 ou 850,5." };
  const custo_financeiro = numero(dados.custo_financeiro);
  if (custo_financeiro === undefined) return { erro: "Custo financeiro inválido. Exemplo: 15.000,00." };

  const registro: Record<string, string | number | null> = { nome, area_m2, custo_financeiro };
  for (const [campo, rotulo] of MAQUINAS) {
    const qtd = numero(dados[campo], { inteiro: true });
    if (qtd === undefined) return { erro: `Quantidade de máquinas de ${rotulo} inválida: use um número inteiro.` };
    registro[campo] = qtd ?? 0;
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("academias").update(registro).eq("id", id)
    : await supabase.from("academias").insert(registro);
  if (error) return { erro: mensagemErro(error) };

  // O nome aparece nas abas e na coluna "Academia" das outras telas.
  revalidatePath("/", "layout");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return {};
}

export async function excluirAcademia(id: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from("academias").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/", "layout");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return {};
}
