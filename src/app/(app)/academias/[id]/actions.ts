"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COM_CREF, DEPARTAMENTOS, GENEROS, PROFESSORES } from "@/lib/database.types";
import { gradePelasContagens, somarDias } from "@/lib/fechamentoColetivas";
import { hoje, mensagemErro, validar, verificarAcesso } from "@/lib/planilha";
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
      { campo: "ativo", rotulo: "Ativo", tipo: "texto" },
      { campo: "data_contratacao", rotulo: "Data de contratação", tipo: "data" },
      { campo: "ferias_limite", rotulo: "Limite para tirar férias", tipo: "data" },
      { campo: "cref", rotulo: "CREF", tipo: "texto" },
      { campo: "cref_vencimento", rotulo: "Vencimento do CREF", tipo: "data" },
      { campo: "pj", rotulo: "PJ", tipo: "texto" },
    ],
    dados
  );
  if (erro || !registro) return { erro };
  (registro as Record<string, unknown>).ativo = registro.ativo !== "nao";
  // PJ só vale para professores; nos outros departamentos fica sempre desmarcado.
  (registro as Record<string, unknown>).pj = registro.pj === "sim" && PROFESSORES.includes(String(registro.departamento));
  // CREF só vale para professores de sala e de coletivas.
  if (!COM_CREF.includes(String(registro.departamento)) && (registro.cref || registro.cref_vencimento))
    return { erro: "CREF e vencimento do CREF são só para Professores e Professor de coletivas." };
  if (!(String(registro.departamento) in DEPARTAMENTOS)) return { erro: "Escolha o departamento da lista." };
  if (registro.genero !== null && !(String(registro.genero) in GENEROS)) return { erro: "Escolha o gênero da lista." };

  return gravar("funcionarios", academiaId, id, registro);
}

// Quem já tem histórico (aulas dadas, avaliação, escala) não é excluído: é inativado (Ativo = Não).
export async function excluirFuncionario(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data: f } = await supabase.from("funcionarios").select("nome, academia_id").eq("id", id).maybeSingle();
  if (f) {
    const aulas = (tabela: string) =>
      supabase
        .from(tabela)
        .select("id", { count: "exact", head: true })
        .eq("academia_id", f.academia_id)
        .or(`professor.eq."${f.nome}",professor_substituto.eq."${f.nome}"`);
    const [coletivas, lutas, adb, escala] = await Promise.all([
      aulas("contagem_coletivas"),
      aulas("contagem_lutas"),
      supabase.from("avaliacoes_adb").select("id", { count: "exact", head: true }).eq("funcionario_id", id),
      supabase.from("escala").select("id", { count: "exact", head: true }).eq("funcionario_id", id),
    ]);
    const historico = [
      (coletivas.count ?? 0) + (lutas.count ?? 0) ? `${(coletivas.count ?? 0) + (lutas.count ?? 0)} aulas lançadas` : null,
      adb.count ? "avaliação na A.D.B" : null,
      escala.count ? "dias na escala" : null,
    ].filter(Boolean);
    if (historico.length)
      return { erro: `${f.nome} tem histórico (${historico.join(", ")}) e não pode ser excluído. Para tirar das listas, altere “Ativo” para “Não”.` };
  }
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

