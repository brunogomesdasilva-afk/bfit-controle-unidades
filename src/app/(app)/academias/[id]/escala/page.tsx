import { SETORES, type Setor } from "@/lib/escala";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { excluirFeriado, gerarEscalaDaUnidade, salvarFeriado } from "./actions";
import { BotaoGerarEscala } from "./BotaoGerarEscala";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const formatarDia = (d: string) => d.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

const COLUNAS_FERIADOS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: "w-36" },
  { campo: "nome", rotulo: "Feriado", tipo: "texto", obrigatorio: true, largura: "min-w-56" },
  {
    campo: "fechada",
    rotulo: "Academia fechada?",
    tipo: "opcoes",
    largura: "w-40",
    opcoes: [
      { valor: "nao", rotulo: "Não (abre 10h–16h)" },
      { valor: "sim", rotulo: "Sim (sem escala)" },
    ],
  },
];

type Turno = { data: string; setor: Setor; inicio: string; fim: string; ordem: number; funcionario_id: string | null };

// Escala de fins de semana e feriados da unidade (recepção e limpeza), de hoje em diante. É gerada um mês por
// vez (a janela do botão pergunta o mês e as folgas pedidas).
export default async function EscalaPage({ params }: PageProps<"/academias/[id]/escala">) {
  const { id } = await params;
  const supabase = await createClient();
  const dataHoje = hoje();
  const fimDoAno = `${dataHoje.slice(0, 4)}-12-31`;

  const [{ data: turnos }, { data: funcionarios }, { data: feriados }] = await Promise.all([
    supabase
      .from("escala")
      .select("data, setor, inicio, fim, ordem, funcionario_id")
      .eq("academia_id", id)
      .in("setor", ["recepcao", "limpeza"])
      .gte("data", dataHoje)
      .order("data")
      .order("setor")
      .order("ordem"),
    supabase.from("funcionarios").select("id, nome, departamento").eq("academia_id", id).eq("ativo", true).in("departamento", ["recepcao", "limpeza"]).order("nome"),
    supabase.from("feriados").select("id, data, nome, fechada, academia_id").or(`academia_id.is.null,academia_id.eq.${id}`).gte("data", `${dataHoje.slice(0, 4)}-01-01`).order("data"),
  ]);
  const lista = (turnos ?? []) as Turno[];
  const nome = new Map((funcionarios ?? []).map((f) => [f.id as string, f.nome as string]));
  const feriadoDoDia = new Map<string, string>();
  for (const f of feriados ?? []) if (!feriadoDoDia.has(f.data) || f.academia_id) feriadoDoDia.set(f.data, f.nome);

  // Agrupa por dia e por mês para a tabela.
  const dias = [...new Set(lista.map((t) => t.data))];
  const porMes = new Map<string, string[]>();
  for (const d of dias) porMes.set(d.slice(0, 7), [...(porMes.get(d.slice(0, 7)) ?? []), d]);
  const semPessoa = lista.filter((t) => !t.funcionario_id).length;

  // Resumo: quantos turnos cada pessoa tem e qual é o próximo.
  const resumo = (funcionarios ?? []).map((f) => {
    const meus = lista.filter((t) => t.funcionario_id === f.id);
    return { ...f, total: meus.length, proximo: meus[0] };
  });

  const nacionais = (feriados ?? []).filter((f) => !f.academia_id && f.data >= dataHoje && f.data <= fimDoAno);
  const daUnidade: Linha[] = (feriados ?? [])
    .filter((f) => f.academia_id)
    .map((f) => ({ id: f.id, data: f.data, nome: f.nome, fechada: f.fechada ? "sim" : "nao" }));

  const celula = (d: string, setor: Setor) => {
    const doSetor = lista.filter((t) => t.data === d && t.setor === setor);
    if (doSetor.length === 0) return <span className="text-slate-400">—</span>;
    return (
      <ul className="space-y-0.5">
        {doSetor.map((t) => (
          <li key={`${t.ordem}`} className="flex gap-2">
            <span className="tabular-nums text-slate-500">
              {t.inicio.slice(0, 5)}–{t.fim.slice(0, 5)}
            </span>
            {t.funcionario_id ? (
              <span className="font-medium text-slate-900">{nome.get(t.funcionario_id) ?? "—"}</span>
            ) : (
              <span className="font-semibold text-red-700">sem pessoa disponível</span>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Escala de fins de semana e feriados</p>
          <p>
            Recepção: sábado 08:00–14:00 e 11:00–16:00 · domingo/feriado 10:00–16:00. Limpeza: sábado 2 pessoas 08:00–16:00
            · domingo/feriado 10:00–16:00.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Regras: 11h de descanso entre jornadas, nunca 7 dias seguidos e revezamento de domingos (homens no máximo 2
            seguidos, mulheres 1). Considera que recepção e limpeza trabalham de segunda a sexta no horário do cadastro.
          </p>
        </div>
        <BotaoGerarEscala gerar={gerarEscalaDaUnidade.bind(null, id)} mesAtual={dataHoje.slice(0, 7)} funcionarios={(funcionarios ?? []) as { id: string; nome: string; departamento: string }[]} />
      </div>

      {(funcionarios ?? []).length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Nenhum funcionário de Recepção ou Limpeza cadastrado nesta unidade. Cadastre na aba Funcionários (com horário de
          entrada, saída e gênero) antes de gerar a escala.
        </p>
      )}

      {lista.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma escala gerada de hoje até 31/12. Clique em “Gerar escala”.
        </p>
      ) : (
        <>
          {semPessoa > 0 && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {semPessoa} {semPessoa === 1 ? "turno está" : "turnos estão"} sem pessoa disponível pelas regras. Cadastre mais
              pessoas no setor ou revise os horários de entrada e saída.
            </p>
          )}
          {[...porMes.entries()].map(([mes, diasDoMes]) => (
            <section key={mes}>
              <h3 className="mb-2 text-sm font-semibold text-marca">
                {MESES[Number(mes.slice(5, 7)) - 1]} de {mes.slice(0, 4)}
              </h3>
              <div className="overflow-auto rounded-md border border-slate-300 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="border border-slate-300 px-2 py-1.5">Data</th>
                      <th className="border border-slate-300 px-2 py-1.5">Dia</th>
                      <th className="border border-slate-300 px-2 py-1.5">{SETORES.recepcao.nome}</th>
                      <th className="border border-slate-300 px-2 py-1.5">{SETORES.limpeza.nome}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasDoMes.map((d) => (
                      <tr key={d} className={feriadoDoDia.has(d) ? "bg-amber-50" : diaDaSemana(d) === 0 ? "bg-slate-50" : ""}>
                        <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5 tabular-nums">{formatarDia(d)}</td>
                        <td className="whitespace-nowrap border border-slate-300 px-2 py-1.5">
                          {feriadoDoDia.has(d) ? <span className="font-medium text-amber-800">Feriado · {feriadoDoDia.get(d)}</span> : DIAS[diaDaSemana(d)]}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5">{celula(d, "recepcao")}</td>
                        <td className="border border-slate-300 px-2 py-1.5">{celula(d, "limpeza")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Turnos por pessoa (de hoje até 31/12)</h3>
            <div className="overflow-auto rounded-md border border-slate-300 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="border border-slate-300 px-2 py-1.5">Funcionário</th>
                    <th className="border border-slate-300 px-2 py-1.5">Setor</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">Turnos</th>
                    <th className="border border-slate-300 px-2 py-1.5">Próximo</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((r) => (
                    <tr key={r.id}>
                      <td className="border border-slate-300 px-2 py-1.5 font-medium">{r.nome}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{SETORES[r.departamento as Setor].nome}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{r.total}</td>
                      <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                        {r.proximo ? `${formatarDia(r.proximo.data)} (${DIAS[diaDaSemana(r.proximo.data)].toLowerCase()}) ${r.proximo.inicio.slice(0, 5)}–${r.proximo.fim.slice(0, 5)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Feriados</h3>
          <p className="text-xs text-slate-500">
            Nacionais até o fim do ano:{" "}
            {nacionais.length ? nacionais.map((f) => `${formatarDia(f.data)} ${f.nome}`).join(" · ") : "nenhum"}. Inclua
            abaixo os feriados da cidade desta unidade e marque os dias em que a academia fecha (para fechar num feriado
            nacional, inclua a mesma data aqui com “Sim”). Depois, gere a escala de novo.
          </p>
        </div>
        <Planilha
          colunas={COLUNAS_FERIADOS}
          linhas={daUnidade}
          salvar={salvarFeriado.bind(null, id)}
          excluir={excluirFeriado}
          padroesNovo={{ fechada: "nao" }}
          rotuloNovo="+ Novo feriado"
          vazio="Nenhum feriado da cidade cadastrado."
        />
      </section>
    </div>
  );
}
