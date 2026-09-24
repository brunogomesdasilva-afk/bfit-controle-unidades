import { cookies } from "next/headers";
import { getPerfilAtual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  if (atual) {
    const supabase = await createClient();
    const { data } = await supabase.from("academias").select("id, nome").order("nome");
    academias = data ?? [];
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        nome={atual?.nome ?? ""}
        perfil={atual?.perfil ?? "usuario"}
        academiaNome={atual?.academiaNome ?? null}
        academias={academias}
        recolhidoInicial={recolhido}
        submenusIniciais={submenusAbertos}
      />
      <main className="min-w-0 flex-1 px-6 py-6 print:p-0">
        {children}
      </main>
    </div>
  );
}
