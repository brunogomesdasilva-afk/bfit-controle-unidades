import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { modulosDoPerfil } from "@/lib/modulos";
import { hoje, intervaloDoMes, lerMes } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { carregarTarefas, periodoDe, rotuloDoPeriodo, seAplica } from "@/lib/tarefas";
import { SeletorMes } from "../../AbasAcademias";
import { TabelaRelatorio } from "../../relatorios/comum";

// Log de tarefas (módulo ADM): quem está com tarefa pendente agora, a situação das tarefas mensais no mês
// escolhido e o histórico, dia a dia, do que cada usuário marcou como feito.

type Usuario = { id: string; nome: string; perfil: string; modulos: ReturnType<typeof modulosDoPerfil> };
type Feita = { id: string; tarefa_id: string; usuario_id: string; periodo: string; feita_em: string };

const quando = (d: string, opcoes: Intl.DateTimeFormatOptions) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...opcoes });
const dia = (d: string) => quando(d, { weekday: "short", day: "2-digit", month: "2-digit" });
const hora = (d: string) => quando(d, { hour: "2-digit", minute: "2-digit" });
const proximoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
};

export default async function LogTarefasPage({ searchParams }: PageProps<"/tarefas/log">) {
  await exigirModulo("adm");
  const params = await searchParams;
  const mes = lerMes(typeof params.mes === "string" ? params.mes : undefined);
  const { inicio } = intervaloDoMes(mes);
  const dataHoje = hoje();
  const supabase = await createClient();

  const [carregadas, { data: perfis }, { data: feitasMes }, { data: feitasAtuais }] = await Promise.all([
    carregarTarefas(supabase),
    supabase.from("profiles").select("*").eq("ativo", true).order("nome"),
    // Marcadas no mês escolhido (horário de Brasília).
    supabase
      .from("tarefas_feitas")
      .select("id, tarefa_id, usuario_id, periodo, feita_em")
      .gte("feita_em", `${inicio}T00:00:00-03:00`)
      .lt("feita_em", `${proximoMes(mes)}-01T00:00:00-03:00`)
      .order("feita_em", { ascending: false }),
    // Marcadas no período atual (para as pendências de agora) e no mês escolhido (situação das mensais).
    supabase.from("tarefas_feitas").select("id, tarefa_id, usuario_id, periodo, feita_em").in("periodo", [dataHoje, dataHoje.slice(0, 7), mes, "unica"]),
  ]);
  const { tarefas: todas, feriados } = carregadas;
  // Canceladas só aparecem no histórico e na lista de canceladas.
  const tarefas = todas.filter((t) => !t.cancelada_em);
  const canceladas = todas.filter((t) => t.cancelada_em);
  const usuarios: Usuario[] = (perfis ?? []).map((p) => ({ id: p.id, nome: p.nome, perfil: p.perfil, modulos: modulosDoPerfil(p) }));
  const nomeUsuario = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? "(usuário inativo)";
  const tituloTarefa = (id: string) => todas.find((t) => t.id === id)?.titulo ?? "";
  const feita = (lista: Feita[] | null, tarefa: string, usuario: string, periodo: string) =>
    (lista ?? []).find((f) => f.tarefa_id === tarefa && f.usuario_id === usuario && f.periodo === periodo);

  // Pendentes agora: tarefa ativa, já começou no período atual, é do usuário e não foi marcada.
  const pendentesAgora = tarefas.flatMap((t) => {
    const periodo = periodoDe(t, dataHoje, feriados);
    if (!periodo || !t.ativo) return [];
    const quem = usuarios.filter((u) => seAplica(t, u) && !feita(feitasAtuais as Feita[], t.id, u.id, periodo));
    return quem.length ? [{ tarefa: t, periodo, quem }] : [];
  });

  // Tarefas mensais no mês escolhido: cada usuário da tarefa, marcada (quando) ou não.
  const mensais = tarefas
    .filter((t) => t.recorrencia === "mensal")
    .map((t) => ({
      tarefa: t,
      linhas: usuarios.filter((u) => seAplica({ ...t, ativo: true }, u)).map((u) => ({ usuario: u, feita: feita(feitasAtuais as Feita[], t.id, u.id, mes) })),
    }))
    .filter((m) => m.linhas.length);

  // Tarefas pontuais: de quem é, desde quando e se já foi feita.
  const pontuais = tarefas
    .filter((t) => t.recorrencia === "pontual" && (t.ativo || feita(feitasAtuais as Feita[], t.id, t.usuario_id ?? "", "unica")))
    .map((t) => ({ tarefa: t, feita: feita(feitasAtuais as Feita[], t.id, t.usuario_id ?? "", "unica") }))
    .sort((a, b) => Number(Boolean(a.feita)) - Number(Boolean(b.feita)));
  const diasDesde = (d: string | null) => (d ? Math.max(0, Math.round((Date.parse(dataHoje) - Date.parse(d)) / 86400000)) : null);

  // Histórico do mês agrupado por dia.
  const porDia = new Map<string, Feita[]>();
  for (const f of (feitasMes ?? []) as Feita[]) {
    const k = quando(f.feita_em, { year: "numeric", month: "2-digit", day: "2-digit" });
    porDia.set(k, [...(porDia.get(k) ?? []), f]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Log de tarefas</h1>
          <p className="text-sm text-slate-500">O que cada usuário marcou como feito no checklist, dia a dia.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SeletorMes caminho="/tarefas/log" academia={null} mes={mes} />
          <Link href="/tarefas" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            Cadastro de tarefas
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Pendentes agora</h2>
        <TabelaRelatorio
          colunas={[
            { rotulo: "Tarefa", valor: (p) => p.tarefa.titulo, alinhar: "esquerda", destaque: true },
            { rotulo: "Período", valor: (p) => rotuloDoPeriodo(p.periodo), alinhar: "esquerda" },
            { rotulo: "Quem ainda não marcou", valor: (p) => p.quem.map((u) => u.nome).join(", "), alinhar: "esquerda" },
          ]}
          linhas={pendentesAgora}
          chave={(p) => p.tarefa.id}
          vazio="Nenhuma tarefa pendente agora."
        />
      </section>

      {pontuais.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Tarefas pontuais</h2>
          <TabelaRelatorio
            colunas={[
              { rotulo: "Tarefa", valor: (p) => p.tarefa.titulo, alinhar: "esquerda", destaque: true },
              { rotulo: "Usuário", valor: (p) => (p.tarefa.usuario_id ? nomeUsuario(p.tarefa.usuario_id) : "—"), alinhar: "esquerda" },
              { rotulo: "A partir de", valor: (p) => (p.tarefa.data_inicio ? p.tarefa.data_inicio.split("-").reverse().join("/") : "—"), alinhar: "esquerda" },
              {
                rotulo: "Situação",
                valor: (p) => {
                  if (p.feita)
                    return (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Feita em {quando(p.feita.feita_em, { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    );
                  const dias = diasDesde(p.tarefa.data_inicio);
                  if (p.tarefa.data_inicio && p.tarefa.data_inicio > dataHoje)
                    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Ainda não começou</span>;
                  return (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      Pendente{dias !== null ? ` há ${dias} ${dias === 1 ? "dia" : "dias"}` : ""}
                    </span>
                  );
                },
                alinhar: "esquerda",
              },
            ]}
            linhas={pontuais}
            chave={(p) => p.tarefa.id}
            vazio=""
          />
        </section>
      )}

      {mensais.map((m) => (
        <section key={m.tarefa.id}>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            {m.tarefa.titulo} · <span className="capitalize">{rotuloDoPeriodo(mes)}</span>
          </h2>
          <TabelaRelatorio
            colunas={[
              { rotulo: "Usuário", valor: (l) => l.usuario.nome, alinhar: "esquerda" },
              {
                rotulo: "Situação",
                valor: (l) =>
                  l.feita ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Feita em {quando(l.feita.feita_em, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Não marcada</span>
                  ),
                alinhar: "esquerda",
              },
            ]}
            linhas={m.linhas}
            chave={(l) => l.usuario.id}
            vazio=""
          />
        </section>
      ))}

      {canceladas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Tarefas canceladas</h2>
          <TabelaRelatorio
            colunas={[
              { rotulo: "Tarefa", valor: (t) => t.titulo, alinhar: "esquerda", destaque: true },
              { rotulo: "Cancelada em", valor: (t) => quando(t.cancelada_em!, { dateStyle: "short", timeStyle: "short" }), alinhar: "esquerda" },
              { rotulo: "Por", valor: (t) => (t.cancelada_por ? nomeUsuario(t.cancelada_por) : "—"), alinhar: "esquerda" },
            ]}
            linhas={canceladas}
            chave={(t) => t.id}
            vazio=""
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Histórico de <span className="capitalize">{rotuloDoPeriodo(mes)}</span>
        </h2>
        {porDia.size === 0 && <p className="text-sm text-slate-500">Nenhuma tarefa marcada neste mês.</p>}
        {[...porDia.entries()].map(([d, lista]) => (
          <div key={d}>
            <h3 className="mb-1 text-sm font-semibold capitalize text-marca">{dia(lista[0].feita_em)}</h3>
            <TabelaRelatorio
              colunas={[
                { rotulo: "Hora", valor: (f) => hora(f.feita_em), alinhar: "esquerda" },
                { rotulo: "Usuário", valor: (f) => nomeUsuario(f.usuario_id), alinhar: "esquerda", destaque: true },
                { rotulo: "Tarefa", valor: (f) => tituloTarefa(f.tarefa_id), alinhar: "esquerda" },
                { rotulo: "Período", valor: (f) => rotuloDoPeriodo(f.periodo), alinhar: "esquerda" },
              ]}
              linhas={lista}
              chave={(f) => f.id}
              vazio=""
            />
          </div>
        ))}
      </section>
    </div>
  );
}
