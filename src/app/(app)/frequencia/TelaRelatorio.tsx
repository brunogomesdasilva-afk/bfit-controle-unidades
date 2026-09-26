import Link from "next/link";
import { contextoAcademias } from "@/lib/contexto";
import type { TipoRelatorio } from "@/lib/importacao";
import { hoje, intervaloDoMes } from "@/lib/planilha";
import { AbasAcademias } from "../AbasAcademias";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import { SemAcademias } from "../SemAcademias";
import { DesfazerImportacao, ImportarExcel } from "./ImportarExcel";
import { desfazerImportacao, importarRelatorio } from "./importar";

const POR_PAGINA = 100;

// Quem importou pode desfazer a própria importação nos primeiros 15 minutos (a regra também está no banco).
function limiteParaDesfazer() {
  return Date.now() - 15 * 60 * 1000;
}

export type FiltrosRelatorio = { academia?: string; dia?: string; mes?: string; ano?: string; pagina?: string };

function ontem() {
  const [a, m, d] = hoje().split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d - 1));
  return x.toISOString().slice(0, 10);
}

const formatarDia = (d: string) => d.split("-").reverse().join("/");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Período escolhido: um dia, um mês ou um ano. Sem filtro, o dia anterior.
function lerPeriodo(f: FiltrosRelatorio) {
  if (f.dia && /^\d{4}-\d{2}-\d{2}$/.test(f.dia)) return { inicio: f.dia, fim: f.dia, descricao: `em ${formatarDia(f.dia)}` };
  if (f.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(f.mes)) {
    const { inicio, fim } = intervaloDoMes(f.mes);
    return { inicio, fim, descricao: `em ${MESES[Number(f.mes.slice(5)) - 1]}/${f.mes.slice(0, 4)}` };
  }
  if (f.ano && /^\d{4}$/.test(f.ano)) return { inicio: `${f.ano}-01-01`, fim: `${f.ano}-12-31`, descricao: `em ${f.ano}` };
  const d = ontem();
  return { inicio: d, fim: d, descricao: `em ${formatarDia(d)} (dia anterior)` };
}

function link(caminho: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return q ? `${caminho}?${q}` : caminho;
}

const CAMPO = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
const BOTAO = "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50";

