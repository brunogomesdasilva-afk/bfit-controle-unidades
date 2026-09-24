"use client";

import { useState } from "react";

// Gráfico de linhas jan-dez comparando o ano de referência (azul, contínuo) com o anterior (laranja,
// tracejado). Um eixo só; passando o mouse aparece a linha-guia com os valores do mês.

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const COR_ATUAL = "#0b4ea2";
const COR_ANTERIOR = "#eb6834";

const L = 640;
const A = 220;
const M = { topo: 16, dir: 16, base: 28, esq: 64 };

function escalaBonita(max: number) {
  if (max <= 0) return { topo: 1, passos: [0, 1] };
  const bruto = max / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p >= bruto)!;
  const topo = passo * Math.ceil(max / passo);
  return { topo, passos: Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo) };
}

export function GraficoAnual({
  titulo,
  ano,
  atual,
  anterior,
  formato,
}: {
  titulo: string;
  ano: number;
  atual: (number | null)[];
  anterior: (number | null)[];
  formato: "moeda" | "numero";
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const fmt = (n: number | null) =>
    n === null
      ? "—"
      : formato === "moeda"
        ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
        : n.toLocaleString("pt-BR");
  const fmtEixo = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
      : n >= 1000
        ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
        : n.toLocaleString("pt-BR");

  const valores = [...atual, ...anterior].filter((v): v is number => v !== null);
  const { topo, passos } = escalaBonita(Math.max(0, ...valores));
  const largura = L - M.esq - M.dir;
  const altura = A - M.topo - M.base;
  const x = (i: number) => M.esq + (i + 0.5) * (largura / 12);
  const y = (v: number) => M.topo + altura - (v / topo) * altura;

  // Linha com quebras onde o mês não tem lançamento.
  const caminho = (serie: (number | null)[]) =>
    serie.reduce((d, v, i) => (v === null ? d : `${d}${d && serie[i - 1] !== null && i > 0 ? "L" : "M"}${x(i)},${y(v)}`), "");

  const semDados = valores.length === 0;

  return (
    <figure className="rounded-lg border border-slate-200 bg-white p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{titulo}</span>
        <span className="flex items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4" stroke={COR_ATUAL} strokeWidth="2" />
            </svg>
            {ano}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4" stroke={COR_ANTERIOR} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            {ano - 1}
          </span>
        </span>
      </figcaption>

      {semDados ? (
        <p className="py-16 text-center text-sm text-slate-500">Sem lançamentos no controle diário para este período.</p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${L} ${A}`}
            className="h-auto w-full"
            role="img"
            aria-label={`${titulo}: ${ano} comparado a ${ano - 1}`}
            onMouseLeave={() => setFoco(null)}
          >
            {passos.map((p) => (
              <g key={p}>
                <line x1={M.esq} x2={L - M.dir} y1={y(p)} y2={y(p)} stroke="#e2e8f0" strokeWidth="1" />
                <text x={M.esq - 8} y={y(p) + 4} textAnchor="end" fontSize="11" fill="#64748b">
                  {fmtEixo(p)}
                </text>
              </g>
            ))}
            {MESES.map((mes, i) => (
              <text key={mes} x={x(i)} y={A - 8} textAnchor="middle" fontSize="11" fill="#64748b">
                {mes}
              </text>
            ))}
            {foco !== null && (
              <line x1={x(foco)} x2={x(foco)} y1={M.topo} y2={M.topo + altura} stroke="#94a3b8" strokeWidth="1" />
            )}
            <path d={caminho(anterior)} fill="none" stroke={COR_ANTERIOR} strokeWidth="2" strokeDasharray="5 4" />
            <path d={caminho(atual)} fill="none" stroke={COR_ATUAL} strokeWidth="2" />
            {atual.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={foco === i ? 5 : 3} fill={COR_ATUAL} stroke="#fff" strokeWidth="2" />
              )
            )}
            {foco !== null && anterior[foco] !== null && (
              <circle cx={x(foco)} cy={y(anterior[foco]!)} r={5} fill={COR_ANTERIOR} stroke="#fff" strokeWidth="2" />
            )}
            {/* Áreas de passagem do mouse: uma faixa por mês, maior que os pontos. */}
            {MESES.map((mes, i) => (
              <rect
                key={mes}
                x={M.esq + i * (largura / 12)}
                y={M.topo}
                width={largura / 12}
                height={altura}
                fill="transparent"
                onMouseEnter={() => setFoco(i)}
              />
            ))}
          </svg>
          {foco !== null && (
            <div
              className="pointer-events-none absolute top-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
              style={{ left: `${(x(foco) / L) * 100}%`, transform: foco > 7 ? "translateX(-105%)" : "translateX(8px)" }}
            >
              <p className="mb-1 font-semibold text-slate-900">{MESES[foco]}</p>
              <p className="flex items-center gap-1.5 text-slate-700">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR_ATUAL }} />
                {ano}: <span className="font-medium tabular-nums">{fmt(atual[foco])}</span>
              </p>
              <p className="flex items-center gap-1.5 text-slate-700">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COR_ANTERIOR }} />
                {ano - 1}: <span className="font-medium tabular-nums">{fmt(anterior[foco])}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