// O tipo (coletivas ou lutas) vem da aba aberta na grade.
export async function salvarAulaGrade(
  academiaId: string,
  tipo: "coletivas" | "lutas",
  id: string | null,
  dados: Record<string, string>
): Promise<Resultado> {
  dados = { ...dados, tipo };
  const semAcesso = await semAcessoAAcademia(academiaId);
  if (semAcesso) return { erro: semAcesso };

  const { registro, erro } = validar(
    [
      { campo: "tipo", rotulo: "Tipo", tipo: "texto", obrigatorio: true },
      { campo: "dia_semana", rotulo: "Dia da semana", tipo: "inteiro", obrigatorio: true },
      { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true },
      { campo: "modalidade", rotulo: "Modalidade", tipo: "texto", obrigatorio: true },
      { campo: "professor", rotulo: "Professor", tipo: "texto" },
      { campo: "duracao_min", rotulo: "Duração (min)", tipo: "inteiro", obrigatorio: true },
      { campo: "vigente_de", rotulo: "Vale a partir de", tipo: "data" },
    ],
    dados
  );
  if (erro || !registro) return { erro };
  if (registro.tipo !== "coletivas" && registro.tipo !== "lutas") return { erro: "Escolha o tipo da lista." };
  const dataHoje = hoje();
  const aPartirDe = (registro.vigente_de as string | null) ?? dataHoje;
  const repetida = "Essa aula já está na grade (mesmo dia, horário e modalidade).";

  // Aula nova: vale a partir da data informada (padrão: hoje).
  if (!id) {
    const r = await gravar("grade_aulas", academiaId, null, { ...registro, vigente_de: aPartirDe });
    return r.erro?.startsWith("Já existe") ? { erro: repetida } : r;
  }

  // Alteração: guarda o histórico. A versão atual é encerrada no dia anterior e a nova começa na data
  // informada (se não mudou a data, a partir de hoje). Só corrige no lugar se a versão começa hoje ou depois,
  // ou se a data informada é anterior ao início da versão (correção desde o começo).
  const supabase = await createClient();
  const { data: atual } = await supabase.from("grade_aulas").select("*").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Aula não encontrada." };
  if (atual.vigente_ate) return { erro: "Esta é uma versão antiga (histórico). Altere a aula da grade vigente." };
  const inicio = aPartirDe !== atual.vigente_de ? aPartirDe : dataHoje;
  if (inicio <= atual.vigente_de) {
    const r = await gravar("grade_aulas", academiaId, id, { ...registro, vigente_de: inicio });
    return r.erro?.startsWith("Já existe") ? { erro: repetida } : r;
  }
  const { error: erroEncerrar } = await supabase.from("grade_aulas").update({ vigente_ate: somarDias(inicio, -1) }).eq("id", id);
  if (erroEncerrar) return { erro: mensagemErro(erroEncerrar) };
  const r = await gravar("grade_aulas", academiaId, null, { ...registro, vigente_de: inicio });
  if (r.erro) {
    await supabase.from("grade_aulas").update({ vigente_ate: null }).eq("id", id); // desfaz o encerramento
    return r.erro.startsWith("Já existe") ? { erro: repetida } : r;
  }
  return r;
}

// Excluir encerra a aula ontem (ela some da grade vigente, mas o histórico fica para os meses anteriores).
// Aula que ainda nem começou a valer é apagada de verdade; versões antigas só o administrador apaga.
export async function excluirAulaGrade(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data: atual } = await supabase.from("grade_aulas").select("vigente_de, vigente_ate").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Aula não encontrada." };
  const ontem = somarDias(hoje(), -1);
  if (atual.vigente_ate || atual.vigente_de > ontem) {
    if (atual.vigente_ate && (await getPerfilAtual())?.perfil !== "admin") return { erro: "Só o administrador apaga o histórico da grade." };
    return apagar("grade_aulas", id);
  }
  const { error } = await supabase.from("grade_aulas").update({ vigente_ate: ontem }).eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/academias", "layout");
  refresh();
  return {};
}

// Monta (ou refaz) a grade da academia a partir das contagens das últimas 8 semanas.
export async function montarGradePelasContagens(academiaId: string): Promise<Resultado & { ok?: string }> {
  const semAcesso = await semAcessoAAcademia(academiaId);
  if (semAcesso) return { erro: semAcesso };
  const supabase = await createClient();
  const aulas = await gradePelasContagens(supabase, academiaId);
  if (aulas.length === 0) return { erro: "Não há contagens nas últimas 8 semanas para montar a grade." };
  // Já tem grade: a atual é encerrada ontem (fica no histórico) e a nova vale a partir de hoje.
  // Primeira grade: vale desde o início das 8 semanas analisadas.
  const { data: vigentes } = await supabase.from("grade_aulas").select("id").eq("academia_id", academiaId).is("vigente_ate", null);
  const dataHoje = hoje();
  if (vigentes?.length) {
    const { error: erroEncerrar } = await supabase
      .from("grade_aulas")
      .update({ vigente_ate: somarDias(dataHoje, -1) })
      .eq("academia_id", academiaId)
      .is("vigente_ate", null)
      .lt("vigente_de", dataHoje);
    if (erroEncerrar) return { erro: mensagemErro(erroEncerrar) };
    await supabase.from("grade_aulas").delete().eq("academia_id", academiaId).is("vigente_ate", null); // as que começavam hoje
  }
  const { error } = await supabase
    .from("grade_aulas")
    .insert(aulas.map((a) => ({ ...a, academia_id: academiaId, vigente_de: vigentes?.length ? dataHoje : a.vigente_de })));
  if (error) return { erro: mensagemErro(error) };
  revalidatePath("/academias", "layout");
  refresh();
  return { ok: `Grade montada com ${aulas.length} aulas. Confira os professores e as durações.` };
}

type Tabela = "funcionarios" | "modalidades" | "datas_importantes" | "grade_aulas";

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
