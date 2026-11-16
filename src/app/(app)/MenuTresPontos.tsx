"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Menu de três pontos de uma linha de tabela (ex.: Duplicar, Excluir). Fica em posição fixa para não ser cortado
// pela rolagem da tabela; fecha ao escolher uma opção, ao clicar fora, ao rolar ou com Esc.
export function MenuTresPontos({ rotulo = "Mais ações", children }: { rotulo?: string; children: ReactNode }) {
  const botao = useRef<HTMLButtonElement>(null);
  const [posicao, setPosicao] = useState<{ topo: number; direita: number } | null>(null);

  function alternar() {
    if (posicao) return setPosicao(null);
    const r = botao.current?.getBoundingClientRect();
    if (r) setPosicao({ topo: r.bottom + 4, direita: Math.max(8, window.innerWidth - r.right) });
  }

  useEffect(() => {
    if (!posicao) return;
    const fechar = () => setPosicao(null);
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setPosicao(null);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [posicao]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={alternar}
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={posicao !== null}
        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {posicao && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPosicao(null)} />
          <div
            role="menu"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a, button")) setPosicao(null);
            }}
            className="fixed z-50 w-48 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
            style={{ top: posicao.topo, right: posicao.direita }}
          >
            {children}
          </div>
        </>
      )}
    </>
  );
}

export const ITEM_MENU = "block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";
