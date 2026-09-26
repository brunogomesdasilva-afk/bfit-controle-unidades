"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { carregarContagensFaltando, type GrupoFaltas } from "./avisos";

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)} (${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]})`;

// Aviso das contagens (sala, coletivas e lutas) sem preencher, no meio da tela. Aparece a cada login
// enquanto houver falta; depois de fechado, só volta no próximo login.
export function AvisoContagens({ sessao }: { sessao: string }) {
  const chave = `contagens_vistas_${sessao}`;
  const [grupos, setGrupos] = useState<GrupoFaltas[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let visto = false;
    try {
      visto = localStorage.getItem(chave) === "1";
    } catch {}
    if (visto) return;
    let ativo = true;
    carregarContagensFaltando()
      .then((g) => {
        if (ativo && g.length) {
          setGrupos(g);
          setAberto(true);
        }
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [chave]);

  const fechar = () => {
    try {
      localStorage.setItem(chave, "1");
    } catch {}
    setAberto(false);
  };
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 print:hidden" onClick={fechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-contagens-titulo"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="aviso-contagens-titulo" className="text-lg font-semibold text-amber-800">
            Contagens faltando
          </h2>
          <p className="text-sm text-slate-600">Estes horários ainda não foram preenchidos. Clique para abrir a tela da contagem.</p>
        </div>
        <div className="space-y-4 overflow-auto px-5 py-4 text-sm">
          {grupos.map((g) => (
            <section key={g.academia}>
              {grupos.length > 1 && <h3 className="mb-1 font-semibold text-marca">{g.academia}</h3>}
              <ul className="space-y-2">
                {g.dias.map((d) => (
                  <li key={d.data} className="rounded-lg bg-amber-50 px-3 py-2">
                    <p className="font-semibold text-slate-900">{dia(d.data)}</p>
                    {d.itens.map((i) => (
                      <p key={i.contagem} className="text-slate-700">
                        <Link href={i.caminho} onClick={fechar} className="font-medium text-marca underline">
                          {i.contagem}
                        </Link>
                        : {i.horarios.join(", ")}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 text-right">
          <button type="button" onClick={fechar} className="rounded-md bg-marca px-5 py-2 text-sm font-medium text-white hover:opacity-90">
            OK, fechar
          </button>
        </div>
      </div>
    </div>
  );
}
