"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AbasDaAcademia({ id }: { id: string }) {
  const pathname = usePathname();
  const abas = [
    { href: `/academias/${id}/funcionarios`, rotulo: "Funcionários" },
    { href: `/academias/${id}/modalidades`, rotulo: "Modalidades" },
    { href: `/academias/${id}/datas`, rotulo: "Datas importantes" },
    { href: `/academias/${id}/grade`, rotulo: "Grade de aulas" },
    { href: `/academias/${id}/escala`, rotulo: "Escala" },
    { href: `/academias/${id}/fechamento-coletivas`, rotulo: "Fechamento coletivas" },
  ];
  return (
    <nav className="mb-4 mt-3 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Cadastros da academia">
      {abas.map((a) => {
        const ativa = pathname === a.href;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${
              ativa
                ? "border-slate-200 border-b-white bg-white font-medium text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
