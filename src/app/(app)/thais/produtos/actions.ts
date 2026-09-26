"use server";

import { refresh, revalidatePath } from "next/cache";
import { mensagemErro, validar, verificarAcesso } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "../../Planilha";

// Cadastro de produtos de joias (só o administrador). Preço, margem e reposição são calculados pelo banco.
export async function salvarProduto(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const { registro, erro } = validar(
    [
      { campo: "sku", rotulo: "SKU", tipo: "texto", obrigatorio: true },
      { campo: "descricao", rotulo: "Descrição", tipo: "texto" },
      { campo: "data_fabricacao", rotulo: "Data de fabricação", tipo: "data" },
      { campo: "tipo_banho", rotulo: "Tipo de banho", tipo: "texto" },
      { campo: "ouro_milesimos", rotulo: "Ouro (milésimos)", tipo: "decimal" },
      { campo: "preco_custo", rotulo: "Preço de custo", tipo: "decimal", obrigatorio: true },
      { campo: "markup", rotulo: "Markup", tipo: "decimal", obrigatorio: true },
    ],
    dados
  );
  if (erro || !registro) return { erro };
  if (Number(registro.markup) <= 0) return { erro: "O markup precisa ser maior que zero (ex.: 2,5)." };
  registro.sku = String(registro.sku).toUpperCase();

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("produtos_joias").update(registro).eq("id", id)
    : await supabase.from("produtos_joias").insert(registro);
  if (error) return { erro: error.code === "23505" ? "Já existe um produto com este SKU." : mensagemErro(error) };

  revalidatePath("/thais/produtos");
  refresh();
  return {};
}

export async function excluirProduto(id: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };
  const supabase = await createClient();
  const { error } = await supabase.from("produtos_joias").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/thais/produtos");
  refresh();
  return {};
}
