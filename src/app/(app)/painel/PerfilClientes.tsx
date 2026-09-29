"use client";

import { useState } from "react";

type Linha = { genero: string; faixa: string; contrato: string; clientes: number };

const FAIXAS = ["Menor de 18", "18 a 30", "31 a 40", "41 a 50", "51 ou mais", "Sem data"];
// Cores fixas por gênero (a identidade não muda com o filtro); o texto usa sempre as cores de texto.
const GENEROS = [
  { chave: "M", nome: "Masculino", cor: "#1d4ed8" },
  { chave: "F", nome: "Feminino", cor: "#db2777" },
  { chave: "?", nome: "Não informado", cor: "#94a3b8" },
];
const grupoDe = (g: string) => (g === "M" || g === "F" ? g : "?");
const pct = (n: number, total: number) => (total ? `${((n / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const num = (n: number) => n.toLocaleString("pt-BR");

// Perfil dos clientes ativos: gênero, faixa etária (geral ou dentro de cada gênero) e planos.
export function PerfilClientes({ linhas, disponivel }: { linhas: Linha[]; disponivel: boolean }) {
  const [porSexo, setPorSexo] = useState(false);
  const total = linhas.reduce((t, l) => t + l.clientes, 0);

  if (!disponivel || total === 0)
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        Perfil dos clientes: {disponivel ? "nenhum cliente ativo importado. Importe o Excel em Clientes." : "rode o SQL 0028 e importe o Excel em Clientes."}
      </div>
    );

  const porGenero = GENEROS.map((g) => ({ ...g, n: linhas.filter((l) => grupoDe(l.genero) === g.chave).reduce((t, l) => t + l.clientes, 0) })).filter(
    (g) => g.n > 0
  );
  const faixas = FAIXAS.map((f) => ({
    faixa: f,
    n: linhas.filter((l) => l.faixa === f).reduce((t, l) => t + l.clientes, 0),
    porGenero: Object.fromEntries(
      porGenero.map((g) => [g.chave, linhas.filter((l) => l.faixa === f && grupoDe(l.genero) === g.chave).reduce((t, l) => t + l.clientes, 0)])
    ) as Record<string, number>,
  })).filter((f) => f.n > 0);
  const maiorFaixa = Math.max(...faixas.map((f) => f.n));

  const planos = new Map<string, number>();
  for (const l of linhas) planos.set(l.contrato, (planos.get(l.contrato) ?? 0) + l.clientes);
  const ordenados = [...planos.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Gênero */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Clientes ativos por gênero</p>
        <p className="mb-3 text-xs text-slate-500">{num(total)} clientes ativos</p>
        <div className="flex h-6 w-full overflow-hidden rounded" role="img" aria-label="Divisão por gênero">
          {porGenero.map((g) => (
            <div
              key={g.chave}
              title={`${g.nome}: ${num(g.n)} (${pct(g.n, total)})`}
              style={{ width: `${(g.n / total) * 100}%`, background: g.cor }}
              className="h-full border-r-2 border-white last:border-r-0"
            />
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {porGenero.map((g) => (
            <li key={g.chave} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: g.cor }} />
                {g.nome}
              </span>
              <span className="tabular-nums text-slate-900">
                <strong>{pct(g.n, total)}</strong> <span className="text-slate-500">({num(g.n)})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Faixa etária */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Faixa etária</p>
            <p className="text-xs text-slate-500">{porSexo ? "% dentro de cada gênero" : "% do total de clientes ativos"}</p>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs">
            {[
              [false, "Geral"],
              [true, "Por gênero"],
            ].map(([valor, rotulo]) => (
              <button
                key={String(valor)}
                type="button"
                onClick={() => setPorSexo(valor as boolean)}
                className={`border-l border-slate-300 px-2 py-1 first:border-l-0 ${porSexo === valor ? "bg-marca font-medium text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {rotulo as string}
              </button>
            ))}
          </div>
        </div>
        <ul className="space-y-2">
          {faixas.map((f) => (
            <li key={f.faixa} className="text-xs">
              <div className="mb-0.5 flex justify-between text-slate-700">
                <span>{f.faixa}</span>
                {!porSexo && (
                  <span className="tabular-nums">
                    <strong className="text-slate-900">{pct(f.n, total)}</strong> ({num(f.n)})
                  </span>
                )}
              </div>
              {porSexo ? (
                <div className="space-y-0.5">
                  {porGenero.map((g) => {
                    const n = f.porGenero[g.chave] ?? 0;
                    const doGenero = g.n;
                    return (
                      <div key={g.chave} className="flex items-center gap-2" title={`${g.nome}, ${f.faixa}: ${num(n)} (${pct(n, doGenero)} dos clientes ${g.nome.toLowerCase()})`}>
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full" style={{ width: `${doGenero ? (n / doGenero) * 100 : 0}%`, background: g.cor }} />
                        </div>
                        <span className="w-24 shrink-0 text-right tabular-nums text-slate-600">
                          {pct(n, doGenero)} <span className="text-slate-400">{g.chave === "?" ? "n/i" : g.chave}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-2.5 rounded-full bg-slate-100" title={`${f.faixa}: ${num(f.n)}`}>
                  <div className="h-2.5 rounded-full bg-marca" style={{ width: `${(f.n / maiorFaixa) * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
        {porSexo && (
          <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
            {porGenero.map((g) => (
              <span key={g.chave} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: g.cor }} />
                {g.nome}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Planos */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Clientes ativos por plano</p>
        <p className="mb-2 text-xs text-slate-500">{ordenados.length} planos</p>
        <ul className="max-h-72 divide-y divide-slate-100 overflow-auto text-xs">
          {ordenados.map(([plano, n]) => (
            <li key={plano} className="flex justify-between gap-3 py-1.5">
              <span className="text-slate-700">{plano}</span>
              <span className="shrink-0 tabular-nums">
                <strong className="text-slate-900">{num(n)}</strong> <span className="text-slate-500">({pct(n, total)})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
