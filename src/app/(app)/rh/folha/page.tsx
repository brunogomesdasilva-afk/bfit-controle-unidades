import Link from "next/link";
import { aulasDoMes, type ResumoProfessor } from "@/lib/aulasDoMes";
import { exigirModulo, temModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { hoje, lerMes } from "@/lib/planilha";
import { AbasAcademias } from "../../AbasAcademias";
import { SemAcademias } from "../../SemAcademias";
import { CabecalhoRelatorio, moeda, nomeDoMes, TabelaRelatorio, type ColunaRelatorio } from "../../relatorios/comum";
import { ConferenciaFolha, type ConferenciaAtual } from "./ConferenciaFolha";

// Conferência da folha (menu RH), por academia e mês:
//   - aulas dos professores no mês (horas previstas pela grade sem feriados, faltas, coberturas e horas a
//     pagar; PJ com valor a pagar por fora da folha) e a planilha de coletivas em PDF;
//   - conferência da folha pelo Claude com os arquivos da folha, do ponto e do vale-transporte;
//   - fechamento da folha (registro do que foi aprovado) e histórico.
// Na aba "Todas", só a situação de cada academia no mês.

type Linha = {
  id: string;
  academia_id: string;
  mes: string;
  status: ConferenciaAtual["status"];
  relatorio: string | null;
  criado_em: string;
  criado_por: string | null;
  fechada_em: string | null;
  fechada_por: string | null;
};

// Conferência que fica parada em "processando" por mais que isso foi interrompida (o servidor encerra em ~13 min).
const INTERROMPIDA_MS = 15 * 60 * 1000;
const SITUACAO = {
  fechada: { rotulo: "Fechada", cor: "bg-emerald-100 text-emerald-800" },
  conferida: { rotulo: "Conferida, aguardando fechamento", cor: "bg-sky-100 text-sky-800" },
  processando: { rotulo: "Conferindo", cor: "bg-amber-100 text-amber-900" },
  erro: { rotulo: "Conferência incompleta", cor: "bg-red-100 text-red-800" },
  pendente: { rotulo: "Pendente", cor: "bg-slate-100 text-slate-600" },
} as const;

const horas = (h: number) => (h ? `${h.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h` : "—");
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function Situacao({ status }: { status: keyof typeof SITUACAO }) {
  const s = SITUACAO[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.rotulo}</span>;
}

// A conferência que vale para o mês: a fechada, se houver; senão a mais recente.
function principal(linhas: Linha[]) {
  return linhas.find((l) => l.status === "fechada") ?? linhas[0] ?? null;
}
const interrompida = (l: Linha) => l.status === "processando" && Date.now() - Date.parse(l.criado_em) > INTERROMPIDA_MS;
const situacaoDe = (l: Linha | null): keyof typeof SITUACAO => (!l ? "pendente" : interrompida(l) ? "erro" : l.status);

function colunasProfessores(lista: ResumoProfessor[]): ColunaRelatorio<ResumoProfessor>[] {
  const soma = (c: "previstas" | "faltou" | "cobriu" | "extras" | "aPagar") => horas(lista.reduce((t, p) => t + p[c], 0));
  return [
    { rotulo: "Professor", valor: (p) => p.professor, alinhar: "esquerda", destaque: true },
    {
      rotulo: "Vínculo",
      valor: (p) => (!p.cadastro ? <span className="text-amber-700">sem cadastro</span> : p.cadastro.pj ? "PJ" : "CLT"),
      alinhar: "esquerda",
    },
    { rotulo: "Previstas (grade)", valor: (p) => horas(p.previstas), total: soma("previstas") },
    { rotulo: "Faltou", valor: (p) => horas(p.faltou), total: soma("faltou") },
    { rotulo: "Cobertura", valor: (p) => horas(p.cobriu), total: soma("cobriu") },
    { rotulo: "Extras", valor: (p) => horas(p.extras), total: soma("extras") },
    { rotulo: "A pagar", valor: (p) => horas(p.aPagar), total: soma("aPagar"), destaque: true },
    {
      rotulo: "Valor hora",
      valor: (p) => (p.cadastro?.pj ? (p.cadastro.valorHora === null ? <span className="text-amber-700">sem valor</span> : moeda(p.cadastro.valorHora)) : "—"),
    },
    {
      rotulo: "Total (PJ)",
      valor: (p) => (p.cadastro?.pj ? moeda(p.total) : p.cadastro ? <span className="text-slate-500">na folha</span> : "—"),
      total: moeda(lista.reduce((t, p) => t + (p.total ?? 0), 0)),
      destaque: true,
    },
  ];
}

export default async function ConferenciaFolhaPage({ searchParams }: PageProps<"/rh/folha">) {
  const perfil = await exigirModulo("rh");
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(typeof params.academia === "string" ? params.academia : undefined);
  // Padrão: o mês anterior (o último mês fechado).
  const [a, m] = hoje().split("-").map(Number);
  const mesAnterior = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const mes = typeof params.mes === "string" ? lerMes(params.mes) : mesAnterior;
  const caminho = "/rh/folha";

  if (academias.length === 0)
    return (
      <div>
        <CabecalhoRelatorio titulo="Conferência da folha de pagamento" periodo={nomeDoMes(mes)} />
        <SemAcademias admin={admin} />
      </div>
    );

  // Conferências do mês (todas as academias que a pessoa vê) ou o histórico da academia escolhida.
  let consulta = supabase
    .from("folha_conferencias")
    .select("id, academia_id, mes, status, relatorio, criado_em, criado_por, fechada_em, fechada_por")
    .order("criado_em", { ascending: false });
  consulta = selecionada ? consulta.eq("academia_id", selecionada).limit(60) : consulta.eq("mes", mes);
  const [{ data }, aulas] = await Promise.all([consulta, selecionada ? aulasDoMes(supabase, selecionada, mes) : Promise.resolve(null)]);
  const linhas = (data ?? []) as Linha[];
  const ids = [...new Set(linhas.flatMap((l) => [l.criado_por, l.fechada_por]).filter((x): x is string => Boolean(x)))];
  const { data: perfis } = ids.length ? await supabase.from("profiles").select("id, nome").in("id", ids) : { data: [] };
  const nome = (id: string | null) => (perfis ?? []).find((p) => p.id === id)?.nome ?? "";

  const doMes = linhas.filter((l) => l.mes === mes);
  const atualLinha = principal(doMes);
  const atual: ConferenciaAtual | null = atualLinha && {
    id: atualLinha.id,
    status: atualLinha.status,
    relatorio: atualLinha.relatorio,
    criadoEm: atualLinha.criado_em,
    criadoPor: nome(atualLinha.criado_por),
    fechadaEm: atualLinha.fechada_em,
    fechadaPor: nome(atualLinha.fechada_por),
    interrompida: interrompida(atualLinha),
  };

  return (
    <div className="space-y-6">
      <CabecalhoRelatorio titulo="Conferência da folha de pagamento" periodo={nomeDoMes(mes)} />
      <AbasAcademias academias={academias} selecionada={selecionada} mes={mes} caminho={caminho} />

      {!selecionada ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Situação das academias em {nomeDoMes(mes)}</h2>
          <TabelaRelatorio
            colunas={[
              {
                rotulo: "Academia",
                valor: (u) => (
                  <Link href={`${caminho}?academia=${u.id}&mes=${mes}`} className="font-medium text-marca underline">
                    {u.nome}
                  </Link>
                ),
                alinhar: "esquerda",
              },
              { rotulo: "Situação", valor: (u) => <Situacao status={situacaoDe(principal(doMes.filter((l) => l.academia_id === u.id)))} />, alinhar: "esquerda" },
              {
                rotulo: "Última movimentação",
                valor: (u) => {
                  const l = principal(doMes.filter((x) => x.academia_id === u.id));
                  if (!l) return "—";
                  return l.status === "fechada" && l.fechada_em
                    ? `Fechada em ${quando(l.fechada_em)}${nome(l.fechada_por) ? ` por ${nome(l.fechada_por)}` : ""}`
                    : `Conferida em ${quando(l.criado_em)}${nome(l.criado_por) ? ` por ${nome(l.criado_por)}` : ""}`;
                },
                alinhar: "esquerda",
              },
            ]}
            linhas={academias}
            chave={(u) => u.id}
            vazio="Nenhuma academia."
          />
          <p className="mt-2 text-xs text-slate-500">Abra a aba da academia para conferir e fechar a folha dela.</p>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Conferência da folha</h2>
            <ConferenciaFolha
              key={`${selecionada}-${mes}`}
              academiaId={selecionada}
              mes={mes}
              mesTexto={nomeDoMes(mes)}
              atual={atual}
              podeReabrir={temModulo(perfil, "adm")}
              chaveConfigurada={Boolean(process.env.ANTHROPIC_API_KEY)}
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Aulas dos professores no mês</h2>
              <a
                href={`${caminho}/planilha?academia=${selecionada}&mes=${mes}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Planilha de coletivas (PDF)
              </a>
            </div>
            {aulas && !aulas.temGrade && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Esta academia ainda não tem grade de aulas: sem ela não há horas previstas. Monte a grade em{" "}
                <Link href={`/academias/${selecionada}/grade`} className="font-medium underline">
                  Grade de aulas
                </Link>
                .
              </p>
            )}
            {aulas?.quadros.map((q) => {
              const semCadastro = q.professores.filter((p) => !p.cadastro).map((p) => p.professor);
              const semValor = q.professores.filter((p) => p.cadastro?.pj && p.cadastro.valorHora === null).map((p) => p.professor);
              return (
                <div key={q.tipo} className="space-y-2">
                  <h3 className="text-sm font-semibold text-marca">{q.nome}</h3>
                  <TabelaRelatorio colunas={colunasProfessores(q.professores)} linhas={q.professores} chave={(p) => p.professor} vazio="Nenhuma aula no mês." />
                  {(semCadastro.length > 0 || semValor.length > 0) && (
                    <p className="text-xs text-amber-800">
                      {semCadastro.length > 0 && `Sem cadastro em Funcionários (não dá para saber se é PJ): ${semCadastro.join(", ")}. `}
                      {semValor.length > 0 && `PJ sem valor da hora no cadastro: ${semValor.join(", ")}. `}
                      <Link href={`/academias/${selecionada}/funcionarios`} className="underline">
                        Abrir Funcionários
                      </Link>
                    </p>
                  )}
                </div>
              );
            })}
            {aulas && (
              <p className="text-xs text-slate-500">
                Período {aulas.periodo.inicio.split("-").reverse().join("/")} a {aulas.periodo.fim.split("-").reverse().join("/")}
                {aulas.feriados.length ? ` · feriados sem aula: ${aulas.feriados.map((f) => `${f.data.slice(8, 10)}/${f.data.slice(5, 7)} ${f.nome}`).join(", ")}` : " · sem feriados no mês"}.
                Faltou = aulas dele dadas por outro professor (substituto na contagem) ou sem contagem. Professores CLT
                aparecem só para conferir as horas: recebem na folha.
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Histórico desta academia</h2>
            <TabelaRelatorio
              colunas={[
                { rotulo: "Mês", valor: (l) => <span className="capitalize">{nomeDoMes(l.mes)}</span>, alinhar: "esquerda" },
                { rotulo: "Situação", valor: (l) => <Situacao status={situacaoDe(l)} />, alinhar: "esquerda" },
                { rotulo: "Conferida em", valor: (l) => `${quando(l.criado_em)}${nome(l.criado_por) ? ` · ${nome(l.criado_por)}` : ""}`, alinhar: "esquerda" },
                { rotulo: "Fechada em", valor: (l) => (l.fechada_em ? `${quando(l.fechada_em)}${nome(l.fechada_por) ? ` · ${nome(l.fechada_por)}` : ""}` : "—"), alinhar: "esquerda" },
                {
                  rotulo: "Relatório",
                  valor: (l) =>
                    l.relatorio ? (
                      <a href={`${caminho}/relatorio?id=${l.id}`} target="_blank" rel="noreferrer" className="text-marca underline">
                        PDF
                      </a>
                    ) : (
                      "—"
                    ),
                  alinhar: "esquerda",
                },
              ]}
              linhas={linhas}
              chave={(l) => l.id}
              vazio="Nenhuma conferência ainda."
            />
          </section>
        </>
      )}
    </div>
  );
}
