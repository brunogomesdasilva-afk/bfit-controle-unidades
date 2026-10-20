import { cookies } from "next/headers";
import { diaDaSemana, formatarDia, lembretesDeAniversario } from "@/lib/aniversarios";
import { logout } from "@/app/login/actions";
import { getPerfilAtual } from "@/lib/auth";
import { COM_CREF } from "@/lib/database.types";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { carregarTarefas, pendentesDe, type Pendente } from "@/lib/tarefas";
import { AvisoContagens } from "./AvisoContagens";
import { ChecklistTarefas } from "./ChecklistTarefas";
import { AvisoVencimentos, type Vencimento } from "./AvisoVencimentos";
import { LembreteAniversario, type Lembrete } from "./LembreteAniversario";
import { Sidebar } from "./Sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const atual = await getPerfilAtual();
  const cookieStore = await cookies();
  const recolhido = cookieStore.get("sidebar_recolhido")?.value === "1";
  const submenusAbertos = decodeURIComponent(cookieStore.get("submenus_abertos")?.value ?? "")
    .split(",")
    .filter(Boolean);

  // Cada academia vira um submenu de "Academias": o administrador vê todas; o usuário de
  // uma academia, só a dele (a regra de acesso do banco já filtra).
  let academias: { id: string; nome: string }[] = [];
  let lembretes: Lembrete[] = [];
  let vencimentos: Vencimento[] = [];
  let pendentes: Pendente[] = [];
  // Identifica o login atual: o aviso de contagens faltando volta a cada novo login.
  let sessao = "";
  // Backup em andamento: só o administrador usa o sistema (o banco também bloqueia os demais).
  let manutencao = false;
  const dataHoje = hoje();
  if (atual) {
    const supabase = await createClient();
    const { data: estado } = await supabase.from("sistema_estado").select("manutencao").eq("id", 1).maybeSingle();
    manutencao = Boolean(estado?.manutencao);
    const { data: auth } = await supabase.auth.getUser();
    sessao = auth.user?.last_sign_in_at ?? "";
    const { data } = await supabase.from("academias").select("id, nome").order("nome");
    academias = data ?? [];
    // Datas importantes vencidas ou vencendo nos próximos 30 dias (a regra do banco já filtra a academia).
    const limite = new Date(Date.parse(`${dataHoje}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
    const { data: datas } = await supabase
      .from("datas_importantes")
      .select("id, academia_id, item, vencimento")
      .not("vencimento", "is", null)
      .lte("vencimento", limite)
      .order("vencimento");
    const diasAte = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${dataHoje}T12:00:00Z`)) / 86400000);
    const ate = (dias: number) => new Date(Date.parse(`${dataHoje}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
    const nomeDe = (id: string) => academias.find((a) => a.id === id)?.nome ?? "";
    vencimentos = (datas ?? []).map((d) => ({
      id: d.id as string,
      academiaId: d.academia_id as string,
      academia: nomeDe(d.academia_id as string),
      item: d.item as string,
      vencimento: d.vencimento as string,
      dias: diasAte(d.vencimento as string),
      link: `/academias/${d.academia_id}/datas`,
    }));
    // Funcionários ativos: CREF vencido ou vencendo em 7 dias (professores) e férias com limite em 60 dias.
    const [{ data: crefs }, { data: ferias }] = await Promise.all([
      supabase
        .from("funcionarios")
        .select("id, academia_id, nome, cref_vencimento")
        .eq("ativo", true)
        .in("departamento", COM_CREF)
        .not("cref_vencimento", "is", null)
        .lte("cref_vencimento", ate(7)),
      supabase
        .from("funcionarios")
        .select("id, academia_id, nome, ferias_limite")
        .eq("ativo", true)
        .not("ferias_limite", "is", null)
        .lte("ferias_limite", ate(60)),
    ]);
    for (const f of crefs ?? [])
      vencimentos.push({
        id: `cref-${f.id}`,
        academiaId: f.academia_id as string,
        academia: nomeDe(f.academia_id as string),
        item: `CREF de ${f.nome}`,
        vencimento: f.cref_vencimento as string,
        dias: diasAte(f.cref_vencimento as string),
        link: `/academias/${f.academia_id}/funcionarios`,
      });
    for (const f of ferias ?? [])
      vencimentos.push({
        id: `ferias-${f.id}`,
        academiaId: f.academia_id as string,
        academia: nomeDe(f.academia_id as string),
        item: `Férias de ${f.nome} (limite para tirar)`,
        vencimento: f.ferias_limite as string,
        dias: diasAte(f.ferias_limite as string),
        link: `/academias/${f.academia_id}/funcionarios`,
      });
    vencimentos.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    // Checklist de tarefas do usuário: as do tipo de acesso dele ainda não marcadas no dia (ou no mês).
    const [doChecklist, { data: feitas }] = await Promise.all([
      carregarTarefas(supabase, { soAtivas: true }),
      supabase.from("tarefas_feitas").select("tarefa_id, periodo").eq("usuario_id", atual.id).in("periodo", [dataHoje, dataHoje.slice(0, 7), "unica"]),
    ]);
    pendentes = pendentesDe(doChecklist.tarefas, feitas ?? [], atual, dataHoje, doChecklist.feriados);
    // Aniversários de hoje (e do fim de semana/feriado seguinte, avisados no último dia útil).
    lembretes = (await lembretesDeAniversario(supabase, academias.map((a) => a.id))).map((a) => ({
      chave: `${a.academiaId}-${a.nome}-${a.dia}`,
      nome: a.nome,
      academia: academias.find((x) => x.id === a.academiaId)?.nome ?? "",
      departamento: a.departamento,
      idade: a.idade,
      quando: a.dia === dataHoje ? "hoje" : `${diaDaSemana(a.dia)}, ${formatarDia(a.dia).slice(0, 5)}`,
    }));
  }

  if (manutencao && atual?.perfil !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Sistema em manutenção</h1>
          <p className="mt-2 text-sm text-slate-600">
            Estamos fazendo o backup dos dados. Em alguns minutos o sistema volta: atualize esta página para tentar de novo.
          </p>
          <form action={logout} className="mt-4">
            <button className="text-sm text-slate-500 underline hover:text-slate-800">Sair</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        nome={atual?.nome ?? ""}
        perfil={atual?.perfil ?? "usuario"}
        academiaNome={atual?.academiaNome ?? null}
        academias={academias}
        recolhidoInicial={recolhido}
        submenusIniciais={submenusAbertos}
        modulos={atual?.modulos ?? []}
      />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6 print:p-0">
        {manutencao && (
          <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
            Sistema em manutenção (backup): só você está acessando. Se nenhum backup estiver rodando, libere em Backup.
          </p>
        )}
        {atual && atual.perfil !== "coletivas" && <ChecklistTarefas sessao={sessao} pendentes={pendentes} />}
        {/* Avisos das academias: só para quem usa o módulo Academia (o perfil Coletivas vê só o de contagens). */}
        {atual?.modulos.includes("academia") && <AvisoContagens sessao={sessao} />}
        {atual?.modulos.includes("academia") && atual.perfil !== "coletivas" && (
          <AvisoVencimentos sessao={`${sessao}-${dataHoje}`} vencimentos={vencimentos} />
        )}
        {atual?.perfil !== "coletivas" && <LembreteAniversario dia={dataHoje} lembretes={lembretes} />}
        {children}
      </main>
    </div>
  );
}
