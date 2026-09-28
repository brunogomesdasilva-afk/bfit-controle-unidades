"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEPARTAMENTOS, GENEROS } from "@/lib/database.types";
import { mensagemErro, validar, verificarAcesso } from "@/lib/planilha";
import type { Resultado } from "../../Planilha";

// Cadastros de cada academia (funcionários e modalidades): o administrador cuida de todas; o usuário de
// uma academia cuida só da dele (a mesma regra também está no banco).
// A academia vem do submenu aberto (presa ao botão da planilha).

async function semAcessoAAcademia(academiaId: string) {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return semAcesso;
  const atual = await getPerfilAtual();
  if (atual?.perfil !== "admin" && atual?.academiaId !== academiaId) return "Você só pode alterar o cadastro da sua academia.";
  return null;
}

export async function salvarFuncionario(
  academiaId: string,
  id: string | null,
  dados: Record<string, string>
): Promise<Resultado> {
  const semAcesso = await semAcessoAAcademia(academiaId);
  if (semAcesso) return { erro: semAcesso };

  const { registro, erro } = validar(
    [
      { campo: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
      { campo: "departamento", rotulo: "Departamento", tipo: "texto", obrigatorio: true },
      { campo: "horario_entrada", rotulo: "Horário de entrada", tipo: "hora" },
      { campo: "horario_saida", rotulo: "Horário de saída", tipo: "hora" },
      { campo: "genero", rotulo: "Gênero", tipo: "texto" },
      { campo: "data_nascimento", rotulo: "Data de nascimento", tipo: "data" },
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
  const semAcesso = await semAcessoAAcademia(academiaId);
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

export async function salvarDataImportante(
  academiaId: string,
  id: string | null,
  dados: Record<string, string>
): Promise<Resultado> {
  const semAcesso = await semAcessoAAcademia(academiaId);
  if (semAcesso) return { erro: semAcesso };

  const { registro, erro } = validar(
    [
      { campo: "item", rotulo: "Item", tipo: "texto", obrigatorio: true },
      { campo: "vencimento", rotulo: "Vencimento", tipo: "data" },
      { campo: "observacao", rotulo: "Observação", tipo: "texto" },
    ],
    dados
  );
  if (erro || !registro) return { erro };

  const r = await gravar("datas_importantes", academiaId, id, registro);
  if (r.erro?.startsWith("Já existe")) return { erro: "Esse item já está cadastrado nesta academia." };
  return r;
}

export async function excluirDataImportante(id: string): Promise<Resultado> {
  return apagar("datas_importantes", id);
}

type Tabela = "funcionarios" | "modalidades" | "datas_importantes";

async function gravar(
  tabela: Tabela,
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

// A regra do banco garante que o usuário de uma academia só exclui o que é dela.
async function apagar(tabela: Tabela, id: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from(tabela).delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/academias", "layout");
  revalidatePath("/frequencia", "layout");
  refresh();
  return {};
}
