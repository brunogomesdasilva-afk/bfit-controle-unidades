"use client";

import { useEffect, useState, useTransition } from "react";
import type { AulaParaLancar } from "../lancamentos";

type Carregado = { aulas: AulaParaLancar[]; jaLancadas: number; temGrade: boolean; feriado: string | null };
type Linha = AulaParaLancar & { quantidade: string; substituto: string };

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Lançamento pela grade: escolhe o dia e aparecem as aulas da grade daquele dia (horário, modalidade e
// professor já preenchidos). O gerente digita só a quantidade de alunos; o substituto é opcional.
export function LancarPelaGrade({
  tipo,
  hoje,
  carregar,
  lancar,
}: {
  tipo: "coletivas" | "lutas";
  hoje: string;
  carregar: (data: string) => Promise<Carregado>;
  lancar: (data: string, itens: Linha[]) => Promise<{ erro?: string; ok?: string }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje);
  const [info, setInfo] = useState<Carregado | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resultado, setResultado] = useState<{ erro?: string; ok?: string } | null>(null);
  const [carregando, iniciarCarga] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();

  useEffect(() => {
    if (!aberto || !data) return;
    let ativo = true;
    iniciarCarga(async () => {
      const r = await carregar(data);
      if (!ativo) return;
      setInfo(r);
      setLinhas(r.aulas.map((a) => ({ ...a, quantidade: "", substituto: "" })));
    });
    return () => {
      ativo = false;
    };
  }, [aberto, data, carregar]);

  const alterar = (i: number, campo: "quantidade" | "substituto", valor: string) =>
    setLinhas((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  function salvar() {
    setResultado(null);
    iniciarSalvar(async () => {
      const r = await lancar(data, linhas);
      setResultado(r);
      if (!r.erro) {
        const recarregado = await carregar(data);
        setInfo(recarregado);
        setLinhas(recarregado.aulas.map((a) => ({ ...a, quantidade: "", substituto: "" })));
      }
    });
  }

  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mb-3 rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
      >
        Lançar aulas do dia pela grade
      </button>
    );

  const diaSemana = DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()];
  return (
    <div className="mb-4 rounded-lg border border-marca/30 bg-sky-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-slate-500">Dia das aulas</span>
          <input
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => setData(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
          />
        </label>
        <button type="button" onClick={() => setAberto(false)} className="text-sm text-slate-500 underline hover:text-slate-800">
          Fechar
        </button>
      </div>

      {carregando && <p className="text-sm text-slate-500">Buscando a grade…</p>}
      {!carregando && info && !info.temGrade && (
        <p className="text-sm text-amber-800">
          Esta unidade ainda não tem grade de {tipo}. Cadastre em Academias → unidade → Grade de aulas.
        </p>
      )}
      {!carregando && info?.temGrade && (
        <>
          <p className="mb-2 text-sm text-slate-600">
            <span className="capitalize">{diaSemana}</span>, {data.split("-").reverse().join("/")}
            {info.feriado && <span className="ml-2 font-medium text-amber-800">· feriado: {info.feriado}</span>}
            {info.jaLancadas > 0 && <span className="ml-2 text-slate-500">· {info.jaLancadas} aula(s) já lançada(s) neste dia</span>}
          </p>
          {linhas.length === 0 ? (
            <p className="text-sm text-slate-500">
              {info.jaLancadas ? "Todas as aulas da grade deste dia já foram lançadas." : "Não há aulas na grade para este dia."}
            </p>
          ) : (
            <div className="overflow-auto rounded-md border border-slate-300 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Horário</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Modalidade</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Professor</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Quantidade de alunos</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left normal-case">Substituto (se outro deu a aula)</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={`${l.horario}${l.modalidade}`}>
                      <td className="border border-slate-300 bg-slate-50 px-2 py-1.5 tabular-nums">{l.horario}</td>
                      <td className="border border-slate-300 bg-slate-50 px-2 py-1.5">{l.modalidade}</td>
                      <td className="border border-slate-300 bg-slate-50 px-2 py-1.5">{l.professor ?? <span className="text-amber-700">sem professor na grade</span>}</td>
                      <td className="border border-slate-300 px-1 py-1">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={l.quantidade}
                          onChange={(e) => alterar(i, "quantidade", e.target.value)}
                          aria-label={`Alunos na aula das ${l.horario}`}
                          className="w-24 rounded border border-slate-300 px-2 py-1 tabular-nums"
                        />
                      </td>
                      <td className="border border-slate-300 px-1 py-1">
                        <input
                          value={l.substituto}
                          onChange={(e) => alterar(i, "substituto", e.target.value)}
                          aria-label={`Substituto na aula das ${l.horario}`}
                          className="w-48 rounded border border-slate-300 px-2 py-1"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {linhas.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-50"
              >
                {salvando ? "Salvando…" : "Salvar quantidades"}
              </button>
              <span className="text-xs text-slate-500">Aulas deixadas em branco não são lançadas (se a aula não aconteceu, digite 0).</span>
            </div>
          )}
          {resultado?.erro && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}
          {resultado?.ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
        </>
      )}
    </div>
  );
}
