import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { hoje, lerMes } from "@/lib/planilha";
import { decisaoDoRelatorio, periodoDoFluxo, resumoDaDecisao } from "@/lib/resumoConferencia";
import { AbasAcademias } from "../AbasAcademias";
import { SemAcademias } from "../SemAcademias";
import { CabecalhoRelatorio, nomeDoMes, TabelaRelatorio } from "../relatorios/comum";
import { ConferenciaPagamentos, type LoteConferido } from "./ConferenciaPagamentos";

// Módulo Financeiro: conferência dos pagamentos por academia e mês dos vencimentos. Os pagamentos são semanais: o
// financeiro envia o lote de cada semana (pasta compactada em .zip) e o Claude confere pelo Prompt Mestre
// (LIBERAR / SEGURAR / CORRIGIR). No mês, cada lote aparece fechado com o período do fluxo e a decisão; ao clicar,
// abre o relatório completo. Na aba "Todas", os lotes do mês de cada academia.

type Linha = {
  id: string;
  academia_id: string;
  mes: string;
  status: LoteConferido["status"];
  relatorio: string | null;
  arquivo_nome: string;
  inventario: { nome: string; lido: boolean }[];
  criado_em: string;
  criado_por: string | null;
};

// Conferência parada em "processando" por mais que isso foi interrompida (o servidor encerra em ~13 min).
const INTERROMPIDA_MS = 15 * 60 * 1000;
const interrompida = (l: Linha) => l.status === "processando" && Date.now() - Date.parse(l.criado_em) > INTERROMPIDA_MS;
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const periodoTexto = (l: Linha) => {
  const p = periodoDoFluxo(l.relatorio);
  return p ? `${p.inicio} a ${p.fim}` : null;
};
// Ordem dos lotes: o fluxo mais recente primeiro (pela data final do fluxo; sem período, pela data da conferência).
const chaveOrdem = (l: Linha) => {
  const p = periodoDoFluxo(l.relatorio);
  return p ? `${l.mes}|${p.fim.slice(3, 5)}${p.fim.slice(0, 2)}|${l.criado_em}` : `${l.mes}|9999|${l.criado_em}`;
};

const SITUACAO = {
  conferida: { rotulo: "Conferida", cor: "bg-emerald-100 text-emerald-800" },
  processando: { rotulo: "Conferindo", cor: "bg-amber-100 text-amber-900" },
  erro: { rotulo: "Incompleta", cor: "bg-red-100 text-red-800" },
} as const;
function Situacao({ linha }: { linha: Linha }) {
  const s = SITUACAO[interrompida(linha) ? "erro" : linha.status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.rotulo}</span>;
}

