"use server";

import { refresh, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEPARTAMENTOS, GENEROS } from "@/lib/database.types";
import { mensagemErro, validar, verificarAcesso } from "@/lib/planilha";
import type { Resultado } from "../../Planilha";

// Cadastros de cada academia: só o administrador inclui, altera e exclui.
// A academia vem do submenu aberto (presa ao botão da planilha).

export async function salvarFuncionario(
  academiaId: string,
  id: string | null,
  dados: Record<string, string>
): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const { registro, erro } = validar(
    [
      { campo: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
      { campo: "departamento", rotulo: "Departamento", tipo: "texto", obrigatorio: true },
      { campo: "horario_entrada", rotulo: "Horário de entrada", tipo: "hora" },
      { campo: "horario_saida", rotulo: "Horário de saída", tipo: "hora" },
      { campo: "genero", rotulo: "Gênero", tipo: "texto" },
    ],
    dados
  );
  if (erro || !registro) return { erro };
  if (!(String(registro.departamento) in DEPARTAMENTOS)) return { erro: "Escolha o departamento da lista." };
  if (registro.genero !== null && !(String(registro.genero) in GENEROS)) return { erro: "Escolha o gênero da lista." };

  return gravar("funcionarios", academiaId, id, registro);
}

export async function excluirFuncionario(id: string): Promise<Resultado> {
  return apagar("funcionarios", id);
}

export async function salvarModalidade(
  academiaId: string,
  id: string | null,
  dados: Record<string, string>
): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const { registro, erro } = validar([{ campo: "nome", rotulo: "Modalidade", tipo: "texto", obrigatorio: true }], dados);
  if (erro || !registro) return { erro };

  const r = await gravar("modalidades", academiaId, id, registro);
  if (r.erro?.startsWith("Já existe")) return { erro: "Essa modalidade já está cadastrada nesta academia." };
  return r;
}

export async function excluirModalidade(id: string): Promise<Resultado> {
  return apagar("modalidades", id);
}

async function gravar(
  tabela: "funcionarios" | "modalidades",
  academiaId: string,
  id: string | null,
  registro: Record<string, string | number | null>
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from(tabela).update(registro).eq("id", id)
    : await supabase.from(tabela).insert({ ...registro, academia_id: academiaId });
  if (error) return { erro: mensagemErro(error) };

  // As modalidades aparecem como lista nas contagens de coletivas e de lutas.
  revalidatePath("/academias", "layout");
  revalidatePath("/frequencia", "layout");
  refresh();
  return {};
}

async function apagar(tabela: "funcionarios" | "modalidades", id: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from(tabela).delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/academias", "layout");
  revalidatePath("/frequencia", "layout");
  refresh();
  return {};
}
