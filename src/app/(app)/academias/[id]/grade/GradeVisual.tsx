import { DIAS_SEMANA, type AulaDaGrade, type Tipo } from "@/lib/fechamentoColetivas";

// Grade no mesmo formato das artes de divulgação da rede: fundo azul-escuro, dias em ciano, horários à
// esquerda e cada aula num bloco claro (modalidade e, embaixo, o professor). Mostra a grade vigente.
export function GradeVisual({ aulas, tipo, unidade }: { aulas: AulaDaGrade[]; tipo: Tipo; unidade: string }) {
  if (!aulas.length) return null;
  // Segunda a sexta sempre; sábado e domingo só se tiverem aula.
  const dias = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || aulas.some((a) => a.dia_semana === d));
  const horarios = [...new Set(aulas.map((a) => a.horario.slice(0, 5)))].sort();
  const noHorario = (d: number, h: string) => aulas.filter((a) => a.dia_semana === d && a.horario.slice(0, 5) === h);

  return (
    <div className="overflow-auto rounded-xl bg-[#0d0a4a] p-5 print:bg-white">
      <div className="mb-5 text-center">
        <span className="inline-block bg-cyan-400 px-4 py-1 text-lg font-bold text-[#0d0a4a]">Grade de aulas</span>
        <p className="mt-2 text-3xl font-semibold text-white">{tipo === "lutas" ? "Lutas" : "Dança e Ginástica"}</p>
      </div>
      <table className="mx-auto border-separate border-spacing-1.5 text-xs">
        <thead>
          <tr>
            <th />
            {dias.map((d) => (
              <th key={d} className="min-w-32 rounded-sm bg-cyan-400 px-3 py-1.5 font-semibold uppercase text-[#0d0a4a]">
                {DIAS_SEMANA[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horarios.map((h, i) => (
            <tr key={h}>
              <th className="rounded-sm bg-cyan-400 px-3 py-1.5 font-semibold tabular-nums text-[#0d0a4a]">{h}</th>
              {dias.map((d) => {
                const doHorario = noHorario(d, h);
                return (
                  <td
                    key={d}
                    className={`rounded-sm px-2 py-1 text-center align-middle ${i % 2 ? "bg-slate-200" : "bg-white"}`}
                  >
                    {doHorario.map((a) => (
                      <div key={a.id} className="leading-tight">
                        <span className="block font-bold uppercase text-[#0d0a4a]">{a.modalidade}</span>
                        <span className="block text-[10px] text-slate-600">{a.professor ?? "sem professor"}</span>
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-5 text-center text-xl font-bold text-white">
        BlueFit <span className="block text-base font-semibold uppercase tracking-wide">{unidade}</span>
      </p>
    </div>
  );
}
