"use client";

import type { ReactNode } from "react";

// Peças de tela do módulo Financeiro: janela (modal), campos de formulário e etiqueta de situação.

export function Janela({ titulo, fechar, children, largura = "max-w-3xl" }: { titulo: string; fechar: () => void; children: ReactNode; largura?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/40 p-4 md:p-8" onClick={fechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()} className={`w-full ${largura} rounded-xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={fechar} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            Fechar ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const CAMPO = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-marca focus:outline-none disabled:bg-slate-50";
export const BOTAO = "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50";
export const BOTAO_PRIMARIO = `${BOTAO} bg-marca text-white hover:bg-marca-escuro`;
export const BOTAO_SECUNDARIO = `${BOTAO} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

export function Rotulo({ texto, children, className = "" }: { texto: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{texto}</span>
      {children}
    </label>
  );
}

export function Texto({
  rotulo,
  valor,
  mudar,
  className,
  tipo = "text",
  placeholder,
  numerico,
}: {
  rotulo: string;
  valor: string;
  mudar: (v: string) => void;
  className?: string;
  tipo?: string;
  placeholder?: string;
  numerico?: boolean;
}) {
  return (
    <Rotulo texto={rotulo} className={className}>
      <input type={tipo} value={valor} placeholder={placeholder} inputMode={numerico ? "decimal" : undefined} onChange={(e) => mudar(e.target.value)} className={`${CAMPO} ${numerico ? "text-right" : ""}`} />
    </Rotulo>
  );
}

export function Escolha({
  rotulo,
  valor,
  mudar,
  opcoes,
  className,
  vazio = "Escolha…",
}: {
  rotulo: string;
  valor: string;
  mudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string; grupo?: string }[];
  className?: string;
  vazio?: string;
}) {
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ""))];
  return (
    <Rotulo texto={rotulo} className={className}>
      <select value={valor} onChange={(e) => mudar(e.target.value)} className={CAMPO}>
        <option value="">{vazio}</option>
        {grupos.length > 1
          ? grupos.map((g) => (
              <optgroup key={g} label={g}>
                {opcoes
                  .filter((o) => (o.grupo ?? "") === g)
                  .map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
              </optgroup>
            ))
          : opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
      </select>
    </Rotulo>
  );
}

export function Mensagem({ m }: { m: { erro?: string; ok?: string } | null }) {
  if (!m) return null;
  if (m.erro) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{m.erro}</p>;
  if (m.ok) return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{m.ok}</p>;
  return null;
}
