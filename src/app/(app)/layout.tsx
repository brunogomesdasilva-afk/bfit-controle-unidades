import { cookies } from "next/headers";
import { diaDaSemana, formatarDia, lembretesDeAniversario } from "@/lib/aniversarios";
import { getPerfilAtual } from "@/lib/auth";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { AvisoContagens } from "./AvisoContagens";
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
  // Identifica o login atual: o aviso de contagens faltando volta a cada novo login.
  let sessao = "";
  const dataHoje = hoje();
  if (atual) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    sessao = auth.user?.last_sign_in_at ?? "";
    const { data } = await supabase.from("academias").select("id, nome").order("nome");
    academias = data ?? [];
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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        nome={atual?.nome ?? ""}
        perfil={atual?.perfil ?? "usuario"}
        academiaNome={atual?.academiaNome ?? null}
        academias={academias}
        recolhidoInicial={recolhido}
        submenusIniciais={submenusAbertos}
      />
      <main className="min-w-0 flex-1 px-3 py-4 md:px-6 md:py-6 print:p-0">
        {atual && <AvisoContagens sessao={sessao} />}
        <LembreteAniversario dia={dataHoje} lembretes={lembretes} />
        {children}
      </main>
    </div>
  );
}
