"use client";

import { Logo } from "@/app/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { logout } from "@/app/login/actions";

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

type ItemMenu = {
  href: string;
  rotulo: string;
  somenteAdmin?: boolean;
  ativo: (pathname: string) => boolean;
  icone: ReactNode;
  filhos?: ItemMenu[];
};

const ITENS: ItemMenu[] = [
  {
    href: "/",
    rotulo: "Painel",
    ativo: (p: string) => p === "/",
    icone: (
      <Icone>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </Icone>
    ),
  },
  {
    href: "/academias",
    rotulo: "Cadastro de academias",
    somenteAdmin: true,
    ativo: (p: string) => p === "/academias",
    icone: (
      <Icone>
        <path d="M6.5 6.5h11M6.5 17.5h11" />
        <path d="M3 9v6M21 9v6M6.5 5v14M17.5 5v14" />
      </Icone>
    ),
  },
  {
    href: "/compras",
    rotulo: "Controle de compras",
    ativo: (p: string) => p === "/compras",
    icone: (
      <Icone>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </Icone>
    ),
  },
  {
    href: "/manutencao",
    rotulo: "Controle de manutenção",
    ativo: (p: string) => p === "/manutencao",
    icone: (
      <Icone>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </Icone>
    ),
  },
  {
    href: "/vendas",
    rotulo: "Controle de vendas",
    ativo: (p: string) => p === "/vendas",
    icone: (
      <Icone>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </Icone>
    ),
    filhos: [
      {
        href: "/vendas/diario",
        rotulo: "Controle diário",
        ativo: (p: string) => p === "/vendas/diario",
        icone: (
          <Icone>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </Icone>
        ),
      },
      {
        href: "/vendas/conversao",
        rotulo: "Controle de conversão",
        ativo: (p: string) => p === "/vendas/conversao",
        icone: (
          <Icone>
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="18" y1="8" x2="23" y2="13" />
            <line x1="23" y1="8" x2="18" y2="13" />
          </Icone>
        ),
      },
    ],
  },
  {
    href: "/frequencia",
    rotulo: "Controle de frequência",
    ativo: (p: string) => p === "/frequencia",
    icone: (
      <Icone>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </Icone>
    ),
    filhos: [
      {
        href: "/frequencia/sala",
        rotulo: "Contagem de sala",
        ativo: (p: string) => p === "/frequencia/sala",
        icone: (
          <Icone>
            <path d="M6.5 6.5h11M6.5 17.5h11" />
            <path d="M3 9v6M21 9v6M6.5 5v14M17.5 5v14" />
          </Icone>
        ),
      },
      {
        href: "/frequencia/coletivas",
        rotulo: "Contagem coletivas",
        ativo: (p: string) => p === "/frequencia/coletivas",
        icone: (
          <Icone>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          </Icone>
        ),
      },
      {
        href: "/frequencia/lutas",
        rotulo: "Contagem lutas",
        ativo: (p: string) => p === "/frequencia/lutas",
        icone: (
          <Icone>
            {/* quimono: gola cruzada, mangas e faixa amarrada */}
            <path d="M8 3 3 6v5h3.5v10h11V11H21V6l-5-3" />
            <path d="M8 3l4 6 4-6" />
            <path d="M6.5 14h11" />
            <path d="m11 14-1.5 4M13 14l1.5 4" />
          </Icone>
        ),
      },
      {
        href: "/frequencia/passagens",
        rotulo: "Relatório de frequência",
        ativo: (p: string) => p === "/frequencia/passagens",
        icone: (
          <Icone>
            {/* catraca */}
            <path d="M4 21V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v16" />
            <path d="M10 10h10M10 14h7" />
          </Icone>
        ),
      },
      {
        href: "/frequencia/gympass",
        rotulo: "Relatório Gympass",
        ativo: (p: string) => p === "/frequencia/gympass",
        icone: (
          <Icone>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20M6 15h4" />
          </Icone>
        ),
      },
    ],
  },
  {
    href: "/avaliacao",
    rotulo: "Avaliação de desempenho",
    ativo: (p: string) => p === "/avaliacao",
    icone: (
      <Icone>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </Icone>
    ),
    filhos: [
      {
        href: "/avaliacao/adb",
        rotulo: "A.D.B",
        ativo: (p: string) => p === "/avaliacao/adb",
        icone: (
          <Icone>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </Icone>
        ),
      },
    ],
  },
  {
    href: "/usuarios",
    rotulo: "Usuários",
    somenteAdmin: true,
    ativo: (p: string) => p === "/usuarios",
    icone: (
      <Icone>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </Icone>
    ),
  },
];

// "Cadastro de academias" ganha um submenu por academia cadastrada (funcionários e modalidades dela).
function comSubmenuDeAcademias(item: ItemMenu, academias: { id: string; nome: string }[]): ItemMenu {
  if (academias.length === 0) return item;
  return {
    ...item,
    filhos: academias.map((a) => ({
      href: `/academias/${a.id}`,
      rotulo: a.nome,
      ativo: (p: string) => p.startsWith(`/academias/${a.id}`),
      icone: (
        <Icone>
          <path d="M3 21h18M5 21V8l7-5 7 5v13" />
          <path d="M9 21v-6h6v6" />
        </Icone>
      ),
    })),
  };
}

