"use client";

import { useMemo, useState } from "react";
import { formatarDocumento, nomePessoa, soNumeros } from "@/lib/financeiro";
import { CAMPO } from "./componentes";

// Campo de escolha do cliente/fornecedor com busca por nome ou CPF/CNPJ (a lista é grande para um select).
export type PessoaResumo = { id: string; razao_social: string; nome_fantasia: string | null; documento: string | null; categoria_padrao_id: string | null };

export function BuscaPessoa({
  pessoas,
  valor,
  mudar,
  rotulo,
  incluir,
}: {
  pessoas: PessoaResumo[];
  valor: string;
  mudar: (id: string, pessoa: PessoaResumo | null) => void;
  rotulo: string;
  incluir?: () => void;
}) {
  const escolhida = pessoas.find((p) => p.id === valor) ?? null;
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const opcoes = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const d = soNumeros(texto);
    if (!t) return pessoas.slice(0, 30);
    return pessoas.filter((p) => `${p.razao_social} ${p.nome_fantasia ?? ""}`.toLowerCase().includes(t) || (d.length >= 3 && (p.documento ?? "").includes(d))).slice(0, 30);
  }, [pessoas, texto]);

  return (
    <div className="relative text-sm">
      <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
        {rotulo}
        {incluir && (
          <button type="button" onClick={incluir} className="text-marca hover:underline">
            + novo cadastro
          </button>
        )}
      </span>
      <input
        value={aberto ? texto : escolhida ? `${nomePessoa(escolhida)}${escolhida.documento ? ` · ${formatarDocumento(escolhida.documento)}` : ""}` : ""}
        onFocus={() => {
          setTexto("");
          setAberto(true);
        }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Digite o nome ou o CPF/CNPJ"
        className={CAMPO}
      />
      {aberto && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {opcoes.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  mudar(p.id, p);
                  setAberto(false);
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-sky-50"
              >
                <span className="text-slate-900">{nomePessoa(p)}</span>
                {p.documento && <span className="ml-2 text-xs text-slate-500">{formatarDocumento(p.documento)}</span>}
              </button>
            </li>
          ))}
          {opcoes.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhum cadastro. Use “+ novo cadastro”.</li>}
        </ul>
      )}
    </div>
  );
}
