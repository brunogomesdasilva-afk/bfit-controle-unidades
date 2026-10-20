import type { ReactNode } from "react";
import { BotaoImprimir } from "./BotaoImprimir";

// Peças comuns dos relatórios: cabeçalho (título, período, botão de PDF) e tabela com linha de total.

export const numero = (n: number | null | undefined, casas = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const moeda = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const percentual = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatarDia = (d: string) => d.slice(0, 10).split("-").reverse().join("/");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

export function CabecalhoRelatorio({
  titulo,
  periodo,
  filtros,
}: {
  titulo: string;
  periodo: string;
  filtros?: ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">BFIT · Relatórios</p>
          <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
          <p className="text-sm font-medium capitalize text-slate-700">{periodo}</p>
        </div>
        <BotaoImprimir />
      </div>
      {filtros && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm print:hidden">{filtros}</div>}
    </div>
  );
}

export type ColunaRelatorio<T> = {
  rotulo: string;
  valor: (linha: T) => ReactNode;
  total?: ReactNode;
  alinhar?: "esquerda" | "direita";
  destaque?: boolean;
};

const CELULA = "border border-slate-300 px-2 py-1.5";

export function TabelaRelatorio<T>({
  colunas,
  linhas,
  chave,
  vazio,
}: {
  colunas: ColunaRelatorio<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  vazio: string;
}) {
  const temTotal = colunas.some((c) => c.total !== undefined);
  return (
    <>
      {/* Celular: um cartão por linha (textos na largura toda, números e datas lado a lado). */}
      <ul className="space-y-2.5 sm:hidden print:hidden">
        {linhas.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">{vazio}</li>
        )}
        {linhas.map((l) => (
          <li key={chave(l)} className="rounded-lg border border-slate-200 bg-white p-3.5 text-sm">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {colunas.map((c) => (
                <div key={c.rotulo} className={c.alinhar === "esquerda" ? "col-span-2" : ""}>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{c.rotulo}</dt>
                  <dd className={`mt-0.5 text-slate-900 ${c.alinhar === "esquerda" ? "" : "tabular-nums"} ${c.destaque ? "font-semibold" : ""}`}>{c.valor(l)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
        {temTotal && linhas.length > 1 && (
          <li className="rounded-lg border border-slate-300 bg-slate-100 p-3.5 text-sm">
            <p className="mb-2 font-semibold text-slate-900">Total</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {colunas
                .filter((c) => c.total !== undefined)
                .map((c) => (
                  <div key={c.rotulo}>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">{c.rotulo}</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{c.total}</dd>
                  </div>
                ))}
            </dl>
          </li>
        )}
      </ul>
    <div className="hidden overflow-auto rounded-md border border-slate-300 bg-white sm:block print:block print:overflow-visible print:rounded-none">
      <table className="w-full border-collapse text-sm print:text-[10px]">
        <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600 print:text-[9px]">
          <tr>
            {colunas.map((c) => (
              <th key={c.rotulo} className={`${CELULA} ${c.alinhar === "esquerda" ? "text-left" : "text-right"}`}>
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr>
              <td colSpan={colunas.length} className={`${CELULA} py-6 text-center text-slate-500`}>
                {vazio}
              </td>
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={chave(l)} className="break-inside-avoid">
              {colunas.map((c) => (
                <td
                  key={c.rotulo}
                  className={`${CELULA} ${c.alinhar === "esquerda" ? "text-left" : "text-right tabular-nums"} ${
                    c.destaque ? "font-semibold" : ""
                  }`}
                >
                  {c.valor(l)}
                </td>
              ))}
            </tr>
          ))}
          {temTotal && linhas.length > 1 && (
            <tr className="bg-slate-200 font-semibold">
              {colunas.map((c, i) => (
                <td
                  key={c.rotulo}
                  className={`${CELULA} ${c.alinhar === "esquerda" ? "text-left" : "text-right tabular-nums"}`}
                >
                  {i === 0 ? "Total" : (c.total ?? "")}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
