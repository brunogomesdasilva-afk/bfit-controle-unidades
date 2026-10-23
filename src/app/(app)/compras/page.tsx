import { createClient } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth";
import { APROVACAO_COMPRA, type Academia, type Compra } from "@/lib/database.types";
import { hoje } from "@/lib/planilha";
import { AbasAcademias, lerSituacao } from "../AbasAcademias";
import { SemAcademias } from "../SemAcademias";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import Link from "next/link";
import { alterarAprovacaoCompra, excluirCompra, salvarCompra } from "./actions";

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string; situacao?: string; aprovacao?: string }>;
}) {
  const atual = await getPerfilAtual();
  const { academia, situacao: situacaoUrl, aprovacao: aprovacaoUrl } = await searchParams;
  // "Aguardando aprovação" (aviso de quem aprova): só as compras ainda pendentes de aprovação.
  const soAguardando = aprovacaoUrl === "pendente";
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
    .from("compras")
    .select("*")
    .order("data_solicitacao", { ascending: false })
    .order("created_at", { ascending: false });
  if (selecionada) consulta = consulta.eq("academia_id", selecionada);
  // Concluído = data de efetivação preenchida. Por padrão a tela mostra só as pendentes.
  if (filtroSituacao === "pendente") consulta = consulta.is("data_efetivacao", null);
  if (filtroSituacao === "concluido") consulta = consulta.not("data_efetivacao", "is", null);
  if (soAguardando) consulta = consulta.eq("aprovacao", "pendente");
  // Aguardando aprovação: compras ainda não efetivadas e com aprovação pendente (em todas as academias que a pessoa vê).
  const [{ data }, { data: podeAprovar }, { count: aguardando }] = await Promise.all([
    consulta,
    supabase.rpc("pode_aprovar_compras"),
    supabase.from("compras").select("id", { count: "exact", head: true }).eq("aprovacao", "pendente").is("data_efetivacao", null),
  ]);

  const dataHoje = hoje();
  const linhas: Linha[] = ((data ?? []) as Compra[]).map((c) => ({
    id: c.id,
    academia_id: c.academia_id,
    data_solicitacao: c.data_solicitacao,
    descricao: c.descricao,
    necessario_ate: c.necessario_ate,
    data_efetivacao: c.data_efetivacao,
    situacao: c.data_efetivacao ? "Concluído" : "Pendente",
    aprovacao: c.aprovacao ?? "pendente",
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
    // Automática: o dia em que a compra foi incluída; não pode ser alterada.
    { campo: "data_solicitacao", rotulo: "Data da solicitação", tipo: "data", fixa: true, largura: "w-40" },
    { campo: "descricao", rotulo: "O que é a compra", tipo: "texto", obrigatorio: true, largura: "min-w-64" },
    { campo: "necessario_ate", rotulo: "Necessário para", tipo: "data", largura: "w-40" },
    { campo: "data_efetivacao", rotulo: "Data da efetivação", tipo: "data", largura: "w-40" },
    { campo: "situacao", rotulo: "Situação", tipo: "situacao", largura: "w-28" },
    // Só quem aprova compras (hoje, o Bruno) escolhe; para os demais aparece travada.
    {
      campo: "aprovacao",
      rotulo: "Aprovação",
      tipo: "opcoes",
      largura: "w-36",
      selo: true,
      fixa: !podeAprovar,
      opcoes: Object.entries(APROVACAO_COMPRA).map(([valor, rotulo]) => ({ valor, rotulo })),
    },
  ];

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Controle de compras</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">Solicitações de compra de cada academia e quando foram efetivadas.</p>

      {academias.length === 0 ? (
        <SemAcademias admin={atual?.perfil === "admin"} />
      ) : (
        <>
          <AbasAcademias
            academias={academias}
            selecionada={selecionada}
            situacao={filtroSituacao}
            caminho="/compras"
          />
          {podeAprovar && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="text-amber-900">
                {aguardando ? (
                  <>
                    <strong>{aguardando}</strong> {aguardando === 1 ? "compra aguardando" : "compras aguardando"} sua aprovação. Escolha a
                    aprovação direto na coluna <strong>Aprovação</strong>: grava na hora.
                  </>
                ) : (
                  "Nenhuma compra aguardando sua aprovação."
                )}
              </p>
              {soAguardando ? (
                <Link href="/compras" className="font-medium text-amber-900 underline">
                  Ver todas as compras
                </Link>
              ) : aguardando ? (
                <Link href="/compras?aprovacao=pendente" className="rounded-md bg-marca px-3 py-1.5 font-medium text-white hover:bg-marca-escuro">
                  Ver só as que aguardam
                </Link>
              ) : null}
            </div>
          )}
          <Planilha
            colunas={colunas}
            linhas={linhas}
            salvar={salvarCompra}
            excluir={atual?.perfil === "admin" ? excluirCompra : undefined}
            padroesNovo={{ data_solicitacao: dataHoje, academia_id: selecionada ?? "", aprovacao: "pendente" }}
            rotuloNovo="+ Nova compra"
            escolhaRapida={podeAprovar ? { campo: "aprovacao", salvar: alterarAprovacaoCompra } : undefined}
            somenteLeitura={
              // Quem aprova compras também altera na visão de todas as academias (para aprovar sem abrir cada aba).
              selecionada || podeAprovar
                ? undefined
                : "Visão de todas as academias: só consulta. Para incluir ou alterar, abra a aba da academia."
            }
            vazio={
              filtroSituacao === "pendente" && selecionada
                ? "Nenhuma compra pendente. Clique em “+ Nova compra” para incluir."
                : "Nenhum registro nesta situação."
            }
          />
        </>
      )}
    </div>
  );
}
