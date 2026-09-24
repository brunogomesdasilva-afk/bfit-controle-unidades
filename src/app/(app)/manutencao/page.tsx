import { createClient } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth";
import { TIPOS_MANUTENCAO, type Academia, type Manutencao } from "@/lib/database.types";
import { hoje } from "@/lib/planilha";
import { AbasAcademias, lerSituacao } from "../AbasAcademias";
import { SemAcademias } from "../SemAcademias";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import { excluirManutencao, salvarManutencao } from "./actions";

export default async function ManutencaoPage({ searchParams }: { searchParams: Promise<{ academia?: string; situacao?: string }> }) {
  const atual = await getPerfilAtual();
  const { academia, situacao: situacaoUrl } = await searchParams;
  const filtroSituacao = lerSituacao(situacaoUrl);
  const supabase = await createClient();

  const { data: listaAcademias } = await supabase.from("academias").select("*").order("nome");
  const academias = (listaAcademias ?? []) as Academia[];
  // Quem só tem acesso a uma academia (usuário que não é administrador) já fica nela, sem abas.
  const selecionada = academias.some((a) => a.id === academia)
    ? academia!
    : academias.length === 1
      ? academias[0].id
      : null;

  let consulta = supabase
    .from("manutencoes")
    .select("*")
    .order("data_inclusao", { ascending: false })
    .order("created_at", { ascending: false });
  if (selecionada) consulta = consulta.eq("academia_id", selecionada);
  // Concluído = data de finalização preenchida. Por padrão a tela mostra só as pendentes.
  if (filtroSituacao === "pendente") consulta = consulta.is("data_finalizacao", null);
  if (filtroSituacao === "concluido") consulta = consulta.not("data_finalizacao", "is", null);
  const { data } = await consulta;

  const linhas: Linha[] = ((data ?? []) as Manutencao[]).map((m) => ({
    id: m.id,
    academia_id: m.academia_id,
    tipo: m.tipo,
    data_inclusao: m.data_inclusao,
    descricao: m.descricao,
    data_finalizacao: m.data_finalizacao,
    situacao: m.data_finalizacao ? "Concluído" : "Pendente",
  }));

  const colunas: Coluna[] = [
    {
      campo: "academia_id",
      rotulo: "Academia",
      tipo: "opcoes",
      obrigatorio: true,
      largura: "w-44",
      opcoes: academias.map((a) => ({ valor: a.id, rotulo: a.nome })),
      // Dentro da aba de uma academia, os lançamentos são sempre dela.
      fixa: selecionada !== null,
    },
    {
      campo: "tipo",
      rotulo: "Tipo",
      tipo: "opcoes",
      obrigatorio: true,
      largura: "w-36",
      opcoes: Object.entries(TIPOS_MANUTENCAO).map(([valor, rotulo]) => ({ valor, rotulo })),
    },
    // Automática: o dia em que a manutenção foi incluída; não pode ser alterada.
    { campo: "data_inclusao", rotulo: "Data de inclusão", tipo: "data", fixa: true, largura: "w-40" },
    { campo: "descricao", rotulo: "O que é a manutenção", tipo: "texto", obrigatorio: true, largura: "min-w-64" },
    { campo: "data_finalizacao", rotulo: "Data de finalização", tipo: "data", largura: "w-40" },
    { campo: "situacao", rotulo: "Situação", tipo: "situacao", largura: "w-28" },
  ];

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Controle de manutenção</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Manutenções prediais, preventivas e corretivas de cada academia.
      </p>

      {academias.length === 0 ? (
        <SemAcademias admin={atual?.perfil === "admin"} />
      ) : (
        <>
          <AbasAcademias
            academias={academias}
            selecionada={selecionada}
            situacao={filtroSituacao}
            caminho="/manutencao"
          />
          <Planilha
            colunas={colunas}
            linhas={linhas}
            salvar={salvarManutencao}
            excluir={atual?.perfil === "admin" ? excluirManutencao : undefined}
            padroesNovo={{ data_inclusao: hoje(), academia_id: selecionada ?? "" }}
            rotuloNovo="+ Nova manutenção"
            somenteLeitura={
              selecionada
                ? undefined
                : "Visão de todas as academias: só consulta. Para incluir ou alterar, abra a aba da academia."
            }
            vazio={
              filtroSituacao === "pendente" && selecionada
                ? "Nenhuma manutenção pendente. Clique em “+ Nova manutenção” para incluir."
                : "Nenhum registro nesta situação."
            }
          />
        </>
      )}
    </div>
  );
}
