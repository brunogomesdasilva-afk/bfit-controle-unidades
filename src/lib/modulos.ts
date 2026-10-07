// Módulos do sistema: cada usuário só usa os módulos marcados no cadastro de Usuários.
// Sem dependências do servidor: é usado no proxy, nas telas e no menu.

export const MODULOS = {
  academia: "Academia",
  rh: "RH",
  financeiro: "Financeiro",
  adm: "ADM",
} as const;

export type Modulo = keyof typeof MODULOS;

export const DESCRICAO_MODULOS: Record<Modulo, string> = {
  academia: "Painel, academias, vendas, frequência, compras, manutenção, A.D.B, relatórios e clientes",
  rh: "Menu RH (conferência da folha)",
  financeiro: "Menu Financeiro",
  adm: "Usuários, Tarefas e Backup (só com acesso a todas as academias)",
};

// Primeira tela de cada módulo (para onde o usuário vai ao entrar ou ao abrir uma tela que não pode usar).
const INICIO: Record<Modulo, string> = { academia: "/", rh: "/rh/folha", financeiro: "/financeiro", adm: "/usuarios" };

// Telas livres para qualquer usuário logado.
const LIVRES = ["/minha-conta", "/login", "/auth/", "/api/"];

const PREFIXOS: [string, Modulo][] = [
  ["/rh", "rh"],
  ["/financeiro", "financeiro"],
  ["/usuarios", "adm"],
  ["/backup", "adm"],
  ["/tarefas", "adm"],
];

const comecaCom = (caminho: string, prefixo: string) =>
  prefixo.endsWith("/") ? caminho.startsWith(prefixo) : caminho === prefixo || caminho.startsWith(`${prefixo}/`);

// Módulo de uma tela; null = tela livre. Tudo que não é RH, Financeiro ou ADM é do módulo Academia.
export function moduloDaRota(caminho: string): Modulo | null {
  if (LIVRES.some((p) => comecaCom(caminho, p))) return null;
  return PREFIXOS.find(([p]) => comecaCom(caminho, p))?.[1] ?? "academia";
}

// Módulos do perfil gravado no banco. Banco ainda sem a coluna "modulos": o administrador fica com todos e os
// demais com o módulo Academia (o acesso que já tinham).
export function modulosDoPerfil(perfil: { perfil?: string | null; modulos?: string[] | null } | null): Modulo[] {
  if (!perfil) return [];
  if (!Array.isArray(perfil.modulos)) return perfil.perfil === "admin" ? (Object.keys(MODULOS) as Modulo[]) : ["academia"];
  return perfil.modulos.filter((m): m is Modulo => m in MODULOS);
}

// Tela inicial do usuário: a do primeiro módulo que ele tem (sem nenhum, Minha conta).
export function inicioDoUsuario(modulos: Modulo[]) {
  const primeiro = (Object.keys(MODULOS) as Modulo[]).find((m) => modulos.includes(m));
  return primeiro ? INICIO[primeiro] : "/minha-conta";
}
