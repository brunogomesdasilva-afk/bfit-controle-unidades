import { exigirModulo } from "@/lib/auth";
import { contextoAcademias } from "@/lib/contexto";
import { DEPARTAMENTOS, PROFESSORES, type Funcionario } from "@/lib/database.types";
import { fechamentoColetivas } from "@/lib/fechamentoColetivas";
import { hoje, intervaloDoMes, lerMes } from "@/lib/planilha";
import { AbasAcademias } from "../../AbasAcademias";
import { SemAcademias } from "../../SemAcademias";
import { CabecalhoRelatorio, formatarDia, nomeDoMes, TabelaRelatorio, type ColunaRelatorio } from "../../relatorios/comum";

type LinhaFolha = Funcionario & { admitidoNoMes: boolean; horasAPagar: number | null };

const horas = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;

const COLUNAS: ColunaRelatorio<LinhaFolha>[] = [
  { rotulo: "Nome", valor: (f) => f.nome, alinhar: "esquerda", destaque: true },
  { rotulo: "Departamento", valor: (f) => DEPARTAMENTOS[f.departamento as keyof typeof DEPARTAMENTOS] ?? f.departamento, alinhar: "esquerda" },
  { rotulo: "PJ", valor: (f) => (PROFESSORES.includes(f.departamento) ? (f.pj ? "Sim" : "Não") : "—") },
  {
    rotulo: "Contratação",
    valor: (f) =>
      f.data_contratacao ? (
        <>
          {formatarDia(f.data_contratacao)}
          {f.admitidoNoMes && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800">no mês</span>}
        </>
      ) : (
        "—"
      ),
  },
  { rotulo: "Horas a pagar (coletivas/lutas)", valor: (f) => (f.horasAPagar === null ? "—" : horas(f.horasAPagar)) },
];

// Conferência da folha de pagamento: por academia e mês, quem entra na folha (funcionários ativos já
// contratados até o fim do mês), separando PJ dos demais, com as horas a pagar dos professores de
// coletivas e de lutas tiradas do fechamento coletivas.
export default async function ConferenciaFolhaPage({ searchParams }: PageProps<"/rh/folha">) {
  await exigirModulo("rh");
  const params = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(
    typeof params.academia === "string" ? params.academia : undefined
  );
  // Padrão: o mês anterior (o último mês fechado).
  const [a, m] = hoje().split("-").map(Number);
  const mesAnterior = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const mes = typeof params.mes === "string" ? lerMes(params.mes) : mesAnterior;
  const { inicio, fim } = intervaloDoMes(mes);

  const unidades = selecionada ? academias.filter((u) => u.id === selecionada) : academias;
  const dados = await Promise.all(
    unidades.map(async (u) => {
      const [{ data }, coletivas] = await Promise.all([
        supabase.from("funcionarios").select("*").eq("academia_id", u.id).eq("ativo", true).order("nome"),
        fechamentoColetivas(supabase, u.id, mes),
      ]);
      // Horas a pagar somadas por professor (o mesmo nome pode aparecer em coletivas e em lutas).
      const aPagar = new Map<string, number>();
      for (const p of coletivas.professores) aPagar.set(p.professor, (aPagar.get(p.professor) ?? 0) + p.aPagar);
      return ((data ?? []) as Funcionario[])
        .filter((f) => !f.data_contratacao || f.data_contratacao <= fim)
        .map<LinhaFolha>((f) => ({
          ...f,
          admitidoNoMes: Boolean(f.data_contratacao && f.data_contratacao >= inicio),
          horasAPagar:
            f.departamento === "professor_coletivas" || f.departamento === "professor_lutas" ? (aPagar.get(f.nome) ?? 0) : null,
        }));
    })
  );

  return (
    <div>
      <CabecalhoRelatorio titulo="Conferência da folha de pagamento" periodo={nomeDoMes(mes)} />

      {academias.length === 0 ? (
        <SemAcademias admin={admin} />
      ) : (
        <>
          <div className="print:hidden">
            <AbasAcademias academias={academias} selecionada={selecionada} mes={mes} caminho="/rh/folha" />
          </div>
          <div className="space-y-8">
            {unidades.map((unidade, i) => {
              const linhas = dados[i];
              const pj = linhas.filter((f) => PROFESSORES.includes(f.departamento) && f.pj);
              const demais = linhas.filter((f) => !pj.includes(f));
              return (
                <section key={unidade.id} className="break-inside-avoid-page rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-3">
                    <h2 className="text-base font-semibold text-slate-900">{unidade.nome}</h2>
                    <p className="text-sm text-slate-600">
                      {linhas.length} na folha · {demais.length} CLT/outros · {pj.length} PJ ·{" "}
                      {linhas.filter((f) => f.admitidoNoMes).length} admitidos no mês
                    </p>
                  </div>
                  <h3 className="mb-2 text-sm font-semibold text-marca">Funcionários ({demais.length})</h3>
                  <TabelaRelatorio colunas={COLUNAS} linhas={demais} chave={(f) => f.id} vazio="Nenhum funcionário ativo." />
                  <h3 className="mb-2 mt-5 text-sm font-semibold text-marca">Professores PJ ({pj.length})</h3>
                  <TabelaRelatorio colunas={COLUNAS} linhas={pj} chave={(f) => f.id} vazio="Nenhum professor marcado como PJ." />
                </section>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500 print:hidden">
            Entram os funcionários ativos contratados até o fim do mês. As horas a pagar dos professores de coletivas e de
            lutas vêm do Fechamento coletivas da academia (aulas dadas + substituições + extras).
          </p>
        </>
      )}
    </div>
  );
}
