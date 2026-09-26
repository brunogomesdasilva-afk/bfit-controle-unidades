"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CONCEITOS, PERGUNTAS_ABERTAS, type Pergunta } from "@/lib/adb";
import type { ResultadoAdb } from "./actions";

type Funcionario = { id: string; nome: string; cargo: string; periodo: string };

// Formulário da A.D.B: escolhe o funcionário, dá nota de 1 a 5 para cada pergunta do questionário
// dele e responde as perguntas abertas. A nota final (média) aparece enquanto as notas são dadas.
export function FormularioAdb({
  funcionarios,
  funcionarioId,
  perguntas,
  nomeQuestionario,
  mesDescricao,
  inicial,
  salvar,
  voltarPara,
  caminhoDoFormulario,
}: {
  funcionarios: Funcionario[];
  funcionarioId: string | null;
  perguntas: Pergunta[];
  nomeQuestionario: string | null;
  mesDescricao: string;
  inicial: { notas: (number | null)[]; stop: string; start: string; continuar: string; jaAvaliado: boolean };
  salvar: (dados: { funcionarioId: string; notas: number[]; stop: string; start: string; continuar: string }) => Promise<ResultadoAdb>;
  voltarPara: string;
  caminhoDoFormulario: string;
}) {
  const router = useRouter();
  const [notas, setNotas] = useState<(number | null)[]>(inicial.notas);
  const [abertas, setAbertas] = useState({ stop: inicial.stop, start: inicial.start, continuar: inicial.continuar });
  const [resultado, setResultado] = useState<ResultadoAdb | null>(null);
  const [salvando, iniciar] = useTransition();

  const dadas = notas.filter((n): n is number => n !== null);
  const media = dadas.length ? dadas.reduce((a, b) => a + b, 0) / dadas.length : null;
  const escolhido = funcionarios.find((f) => f.id === funcionarioId);

  function enviar() {
    if (!funcionarioId) return;
    if (notas.some((n) => n === null)) {
      setResultado({ erro: "Dê uma nota de 1 a 5 para todas as perguntas." });
      return;
    }
    iniciar(async () => {
      const r = await salvar({ funcionarioId, notas: notas as number[], ...abertas });
      setResultado(r);
      if (!r.erro) router.push(voltarPara);
    });
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="funcionario" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Funcionário avaliado
          </label>
          <select
            id="funcionario"
            value={funcionarioId ?? ""}
            onChange={(e) => {
              // Recarrega a tela com o funcionário escolhido (traz o questionário dele e a avaliação do mês, se já houver).
              const url = new URL(caminhoDoFormulario, window.location.origin);
              if (e.target.value) url.searchParams.set("funcionario", e.target.value);
              router.replace(url.pathname + url.search);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Selecione o funcionário…</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} — {f.cargo}
                {f.periodo ? ` (${f.periodo})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mês da avaliação</p>
          <p className="mt-2 text-sm font-semibold capitalize text-slate-900">{mesDescricao}</p>
        </div>
      </div>

      {funcionarios.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Nenhum funcionário que entra na A.D.B (professores de sala, professores de lutas, estagiários ou recepção)
          cadastrado nesta academia. Cadastre em Academias →
          academia → Funcionários.
        </p>
      )}

      {escolhido && nomeQuestionario && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Questionário: <span className="font-semibold text-slate-900">{nomeQuestionario}</span>
              {inicial.jaAvaliado && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  já avaliado neste mês — as notas abaixo serão atualizadas
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              {Object.entries(CONCEITOS)
                .reverse()
                .map(([n, c]) => `${n} = ${c}`)
                .join(" · ")}
            </p>
          </div>

          <ol className="space-y-3">
            {perguntas.map((p, i) => (
              <li key={p.titulo} className="rounded-md border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold uppercase text-slate-900">
                  {i + 1}. {p.titulo}
                </p>
                <p className="mt-1 text-sm text-slate-600">{p.descricao}</p>
                <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`Nota da pergunta ${i + 1}`}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const ativa = notas[i] === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={ativa}
                        onClick={() => setNotas(notas.map((v, j) => (j === i ? n : v)))}
                        className={`min-w-24 rounded-md border px-3 py-1.5 text-sm ${
                          ativa
                            ? "border-marca bg-marca font-semibold text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {n} · {CONCEITOS[n]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-900">NOTA (Avaliação Desempenho): </span>
            <span className="text-lg font-bold tabular-nums text-slate-900">
              {media === null ? "—" : media.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
            </span>
            <span className="ml-2 text-slate-500">
              média das notas dadas ({dadas.length} de {perguntas.length})
            </span>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Perguntas abertas</h2>
            {PERGUNTAS_ABERTAS.map((p) => (
              <div key={p.campo}>
                <label htmlFor={p.campo} className="block text-sm text-slate-700">
                  <span className="font-semibold">{p.titulo}:</span> {p.descricao}
                </label>
                <textarea
                  id={p.campo}
                  rows={2}
                  value={abertas[p.campo]}
                  onChange={(e) => setAbertas({ ...abertas, [p.campo]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>

          {resultado?.erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={enviar}
              disabled={salvando}
              className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-60"
            >
              {salvando ? "Gravando…" : inicial.jaAvaliado ? "Atualizar avaliação" : "Gravar avaliação"}
            </button>
            <Link href={voltarPara} className="text-sm text-slate-600 underline hover:text-slate-900">
              Cancelar
            </Link>
          </div>
        </>
      )}

      {escolhido && !nomeQuestionario && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          O departamento deste funcionário não tem questionário de A.D.B.
        </p>
      )}
    </div>
  );
}