export default async function FinanceiroPage({ searchParams }: PageProps<"/financeiro">) {
  await exigirModulo("financeiro");
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(typeof params.academia === "string" ? params.academia : undefined);
  const mes = typeof params.mes === "string" ? lerMes(params.mes) : hoje().slice(0, 7);
  const ver = typeof params.ver === "string" ? params.ver : null;
  const caminho = "/financeiro";
  const titulo = "Conferência de pagamentos";

  if (academias.length === 0)
    return (
      <div>
        <CabecalhoRelatorio titulo={titulo} periodo={nomeDoMes(mes)} />
        <SemAcademias admin={admin} />
      </div>
    );

  let consulta = supabase
    .from("pagamentos_conferencias")
    .select("id, academia_id, mes, status, relatorio, arquivo_nome, inventario, criado_em, criado_por")
    .order("criado_em", { ascending: false });
  consulta = selecionada ? consulta.eq("academia_id", selecionada).limit(120) : consulta.eq("mes", mes);
  const { data } = await consulta;
  const linhas = ((data ?? []) as Linha[]).sort((a, b) => chaveOrdem(b).localeCompare(chaveOrdem(a)));
  const ids = [...new Set(linhas.map((l) => l.criado_por).filter((x): x is string => Boolean(x)))];
  const { data: perfis } = ids.length ? await supabase.from("profiles").select("id, nome").in("id", ids) : { data: [] };
  const nome = (id: string | null) => (perfis ?? []).find((p) => p.id === id)?.nome ?? "";
  const nomeAcademia = (id: string) => academias.find((a) => a.id === id)?.nome ?? "";

  const doMes = linhas.filter((l) => l.mes === mes);
  const lotes: LoteConferido[] = doMes.map((l) => {
    const d = decisaoDoRelatorio(l.relatorio);
    return {
      id: l.id,
      status: l.status,
      relatorio: l.relatorio,
      arquivoNome: l.arquivo_nome,
      criadoEm: l.criado_em,
      criadoPor: nome(l.criado_por),
      interrompida: interrompida(l),
      periodo: periodoTexto(l),
      liberar: d.liberar,
      segurar: d.segurar,
      arquivos: l.inventario?.length ?? 0,
    };
  });
  // Meses anteriores desta academia: um resumo por mês, com o link para abrir os lotes daquele mês.
  const outrosMeses = [...new Set(linhas.filter((l) => l.mes !== mes).map((l) => l.mes))].map((m) => ({ mes: m, lotes: linhas.filter((l) => l.mes === m) }));

  return (
    <div className="space-y-6">
      <CabecalhoRelatorio titulo={titulo} periodo={nomeDoMes(mes)} />
      <AbasAcademias academias={academias} selecionada={selecionada} mes={mes} caminho={caminho} />

      {!selecionada ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Lotes conferidos em {nomeDoMes(mes)}</h2>
          <TabelaRelatorio
            colunas={[
              {
                rotulo: "Academia",
                valor: (l) => (
                  <Link href={`${caminho}?academia=${l.academia_id}&mes=${mes}&ver=${l.id}`} className="font-medium text-marca underline">
                    {nomeAcademia(l.academia_id)}
                  </Link>
                ),
                alinhar: "esquerda",
              },
              { rotulo: "Fluxo", valor: (l) => (periodoTexto(l) ? `${periodoTexto(l)}` : l.arquivo_nome), alinhar: "esquerda" },
              { rotulo: "Situação", valor: (l) => <Situacao linha={l} />, alinhar: "esquerda" },
              { rotulo: "Decisão", valor: (l) => resumoDaDecisao(l.relatorio), alinhar: "esquerda" },
              { rotulo: "Conferido em", valor: (l) => quando(l.criado_em), alinhar: "esquerda" },
            ]}
            linhas={[...doMes].sort((a, b) => nomeAcademia(a.academia_id).localeCompare(nomeAcademia(b.academia_id)) || chaveOrdem(b).localeCompare(chaveOrdem(a)))}
            chave={(l) => l.id}
            vazio="Nenhum lote conferido neste mês."
          />
          <p className="mt-2 text-xs text-slate-500">Clique na academia para abrir o relatório do lote. Para enviar um lote novo, abra a aba da academia.</p>
        </section>
      ) : (
        <>
          <ConferenciaPagamentos
            key={`${selecionada}-${mes}`}
            academiaId={selecionada}
            mes={mes}
            mesTexto={nomeDoMes(mes)}
            lotes={lotes}
            aberto={ver}
            chaveConfigurada={Boolean(process.env.ANTHROPIC_API_KEY)}
          />

          {outrosMeses.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Outros meses desta academia</h2>
              <TabelaRelatorio
                colunas={[
                  {
                    rotulo: "Mês",
                    valor: (m) => (
                      <Link href={`${caminho}?academia=${selecionada}&mes=${m.mes}`} className="font-medium capitalize text-marca underline">
                        {nomeDoMes(m.mes)}
                      </Link>
                    ),
                    alinhar: "esquerda",
                  },
                  { rotulo: "Lotes", valor: (m) => m.lotes.length },
                  {
                    rotulo: "Fluxos",
                    valor: (m) =>
                      m.lotes
                        .map((l) => periodoTexto(l))
                        .filter(Boolean)
                        .reverse()
                        .join(" · ") || "—",
                    alinhar: "esquerda",
                  },
                ]}
                linhas={outrosMeses}
                chave={(m) => m.mes}
                vazio=""
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
