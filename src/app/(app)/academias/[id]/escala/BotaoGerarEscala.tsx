"use client";

import { useState, useTransition } from "react";
import type { OpcoesEscala, ResultadoEscala } from "./actions";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const nomeDoMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const somarMes = (m: string, n: number) => {
  const [a, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(a, mm - 1 + n, 1)).toISOString().slice(0, 7);
};

type Funcionario = { id: string; nome: string; departamento: string };

// "Gerar escala": antes de processar, abre uma janela para escolher o mês (um por vez) e, se precisar, as
// folgas pedidas (funcionário + data em que ele não pode entrar na escala).
export function BotaoGerarEscala({
  gerar,
  mesAtual,
  funcionarios,
  folgasGravadas,
}: {
  gerar: (opcoes: OpcoesEscala) => Promise<ResultadoEscala>;
  mesAtual: string;
  funcionarios: Funcionario[];
  // Folgas já gravadas (do mês atual em diante): o diálogo abre com as do mês escolhido.
  folgasGravadas: { funcionarioId: string; data: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(mesAtual);
  const doMes = (m: string) => folgasGravadas.filter((f) => f.data.startsWith(m));
  const [folgas, setFolgas] = useState<{ funcionarioId: string; data: string }[]>(() => doMes(mesAtual));
  const [gerando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoEscala | null>(null);
  const meses = Array.from({ length: 13 }, (_, i) => somarMes(mesAtual, i));
  const [ano, mm] = mes.split("-").map(Number);
  const primeiroDia = `${mes}-01`;
  const ultimoDia = new Date(Date.UTC(ano, mm, 0)).toISOString().slice(0, 10);
  const nomeSetor = (d: string) =>
    ({ recepcao: "Recepção", limpeza: "Limpeza", professores: "Professor", estagiario: "Estagiário" })[d] ?? d;

  function confirmar() {
    const incompletas = folgas.filter((f) => !f.funcionarioId || !f.data);
    if (incompletas.length) {
      setResultado({ erro: "Preencha o funcionário e a data de cada folga (ou remova a linha)." });
      return;
    }
    if (folgas.some((f) => f.data < primeiroDia || f.data > ultimoDia)) {
      setResultado({ erro: `As datas das folgas precisam estar em ${nomeDoMes(mes)}.` });
      return;
    }
    setResultado(null);
    iniciar(async () => {
      const r = await gerar({ mes, indisponiveis: folgas });
      setResultado(r);
      if (!r.erro) setAberto(false);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setResultado(null);
          setAberto(true);
        }}
        className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
      >
        Gerar escala
      </button>
      {!aberto && resultado?.ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado.ok}</p>}
      {!aberto && resultado?.avisos && resultado.avisos.length > 0 && (
        <ul className="mt-2 list-disc rounded-md bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
          {resultado.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {!aberto && resultado?.trocas && resultado.trocas.length > 0 && (
        <div className="mt-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <p className="font-medium">Trocas feitas para não deixar turno vazio:</p>
          <ul className="list-disc pl-5">
            {resultado.trocas.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !gerando && setAberto(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gerar-escala-titulo"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 id="gerar-escala-titulo" className="text-lg font-semibold text-slate-900">
              Gerar escala
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A escala do mês escolhido é refeita (no mês atual, só de hoje em diante). Os outros meses não mudam.
            </p>

            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Mês da escala</span>
              <select
                value={mes}
                onChange={(e) => {
                  setMes(e.target.value);
                  setFolgas(doMes(e.target.value));
                }}
                className="w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5"
              >
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {nomeDoMes(m)}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-5">
              <p className="text-sm font-medium text-slate-700">Folgas pedidas (opcional)</p>
              <p className="text-xs text-slate-500">
                O funcionário não entra na escala na data escolhida. As folgas ficam gravadas: ao refazer a escala (ou na geração automática),
                elas continuam valendo.
              </p>
              <ul className="mt-2 space-y-2">
                {folgas.map((f, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      value={f.funcionarioId}
                      onChange={(e) => setFolgas((l) => l.map((x, j) => (j === i ? { ...x, funcionarioId: e.target.value } : x)))}
                      aria-label="Funcionário"
                      className="min-w-48 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">Funcionário…</option>
                      {funcionarios.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} ({nomeSetor(p.departamento)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={f.data}
                      min={primeiroDia}
                      max={ultimoDia}
                      onChange={(e) => setFolgas((l) => l.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)))}
                      aria-label="Data da folga"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setFolgas((l) => l.filter((_, j) => j !== i))}
                      className="text-sm text-red-700 underline"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setFolgas((l) => [...l, { funcionarioId: "", data: "" }])}
                className="mt-2 text-sm font-medium text-marca underline"
              >
                + Adicionar folga
              </button>
            </div>

            {resultado?.erro && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{resultado.erro}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={gerando}
                onClick={() => setAberto(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={gerando}
                onClick={confirmar}
                className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro disabled:opacity-60"
              >
                {gerando ? "Gerando…" : `Gerar escala de ${nomeDoMes(mes)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
