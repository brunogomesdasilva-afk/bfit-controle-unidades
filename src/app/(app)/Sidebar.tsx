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
  recolhidoInicial,
  submenusIniciais,
}: {
  nome: string;
  perfil: "admin" | "usuario";
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
        {ITENS.filter((item) => !item.somenteAdmin || perfil === "admin").map((item) => {
          // Com o submenu recolhido, o item pai fica destacado se a página atual for de um dos filhos.
          const filhoAtivo = item.filhos?.some((f) => f.ativo(pathname)) ?? false;
          const submenuAberto = abertos.includes(item.href);
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
              {perfil === "admin" ? " · administrador" : ""}
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
