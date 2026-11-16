"use client";

import { useState, type ReactNode } from "react";

// Ordenar a tabela clicando no cabeçalho: 1º clique crescente, 2º decrescente, 3º volta à ordem original. Números
// e datas (AAAA-MM-DD) ordenam pelo valor; textos em ordem alfabética, sem diferenciar acentos e maiúsculas. Vazios
// ficam sempre no fim.

export type ValorOrdenavel = string | number | null | undefined;
export type Ordem = { campo: string; desc: boolean } | null;

const vazio = (v: ValorOrdenavel) => v === null || v === undefined || v === "";

export function compararValores(a: ValorOrdenavel, b: ValorOrdenavel, desc = false) {
  if (vazio(a) || vazio(b)) return vazio(a) === vazio(b) ? 0 : vazio(a) ? 1 : -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
  return desc ? -r : r;
}

export function useOrdenacao<T>(lista: T[], valorDe: (item: T, campo: string) => ValorOrdenavel) {
  const [ordem, setOrdem] = useState<Ordem>(null);
  const ordenada = ordem ? [...lista].sort((a, b) => compararValores(valorDe(a, ordem.campo), valorDe(b, ordem.campo), ordem.desc)) : lista;
  const alternar = (campo: string) => setOrdem((o) => (!o || o.campo !== campo ? { campo, desc: false } : !o.desc ? { campo, desc: true } : null));
  return { ordenada, ordem, alternar };
}

// Conteúdo do <th>: o rótulo vira botão, com a seta da ordem atual.
export function RotuloOrdenavel({ campo, ordem, alternar, children, direita }: { campo: string; ordem: Ordem; alternar: (campo: string) => void; children: ReactNode; direita?: boolean }) {
  const ativa = ordem?.campo === campo;
  return (
    <button
      type="button"
      onClick={() => alternar(campo)}
      title="Clique para ordenar"
      className={`inline-flex items-center gap-1 hover:text-slate-900 ${direita ? "flex-row-reverse" : ""} ${ativa ? "text-slate-900" : ""}`}
    >
      {children}
      <span className={`text-[10px] ${ativa ? "text-marca" : "text-slate-300"}`}>{ativa ? (ordem.desc ? "▼" : "▲") : "↕"}</span>
    </button>
  );
}