function LinkMenu({
  item,
  pathname,
  recolhido,
  filho,
  forcarAtivo,
}: {
  item: ItemMenu;
  pathname: string;
  recolhido: boolean;
  filho?: boolean;
  forcarAtivo?: boolean;
}) {
  const ativo = forcarAtivo || item.ativo(pathname);
  return (
    <Link
      href={item.href}
      title={recolhido ? item.rotulo : undefined}
      aria-label={item.rotulo}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 ${filho && !recolhido ? "text-[13px]" : "text-sm"} ${
        recolhido ? "justify-center" : ""
      } ${
        ativo
          ? "bg-white/10 font-medium text-white shadow-[inset_3px_0_0_var(--color-marca-claro)]"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {item.icone}
      {!recolhido && <span className={filho ? "leading-tight" : "truncate"}>{item.rotulo}</span>}
    </Link>
  );
}

export function Sidebar({
  nome,
  perfil,
  academiaNome,
  academias,
  recolhidoInicial,
  submenusIniciais,
}: {
  nome: string;
  perfil: "admin" | "usuario";
  academiaNome: string | null;
  academias: { id: string; nome: string }[];
  recolhidoInicial: boolean;
  submenusIniciais: string[];
}) {
  const pathname = usePathname();
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  const [abertos, setAbertos] = useState<string[]>(submenusIniciais);

  function alternarSubmenu(href: string) {
    const proximos = abertos.includes(href) ? abertos.filter((h) => h !== href) : [...abertos, href];
    setAbertos(proximos);
    document.cookie = `submenus_abertos=${encodeURIComponent(proximos.join(","))}; path=/; max-age=31536000; samesite=lax`;
  }

  function alternar() {
    const proximo = !recolhido;
    setRecolhido(proximo);
    document.cookie = `sidebar_recolhido=${proximo ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-grafite-escuro bg-grafite transition-[width] duration-200 ${
        recolhido ? "w-16" : "w-72"
      }`}
    >
      <div
        className={`flex items-center border-b border-white/10 ${
          recolhido ? "flex-col gap-2 py-3" : "justify-between gap-2 px-4 py-4"
        }`}
      >
        {recolhido ? (
          <Logo variante="icone" className="text-2xl" />
        ) : (
          <Logo />
        )}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhido}
          aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <Icone>
            {recolhido ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
          </Icone>
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {ITENS.filter((item) => !item.somenteAdmin || perfil === "admin")
          .map((item) => (item.href === "/academias" ? comSubmenuDeAcademias(item, academias) : item))
          .map((item) => {
          // Com o submenu recolhido, o item pai fica destacado se a página atual for de um dos filhos.
          const filhoAtivo = item.filhos?.some((f) => f.ativo(pathname)) ?? false;
          // Estando numa página do submenu, ele aparece aberto.
          const submenuAberto = abertos.includes(item.href) || filhoAtivo;
          return (
            <div key={item.href} className="space-y-1">
              <div className="flex items-center">
                <div className="min-w-0 flex-1">
                  <LinkMenu
                    item={item}
                    pathname={pathname}
                    recolhido={recolhido}
                    forcarAtivo={filhoAtivo && !submenuAberto}
                  />
                </div>
                {item.filhos && !recolhido && (
                  <button
                    type="button"
                    onClick={() => alternarSubmenu(item.href)}
                    aria-expanded={submenuAberto}
                    aria-label={submenuAberto ? `Recolher ${item.rotulo}` : `Expandir ${item.rotulo}`}
                    title={submenuAberto ? "Recolher submenu" : "Expandir submenu"}
                    className="ml-1 shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {submenuAberto ? <polyline points="6 9 12 15 18 9" /> : <polyline points="9 6 15 12 9 18" />}
                    </svg>
                  </button>
                )}
              </div>
              {item.filhos && !recolhido && submenuAberto && (
                <div className="ml-5 space-y-1 border-l border-white/15 pl-2">
                  {item.filhos.map((filho) => (
                    <LinkMenu key={filho.href} item={filho} pathname={pathname} recolhido={recolhido} filho />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2">
        <Link
          href="/minha-conta"
          title={recolhido ? "Minha conta" : undefined}
          aria-label="Minha conta"
          aria-current={pathname === "/minha-conta" ? "page" : undefined}
          className={`flex items-center gap-3 truncate rounded-md px-3 py-1.5 text-xs ${
            recolhido ? "justify-center" : ""
          } ${
            pathname === "/minha-conta"
              ? "bg-white/10 font-medium text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          {recolhido ? (
            <Icone>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
            </Icone>
          ) : (
            <span className="truncate">
              {nome}
              {perfil === "admin" ? " · administrador" : academiaNome ? ` · ${academiaNome}` : ""}
            </span>
          )}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            title={recolhido ? "Sair" : undefined}
            aria-label="Sair"
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white ${
              recolhido ? "justify-center" : ""
            }`}
          >
            <Icone>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </Icone>
            {!recolhido && <span>Sair</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
