import type { Aniversariante } from "@/lib/aniversarios";
import { contextoAcademias } from "@/lib/contexto";
import { dadosDoFechamento, diaCurto, mesDeFechamento, mesesDisponiveis, nomeDoMes, type DataImportante } from "@/lib/fechamento";
import { AbasAcademias } from "../../AbasAcademias";
import { SemAcademias } from "../../SemAcademias";
import { CabecalhoRelatorio, TabelaRelatorio, type ColunaRelatorio } from "../comum";
import { enviarFechamento } from "./actions";
import { BotaoFechamento } from "./BotaoFechamento";

type Contagem = { data: string; contagem: string; horarios: string[] };

const COLUNAS_ANIVERSARIO: ColunaRelatorio<Aniversariante>[] = [
  { rotulo: "Dia", valor: (a) => diaCurto(a.dia), alinhar: "esquerda" },
  { rotulo: "Nome", valor: (a) => a.nome, alinhar: "esquerda", destaque: true },
  { rotulo: "Departamento", valor: (a) => a.departamento, alinhar: "esquerda" },
  { rotulo: "Idade", valor: (a) => a.idade },
];
const COLUNAS_DIARIO: ColunaRelatorio<string>[] = [{ rotulo: "Dia", valor: (d) => diaCurto(d), alinhar: "esquerda" }];
const COLUNAS_CONTAGEM: ColunaRelatorio<Contagem>[] = [
  { rotulo: "Dia", valor: (c) => diaCurto(c.data), alinhar: "esquerda" },
  { rotulo: "Contagem", valor: (c) => c.contagem, alinhar: "esquerda" },
  { rotulo: "Horários faltando", valor: (c) => c.horarios.join(", "), alinhar: "esquerda" },
];