// Relatório importado de Excel (passagens ou Gympass): importação na aba da academia,
// filtro por dia, mês ou ano e a lista paginada (a tabela cresce todo dia).
export async function TelaRelatorio({
  searchParams,
  tipo,
  titulo,
  descricao,
  caminho,
  colunas,
  nomeItem,
}: {
  searchParams: Promise<FiltrosRelatorio>;
  tipo: TipoRelatorio;
  titulo: string;
  descricao: string;
  caminho: string;
  colunas: Coluna[];
  nomeItem: [singular: string, plural: string];
}) {
  const f = await searchParams;
  const { supabase, academias, selecionada, admin, atual } = await contextoAcademias(f.academia);
  const periodo = lerPeriodo(f);
  const pagina = Math.max(1, Number(f.pagina) || 1);
  const inicioPagina = (pagina - 1) * POR_PAGINA;

  // Total de linhas do período: vem dos resumos por dia (mantidos pelo banco), sem contar as linhas brutas.
  // Se os resumos ainda não existirem no banco, conta direto na tabela.
  let resumo = supabase
    .from(tipo === "passagens" ? "resumo_passagens_dia" : "resumo_gympass_dia")
    .select(tipo === "passagens" ? "entradas" : "checkins")
    .gte("data", periodo.inicio)
    .lte("data", periodo.fim);
  if (selecionada) resumo = resumo.eq("academia_id", selecionada);
  const { data: diasResumo, error: semResumo } = await resumo;
  const totalResumo = semResumo
    ? null
    : ((diasResumo ?? []) as Record<string, number>[]).reduce((t, d) => t + Number(d.entradas ?? d.checkins ?? 0), 0);

  let consulta = supabase
    .from(tipo)
    .select("*", totalResumo === null ? { count: "exact" } : {})
    .gte("data", periodo.inicio)
    .lte("data", periodo.fim)
    .order("data", { ascending: true })
    .order("hora", { ascending: true })
    .order("id", { ascending: true })
    .range(inicioPagina, inicioPagina + POR_PAGINA - 1);
  if (selecionada) consulta = consulta.eq("academia_id", selecionada);
  const { data, count } = await consulta;
  const total = totalResumo ?? count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const linhas: Linha[] = (data ?? []).map((r: Record<string, unknown>) => {
    const linha: Linha = { id: String(r.id) };
    for (const c of colunas) linha[c.campo] = r[c.campo] === null || r[c.campo] === undefined ? null : String(r[c.campo]);
    linha.academia_id = String(r.academia_id);
    return linha;
  });
  const colunasDaTela: Coluna[] = selecionada
    ? colunas
    : [
        {
          campo: "academia_id",
          rotulo: "Academia",
          tipo: "opcoes",
          largura: "w-36",
          opcoes: academias.map((a) => ({ valor: a.id, rotulo: a.nome })),
        },
        ...colunas,
      ];

  // Últimas importações da academia aberta (para conferir e, se preciso, desfazer).
  const { data: importacoes } = selecionada
    ? await supabase
        .from("importacoes")
        .select("id, arquivo, linhas_lidas, linhas_novas, created_at, criado_por")
        .eq("academia_id", selecionada)
        .eq("tipo", tipo)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };
  const quinzeMinutos = limiteParaDesfazer();

  // Última data já importada de cada academia (mostrada ao lado do botão de importar).
  const ultimas = new Map(
    await Promise.all(
      (selecionada ? academias.filter((a) => a.id === selecionada) : academias).map(async (a) => {
        const { data: ultima } = await supabase
          .from(tipo)
          .select("data")
          .eq("academia_id", a.id)
          .order("data", { ascending: false })
          .limit(1)
          .maybeSingle();
        return [a.id, (ultima?.data as string | undefined) ?? null] as const;
      })
    )
  );
  const ultimaTexto = (id: string) => {
    const d = ultimas.get(id);
    return d ? d.split("-").reverse().join("/") : "nenhuma";
  };

  const manter = { academia: selecionada ?? undefined };
  const filtroAtual = { ...manter, dia: f.dia, mes: f.mes, ano: f.ano };
  const anoAtual = Number(hoje().slice(0, 4));

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">{descricao}</p>

      {academias.length === 0 ? (
        <SemAcademias admin={admin} />
      ) : (
        <>
          <AbasAcademias academias={academias} selecionada={selecionada} caminho={caminho} />

          {selecionada ? (
            <ImportarExcel
              importar={importarRelatorio.bind(null, tipo, selecionada)}
              rotulo={`Importar para ${academias.find((a) => a.id === selecionada)?.nome}`}
              info={
                <>
                  Última data no sistema: <strong className="text-slate-900">{ultimaTexto(selecionada)}</strong>
                </>
              }
            />
          ) : (
            <p className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              Para importar uma planilha, abra a aba da academia. Última data no sistema:{" "}
              {academias.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && " · "}
                  {a.nome} <strong className="text-slate-900">{ultimaTexto(a.id)}</strong>
                </span>
              ))}
            </p>
          )}

          {/* Filtros: um dia, um mês ou um ano (formulários simples, a escolha vai para o endereço da página). */}
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <form action={caminho} className="flex items-center gap-1.5">
              {selecionada && <input type="hidden" name="academia" value={selecionada} />}
              <label className="text-slate-500" htmlFor="filtro-dia">Dia</label>
              <input id="filtro-dia" type="date" name="dia" defaultValue={f.dia ?? (f.mes || f.ano ? "" : ontem())} className={CAMPO} />
              <button className={BOTAO}>Ver</button>
            </form>
            <form action={caminho} className="flex items-center gap-1.5">
              {selecionada && <input type="hidden" name="academia" value={selecionada} />}
              <label className="text-slate-500" htmlFor="filtro-mes">Mês</label>
              <input id="filtro-mes" type="month" name="mes" defaultValue={f.mes ?? ""} className={CAMPO} />
              <button className={BOTAO}>Ver</button>
            </form>
            <form action={caminho} className="flex items-center gap-1.5">
              {selecionada && <input type="hidden" name="academia" value={selecionada} />}
              <label className="text-slate-500" htmlFor="filtro-ano">Ano</label>
              <select id="filtro-ano" name="ano" defaultValue={f.ano ?? ""} className={CAMPO}>
                <option value="" disabled>
                  —
                </option>
                {Array.from({ length: 6 }, (_, i) => anoAtual - i).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <button className={BOTAO}>Ver</button>
            </form>
            {(f.dia || f.mes || f.ano) && (
              <Link href={link(caminho, manter)} className="text-slate-500 underline hover:text-slate-900">
                Voltar ao dia anterior
              </Link>
            )}
          </div>

          <p className="mb-2 text-sm text-slate-700">
            <span className="font-semibold">{total.toLocaleString("pt-BR")}</span>{" "}
            {total === 1 ? nomeItem[0] : nomeItem[1]} {periodo.descricao}
            {paginas > 1 && (
              <span className="text-slate-500">
                {" "}
                · página {pagina} de {paginas}
              </span>
            )}
          </p>

          <Planilha
            colunas={colunasDaTela}
            linhas={linhas}
            numeroInicial={inicioPagina + 1}
            somenteLeitura="Dados importados da planilha: só consulta."
            vazio={`Nenhum registro ${periodo.descricao}.`}
          />

          {paginas > 1 && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              {pagina > 1 && (
                <Link href={link(caminho, { ...filtroAtual, pagina: String(pagina - 1) })} className={BOTAO}>
                  ‹ Anterior
                </Link>
              )}
              <span className="text-slate-500">
                Página {pagina} de {paginas}
              </span>
              {pagina < paginas && (
                <Link href={link(caminho, { ...filtroAtual, pagina: String(pagina + 1) })} className={BOTAO}>
                  Próxima ›
                </Link>
              )}
            </div>
          )}

          {selecionada && (importacoes ?? []).length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Últimas importações desta academia</h2>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-sm">
                {(importacoes ?? []).map((imp) => {
                  const podeDesfazer =
                    admin || (imp.criado_por === atual?.id && new Date(imp.created_at).getTime() > quinzeMinutos);
                  return (
                    <li key={imp.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="text-slate-700">
                        {new Date(imp.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·{" "}
                        {imp.arquivo} · {Number(imp.linhas_novas).toLocaleString("pt-BR")} de{" "}
                        {Number(imp.linhas_lidas).toLocaleString("pt-BR")} linhas novas
                      </span>
                      {podeDesfazer && <DesfazerImportacao desfazer={desfazerImportacao.bind(null, imp.id)} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
