import { AVISO_TODAS, contextoAcademias } from "@/lib/contexto";
import { hoje, intervaloDoMes, lerMes } from "@/lib/planilha";
import { AbasAcademias, SeletorMes } from "./AbasAcademias";
import { SemAcademias } from "./SemAcademias";
import { diasDeAulas } from "@/lib/contagemPorDia";
import {
  ContagemPorDia,
  ContagemPorDiaTodas,
  type DiaTodas,
} from "./frequencia/ContagemPorDia";
import { salvarDiaDeAulas } from "./lancamentos";
import { Planilha, type Coluna, type Linha, type Resultado } from "./Planilha";

type Registro = Record<string, unknown> & {
  id: string;
  academia_id: string;
  data: string;
};

// Converte cada valor do banco em texto para a planilha (vazio vira null).
function paraLinha(registro: Registro, colunas: Coluna[]): Linha {
  const linha: Linha = { id: registro.id };
  for (const c of colunas) {
    const v = registro[c.campo];
    linha[c.campo] = v === null || v === undefined ? null : String(v);
  }
  return { ...linha, academia_id: registro.academia_id };
}

// Aba "Todas" das contagens de coletivas/lutas: os dias de cada unidade somados por data.
async function diasDeTodas(
  supabase: Parameters<typeof diasDeAulas>[0],
  academias: { id: string; nome: string }[],
  tipo: "coletivas" | "lutas",
  mes: string,
): Promise<DiaTodas[]> {
  const porUnidade = await Promise.all(
    academias.map(async (a) => ({
      nome: a.nome,
      dias: await diasDeAulas(supabase, a.id, tipo, mes),
    })),
  );
  const porData = new Map<string, DiaTodas>();
  for (const u of porUnidade)
    for (const dia of u.dias) {
      const d = porData.get(dia.data) ?? {
        data: dia.data,
        feriado: false,
        previstas: 0,
        lancadas: 0,
        alunos: 0,
        unidades: [],
      };
      d.feriado ||= Boolean(dia.feriado);
      d.previstas += dia.previstas;
      d.lancadas += dia.lancadas;
      d.alunos += dia.alunos;
      d.unidades.push({ nome: u.nome, dia });
      porData.set(dia.data, d);
    }
  return [...porData.values()].sort((a, b) => b.data.localeCompare(a.data));
}

