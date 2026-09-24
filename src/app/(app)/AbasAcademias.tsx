import Link from "next/link";
import type { Academia } from "@/lib/database.types";

export const SITUACOES = {
  pendente: "Pendentes",
  concluido: "Concluídos",
  todos: "Todos",
} as const;
export type FiltroSituacao = keyof typeof SITUACOES;

// Lê o filtro de situação da URL. Por padrão só aparecem as pendentes.
export function lerSituacao(valor: string | undefined): FiltroSituacao {
  return valor && valor in SITUACOES ? (valor as FiltroSituacao) : "pendente";
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function somarMes(mes: string, delta: number) {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Filtros = { academia: string | null; situacao?: FiltroSituacao; mes?: string };

function link(caminho: string, f: Filtros) {
  const params = new URLSearchParams();
  if (f.academia) params.set("academia", f.academia);
  if (f.situacao && f.situacao !== "pendente") params.set("situacao", f.situacao);
  if (f.mes) params.set("mes", f.mes);
  const q = params.toString();
  return q ? `${caminho}?${q}` : caminho;
}

// Abas para escolher a academia (ou todas) e, conforme a tela, o filtro de situação ou o mês.
// As escolhas ficam na URL, e cada link mantém as demais.
export function AbasAcademias({
  academias,
  selecionada,
  situacao,
  mes,
  caminho,
}: {
  academias: Academia[];
  selecionada: string | null;
  situacao?: FiltroSituacao;
  mes?: string;
  caminho: string;
}) {
  const atuais: Filtros = { academia: selecionada, situacao, mes };
  const abas = [{ id: null as string | null, nome: "Todas" }, ...academias];
  return (
    <div className="mb-4 space-y-3">
      {academias.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Academias">
          {abas.map((a) => {
            const ativa = a.id === selecionada;
            return (
              <Link
                key={a.id ?? "todas"}
                href={link(caminho, { ...atuais, academia: a.id })}
                aria-current={ativa ? "page" : undefined}
                className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${
                  ativa
                    ? "border-slate-200 border-b-white bg-white font-medium text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {a.nome}
              </Link>
            );
          })}
        </nav>
      )}

      {situacao && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Situação:</span>
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
            {(Object.keys(SITUACOES) as FiltroSituacao[]).map((s) => (
              <Link
                key={s}
                href={link(caminho, { ...atuais, situacao: s })}
                aria-current={s === situacao ? "page" : undefined}
                className={`border-l border-slate-300 px-3 py-1 first:border-l-0 ${
                  s === situacao ? "bg-marca font-medium text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {SITUACOES[s]}
              </Link>
            ))}
          </div>
        </div>
      )}

      {mes && <SeletorMes caminho={caminho} academia={selecionada} situacao={situacao} mes={mes} />}
    </div>
  );
}

// Seletor de mês (‹ setembro/2026 ›). Também usado na barra da planilha, ao lado do botão de incluir.
export function SeletorMes({
  caminho,
  academia,
  situacao,
  mes,
}: {
  caminho: string;
  academia: string | null;
  situacao?: FiltroSituacao;
  mes: string;
}) {
  const atuais: Filtros = { academia, situacao, mes };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Mês:</span>
      <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300 bg-white">
        <Link
          href={link(caminho, { ...atuais, mes: somarMes(mes, -1) })}
          aria-label="Mês anterior"
          className="px-2.5 py-1 text-slate-600 hover:bg-slate-50"
        >
          ‹
        </Link>
        <span className="min-w-36 border-x border-slate-300 px-3 py-1 text-center font-medium capitalize text-slate-900">
          {MESES[Number(mes.slice(5, 7)) - 1]}/{mes.slice(0, 4)}
        </span>
        <Link
          href={link(caminho, { ...atuais, mes: somarMes(mes, 1) })}
          aria-label="Próximo mês"
          className="px-2.5 py-1 text-slate-600 hover:bg-slate-50"
        >
          ›
        </Link>
      </div>
    </div>
  );
}