const COR_SITUACAO: Record<string, string> = {
  Vencido: "bg-red-100 text-red-800",
  "Vence em breve": "bg-amber-100 text-amber-800",
  "Em dia": "bg-emerald-100 text-emerald-800",
  "Sem data": "bg-slate-100 text-slate-600",
};
const urgente = (d: DataImportante) => d.situacao === "Vencido" || d.situacao === "Vence em breve";
const COLUNAS_DATAS: ColunaRelatorio<DataImportante>[] = [
  { rotulo: "Item", valor: (d) => <span className={urgente(d) ? "font-semibold" : ""}>{d.item}</span>, alinhar: "esquerda" },
  { rotulo: "Vencimento", valor: (d) => (d.vencimento ? d.vencimento.split("-").reverse().join("/") : "—") },
  {
    rotulo: "Dias para vencer",
    valor: (d) => <span className={urgente(d) ? "font-semibold" : ""}>{d.dias === null ? "—" : d.dias}</span>,
  },
  {
    rotulo: "Situação",
    valor: (d) => <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[d.situacao]}`}>{d.situacao}</span>,
  },
];

// Fechamento do mês: escolhe o mês (do atual para trás) e, por unidade, abre o PDF e envia por e-mail
// para os usuários da unidade e os administradores. Traz os aniversariantes do mês seguinte e o que
// ficou sem preencher no mês (diário e contagens).
export default async function FechamentoDoMesPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const { supabase, academias, selecionada, admin, atual } = await contextoAcademias(params.academia);
  const mes = mesDeFechamento(params.mes);
  const unidades = selecionada ? academias.filter((a) => a.id === selecionada) : academias;
  const dados = await Promise.all(unidades.map((u) => dadosDoFechamento(supabase, u.id, mes)));

  return (
    <div>
      <CabecalhoRelatorio
        titulo="Fechamento do mês"
        periodo={nomeDoMes(mes)}
        filtros={
          <form className="flex flex-wrap items-center gap-2">
            {selecionada && <input type="hidden" name="academia" value={selecionada} />}
            <label htmlFor="mes" className="text-slate-600">
              Mês do fechamento:
            </label>
            <select id="mes" name="mes" defaultValue={mes} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 capitalize">
              {mesesDisponiveis().map((m) => (
                <option key={m} value={m}>
                  {nomeDoMes(m)}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">
              Ver
            </button>
          </form>
        }
      />

      {academias.length === 0 ? (
        <SemAcademias admin={admin} />
      ) : (
        <>
          <div className="print:hidden">
            <AbasAcademias academias={academias} selecionada={selecionada} mes={mes} seletorMes={false} caminho="/relatorios/fechamento" />
          </div>
          <div className="space-y-8">
            {unidades.map((unidade, i) => {
              const d = dados[i];
              const podeEnviar = admin || atual?.academiaId === unidade.id;
              return (
                <section key={unidade.id} className="break-inside-avoid-page rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{unidade.nome}</h2>
                      <p className="text-sm text-slate-600">Fechamento de {nomeDoMes(mes)}</p>
                    </div>
                    {podeEnviar && (
                      <BotaoFechamento
                        enviar={enviarFechamento.bind(null, unidade.id, mes)}
                        pdf={`/relatorios/fechamento/pdf?academia=${unidade.id}&mes=${mes}`}
                        confirmacao={`Executar o fechamento de ${nomeDoMes(mes)} de ${unidade.nome}? O PDF abre numa nova aba e vai por e-mail para os usuários da unidade e o administrador.`}
                      />
                    )}
                  </div>
                  <h3 className="mb-2 text-sm font-semibold text-marca">
                    Aniversariantes de <span className="capitalize">{nomeDoMes(d.proximoMes)}</span> ({d.aniversariantes.length})
                  </h3>
                  <TabelaRelatorio
                    colunas={COLUNAS_ANIVERSARIO}
                    linhas={d.aniversariantes}
                    chave={(a) => `${a.nome}-${a.dia}`}
                    vazio="Nenhum aniversariante no mês (ou sem data de nascimento no cadastro de funcionários)."
                  />
                  <h3 className="mb-2 mt-5 text-sm font-semibold text-marca">Dias sem lançamento no diário ({d.semDiario.length})</h3>
                  <TabelaRelatorio colunas={COLUNAS_DIARIO} linhas={d.semDiario} chave={(x) => x} vazio="Todos os dias do mês foram lançados no diário." />
                  <h3 className="mb-2 mt-5 text-sm font-semibold text-marca">Contagens não feitas ({d.contagens.length})</h3>
                  <TabelaRelatorio
                    colunas={COLUNAS_CONTAGEM}
                    linhas={d.contagens}
                    chave={(c) => `${c.data}-${c.contagem}`}
                    vazio="Todas as contagens do mês foram feitas."
                  />
                  <h3 className="mb-2 mt-5 text-sm font-semibold text-marca">
                    Datas importantes{" "}
                    {d.datas.some(urgente) && (
                      <span className="ml-1 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        {d.datas.filter(urgente).length} vencidas ou vencendo em 30 dias
                      </span>
                    )}
                  </h3>
                  <TabelaRelatorio
                    colunas={COLUNAS_DATAS}
                    linhas={d.datas}
                    chave={(x) => x.item}
                    vazio="Nenhuma data importante cadastrada (Academias → unidade → Datas importantes)."
                  />
                  {(
                    [
                      ["CREF dos professores", "vencidos ou vencendo em 30 dias", d.crefs, "Nenhum professor de sala ou de coletivas ativo."],
                      ["Limite para tirar férias", "vencidas ou vencendo em 60 dias", d.ferias, "Nenhum funcionário ativo."],
                    ] as const
                  ).map(([titulo, legenda, linhas, vazio]) => (
                    <div key={titulo}>
                      <h3 className="mb-2 mt-5 text-sm font-semibold text-marca">
                        {titulo}{" "}
                        {linhas.some(urgente) && (
                          <span className="ml-1 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                            {linhas.filter(urgente).length} {legenda}
                          </span>
                        )}
                      </h3>
                      <TabelaRelatorio colunas={COLUNAS_DATAS} linhas={[...linhas]} chave={(x) => x.item} vazio={vazio} />
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500 print:hidden">
            No mês atual, os dias sem lançamento e as contagens não feitas são contados só até ontem.
          </p>
        </>
      )}
    </div>
  );
}
