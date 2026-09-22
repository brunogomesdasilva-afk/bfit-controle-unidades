"use client";

import { Logo } from "@/app/Logo";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// Indicador de que o sistema está trabalhando: a barra fina no topo (mais discreta) e um aviso na
// própria tela, com cronômetro, para ficar claro que não travou — só aparece de verdade depois de
// meio segundo, para não piscar em ações rápidas.
export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [largura, setLargura] = useState(0); // 0 = barra escondida
  const [avisoVisivel, setAvisoVisivel] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const tempoLimite = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atrasoAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervaloSegundos = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararTudo = useCallback(() => {
    setLargura(0);
    setAvisoVisivel(false);
    setSegundos(0);
    if (tempoLimite.current) clearTimeout(tempoLimite.current);
    if (atrasoAviso.current) clearTimeout(atrasoAviso.current);
    if (intervaloSegundos.current) clearInterval(intervaloSegundos.current);
  }, []);

  const iniciar = useCallback(() => {
    pararTudo();
    setLargura(80);
    // O aviso na tela (com cronômetro) só aparece se demorar mais que meio segundo.
    atrasoAviso.current = setTimeout(() => {
      setAvisoVisivel(true);
      intervaloSegundos.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    }, 500);
    // Trava de segurança: nunca fica presa na tela, mesmo numa navegação que não muda a URL.
    tempoLimite.current = setTimeout(pararTudo, 20000);
  }, [pararTudo]);

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destino = link.getAttribute("href") ?? "";
      if (!destino.startsWith("/")) return; // só navegação interna
      const atual = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      if (destino === atual) return;
      iniciar();
    }
    function aoEnviarFormulario() {
      // Cobre os formulários que chamam uma ação do servidor (a maioria do sistema).
      iniciar();
    }
    document.addEventListener("click", aoClicar);
    document.addEventListener("submit", aoEnviarFormulario);
    return () => {
      document.removeEventListener("click", aoClicar);
      document.removeEventListener("submit", aoEnviarFormulario);
    };
  }, [pathname, searchParams, iniciar]);

  // A URL efetiva mudou: a navegação (ou o redirecionamento da ação) terminou.
  useEffect(() => {
    if (largura === 0) return;
    const conclusao = requestAnimationFrame(() => setLargura(100));
    const escondida = setTimeout(pararTudo, 200);
    return () => {
      cancelAnimationFrame(conclusao);
      clearTimeout(escondida);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <>
      {largura > 0 && (
        <div className="fixed inset-x-0 top-0 z-[100] h-0.5 bg-transparent" aria-hidden="true">
          <div
            className="h-full bg-marca-claro shadow-[0_0_8px_var(--color-marca-claro)] transition-all ease-out"
            style={{ width: `${largura}%`, transitionDuration: largura === 100 ? "150ms" : "600ms" }}
          />
        </div>
      )}
      {avisoVisivel && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-3 rounded-2xl bg-white/95 px-8 py-6 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm"
          >
            <div className="relative h-14 w-14">
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-slate-200 border-t-marca" />
              <Logo variante="icone" className="absolute inset-0 flex items-center justify-center text-xl" />
            </div>
            <p className="text-sm text-slate-600">
              Atualizando<span className="tabular-nums text-slate-400">… {segundos}s</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
