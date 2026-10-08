import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { hoje, lerMes } from "@/lib/planilha";
import { AbasAcademias } from "../AbasAcademias";
import { SemAcademias } from "../SemAcademias";
import { CabecalhoRelatorio, nomeDoMes, TabelaRelatorio } from "../relatorios/comum";
import { ConferenciaPagamentos, type ConferenciaExibida } from "./ConferenciaPagamentos";

// Módulo Financeiro: conferência dos pagamentos por academia e mês dos vencimentos. O financeiro envia o lote
// (pasta compactada em .zip) e o Claude confere pelo Prompt Mestre (LIBERAR / SEGURAR / CORRIGIR).
// Na aba "Todas", a situação de cada academia no mês.

type Linha = {
  id: string;
  academia_id: string;
  mes: string;
  status: ConferenciaExibida["status"];
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

const SITUACAO = {
  conferida: { rotulo: "Conferida", cor: "bg-emerald-100 text-emerald-800" },
  processando: { rotulo: "Conferindo", cor: "bg-amber-100 text-amber-900" },
  erro: { rotulo: "Incompleta", cor: "bg-red-100 text-red-800" },
  pendente: { rotulo: "Nenhum lote", cor: "bg-slate-100 text-slate-600" },
} as const;
function Situacao({ linha }: { linha: Linha | null }) {
  const s = SITUACAO[!linha ? "pendente" : interrompida(linha) ? "erro" : linha.status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.rotulo}</span>;
}

// A decisão executiva em uma linha: os valores de LIBERAR / SEGURAR achados na tabela do relatório.
function resumo(relatorio: string | null) {
  if (!relatorio) return "—";
  const valor = (rotulo: string) => {
    const linha = relatorio.split("\n").find((l) => l.startsWith("|") && l.toUpperCase().includes(rotulo));
    // O total é o último valor da linha (com ou sem "R$"), ex.: "| **LIBERAR** | itens | **25.774,41** |".
    const total = linha?.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g)?.pop();
    return total ? `R$ ${total}` : null;
  };
  const partes = [["Liberar", valor("LIBERAR")], ["Segurar", valor("SEGURAR")]].filter(([, v]) => v).map(([r, v]) => `${r} ${v}`);
  return partes.length ? partes.join(" · ") : "—";
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
  consulta = selecionada ? consulta.eq("academia_id", selecionada).limit(60) : consulta.eq("mes", mes);
  const { data } = await consulta;
  const linhas = (data ?? []) as Linha[];
  const ids = [...new Set(linhas.map((l) => l.criado_por).filter((x): x is string => Boolean(x)))];
  const { data: perfis } = ids.length ? await supabase.from("profiles").select("id, nome").in("id", ids) : { data: [] };
  const nome = (id: string | null) => (perfis ?? []).find((p) => p.id === id)?.nome ?? "";

  // Na tela: a conferência escolhida no histórico ou a mais recente do mês.
  const exibidaLinha = (ver && linhas.find((l) => l.id === ver)) || linhas.find((l) => l.mes === mes) || null;
  const exibida: ConferenciaExibida | null = exibidaLinha && {
    id: exibidaLinha.id,
    status: exibidaLinha.status,
    relatorio: exibidaLinha.relatorio,
    arquivoNome: exibidaLinha.arquivo_nome,
    criadoEm: exibidaLinha.criado_em,
    criadoPor: nome(exibidaLinha.criado_por),
    interrompida: interrompida(exibidaLinha),
  };

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
                valor: (u) => (
                  <Link href={`${caminho}?academia=${u.id}&mes=${mes}`} className="font-medium text-marca underline">
                    {u.nome}
                  </Link>
                ),
                alinhar: "esquerda",
              },
              { rotulo: "Situação", valor: (u) => <Situacao linha={linhas.find((l) => l.academia_id === u.id) ?? null} />, alinhar: "esquerda" },
              { rotulo: "Lotes no mês", valor: (u) => linhas.filter((l) => l.academia_id === u.id).length || "—" },
              { rotulo: "Último lote", valor: (u) => resumo(linhas.find((l) => l.academia_id === u.id)?.relatorio ?? null), alinhar: "esquerda" },
            ]}
            linhas={academias}
            chave={(u) => u.id}
            vazio="Nenhuma academia."
          />
          <p className="mt-2 text-xs text-slate-500">Abra a aba da academia para enviar um lote e conferir.</p>
        </section>
      ) : (
        <>
          <ConferenciaPagamentos
            key={`${selecionada}-${mes}-${exibida?.id ?? ""}`}
            academiaId={selecionada}
            mes={mes}
            mesTexto={nomeDoMes(mes)}
            exibida={exibida}
            chaveConfigurada={Boolean(process.env.ANTHROPIC_API_KEY)}
          />

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Histórico desta academia</h2>
            <TabelaRelatorio
              colunas={[
                { rotulo: "Mês", valor: (l) => <span className="capitalize">{nomeDoMes(l.mes)}</span>, alinhar: "esquerda" },
                { rotulo: "Lote", valor: (l) => `${l.arquivo_nome} (${l.inventario?.length ?? 0} arquivos)`, alinhar: "esquerda" },
                { rotulo: "Situação", valor: (l) => <Situacao linha={l} />, alinhar: "esquerda" },
                { rotulo: "Decisão", valor: (l) => resumo(l.relatorio), alinhar: "esquerda" },
                { rotulo: "Conferida em", valor: (l) => `${quando(l.criado_em)}${nome(l.criado_por) ? ` · ${nome(l.criado_por)}` : ""}`, alinhar: "esquerda" },
                {
                  rotulo: "Relatório",
                  valor: (l) =>
                    l.relatorio ? (
                      <span className="flex gap-3">
                        <Link href={`${caminho}?academia=${selecionada}&mes=${l.mes}&ver=${l.id}`} className="text-marca underline">
                          Ver
                        </Link>
                        <a href={`${caminho}/relatorio?id=${l.id}`} target="_blank" rel="noreferrer" className="text-marca underline">
                          PDF
                        </a>
                      </span>
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