// Tela padrão dos lançamentos por academia e por mês (vendas e frequência): abas das
// academias, navegação por mês e a planilha do mês. Na aba "Todas" só dá para consultar;
// lançamentos são sempre da academia da aba aberta.
export async function TelaMensal({
  searchParams,
  titulo,
  descricao,
  caminho,
  tabela,
  colunas,
  ordem,
  salvar,
  excluir,
  rotuloNovo,
  padroesNovo = {},
  usaModalidades = false,
  professores,
  calcular,
  agruparPorDia,
}: {
  searchParams: Promise<{ academia?: string; mes?: string }>;
  titulo: string;
  descricao: string;
  caminho: string;
  tabela: string;
  colunas: Coluna[];
  ordem: string[];
  salvar: (
    academiaId: string,
    id: string | null,
    dados: Record<string, string>,
  ) => Promise<Resultado>;
  excluir: (id: string) => Promise<Resultado>;
  rotuloNovo: string;
  padroesNovo?: Record<string, string>;
  // A coluna "modalidade" vira uma lista com as modalidades cadastradas na academia da aba.
  usaModalidades?: boolean;
  // A coluna "professor" vira uma lista com os funcionários da academia deste departamento.
  professores?: "professor_coletivas" | "professor_lutas";
  // Colunas "calculado" montadas a partir dos valores gravados na linha.
  calcular?: (
    registro: Record<string, unknown>,
  ) => Record<string, number | null>;
  // Contagem de coletivas/lutas: agrupada por dia, com a grade do dia e as quantidades (na aba da academia).
  agruparPorDia?: "coletivas" | "lutas";
}) {
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(
    params.academia,
  );
  const mes = lerMes(params.mes);
  const { inicio, fim } = intervaloDoMes(mes);

  let consulta = supabase
    .from(tabela)
    .select("*")
    .gte("data", inicio)
    .lte("data", fim);
  if (selecionada) consulta = consulta.eq("academia_id", selecionada);
  // Da data (e horário) mais próxima de hoje para a mais antiga; no mesmo dia e horário, a última incluída primeiro.
  for (const campo of ordem)
    consulta = consulta.order(campo, { ascending: false });
  if (!ordem.includes("created_at"))
    consulta = consulta.order("created_at", { ascending: false });
  const { data } = await consulta;
  const registros = (data ?? []) as Registro[];

  // Listas vindas dos cadastros da academia ("Academias" → academia).
  let modalidades: string[] = [];
  if (usaModalidades && selecionada) {
    const { data: lista } = await supabase
      .from("modalidades")
      .select("nome")
      .eq("academia_id", selecionada)
      .order("nome");
    modalidades = (lista ?? []).map((m) => m.nome as string);
  }
  let listaProfessores: string[] = [];
  if (professores && selecionada) {
    const { data: lista } = await supabase
      .from("funcionarios")
      .select("nome")
      .eq("academia_id", selecionada)
      .eq("departamento", professores)
      .eq("ativo", true)
      .order("nome");
    listaProfessores = (lista ?? []).map((f) => f.nome as string);
  }

  const linhas = registros.map((r) =>
    paraLinha(calcular ? { ...r, ...calcular(r) } : r, colunas),
  );

  const colunasComListas: Coluna[] = colunas.map((c) => {
    if (usaModalidades && selecionada && c.campo === "modalidade")
      return {
        ...c,
        tipo: "opcoes",
        opcoes: modalidades.map((m) => ({ valor: m, rotulo: m })),
      };
    if (professores && selecionada && c.campo === "professor")
      return {
        ...c,
        tipo: "opcoes",
        opcoes: listaProfessores.map((n) => ({ valor: n, rotulo: n })),
      };
    return c;
  });
  const nomeSelecionada = academias.find((a) => a.id === selecionada)?.nome;

  // Na visão de todas as academias, a primeira coluna mostra de qual academia é cada linha.
  const colunasDaTela: Coluna[] = selecionada
    ? colunasComListas
    : [
        {
          campo: "academia_id",
          rotulo: "Academia",
          tipo: "opcoes",
          largura: "w-36",
          opcoes: academias.map((a) => ({ valor: a.id, rotulo: a.nome })),
        },
        ...colunasComListas,
      ];

  const avisoCadastro = (falta: string) => (
    <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
      {falta} para {nomeSelecionada}. Cadastre em Academias → {nomeSelecionada}{" "}
      para escolher na lista.
    </p>
  );

  // Planilha do mês (em coletivas/lutas na aba da academia, fica dentro de "Lista completa do mês").
  const planilha = (
    <Planilha
      colunas={colunasDaTela}
      linhas={linhas}
      salvar={salvar.bind(null, selecionada ?? "")}
      excluir={admin ? excluir : undefined}
      padroesNovo={{
        data: mes === hoje().slice(0, 7) ? hoje() : inicio,
        ...padroesNovo,
      }}
      rotuloNovo={rotuloNovo}
      vazio={
        selecionada
          ? `Nenhum lançamento neste mês. Clique em “${rotuloNovo}” para incluir.`
          : "Nenhum lançamento neste mês."
      }
      somenteLeitura={selecionada ? undefined : AVISO_TODAS}
      barra={<SeletorMes caminho={caminho} academia={selecionada} mes={mes} />}
    />
  );

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">{descricao}</p>

      {academias.length === 0 ? (
        <SemAcademias admin={admin} />
      ) : (
        <>
          <AbasAcademias
            academias={academias}
            selecionada={selecionada}
            caminho={caminho}
          />
          {usaModalidades &&
            selecionada &&
            modalidades.length === 0 &&
            avisoCadastro("Nenhuma modalidade cadastrada")}
          {professores &&
            selecionada &&
            listaProfessores.length === 0 &&
            avisoCadastro(
              `Nenhum funcionário do departamento “${professores === "professor_lutas" ? "Professor de lutas" : "Professor de coletivas"}” cadastrado`,
            )}
          {agruparPorDia && selecionada && (
            <div className="mb-4 space-y-3">
              <SeletorMes caminho={caminho} academia={selecionada} mes={mes} />
              <ContagemPorDia
                dias={await diasDeAulas(
                  supabase,
                  selecionada,
                  agruparPorDia,
                  mes,
                )}
                salvar={salvarDiaDeAulas.bind(null, selecionada, agruparPorDia)}
                somenteLeitura={false}
              />
            </div>
          )}
          {agruparPorDia && selecionada ? (
            <details className="rounded-lg border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                Lista completa do mês (aula fora da grade, excluir lançamento)
              </summary>
              <div className="mt-3">{planilha}</div>
            </details>
          ) : null}
          {agruparPorDia && !selecionada && (
            <div className="mb-4 space-y-3">
              <SeletorMes caminho={caminho} academia={null} mes={mes} />
              <ContagemPorDiaTodas
                dias={await diasDeTodas(
                  supabase,
                  academias,
                  agruparPorDia,
                  mes,
                )}
              />
              <details className="rounded-lg border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  Lista completa do mês
                </summary>
                <div className="mt-3">{planilha}</div>
              </details>
            </div>
          )}
          {!agruparPorDia && planilha}
        </>
      )}
    </div>
  );
}
