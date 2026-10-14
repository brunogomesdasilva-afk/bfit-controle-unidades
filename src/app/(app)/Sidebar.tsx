"use client";

import { Logo } from "@/app/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { moduloDaRota, type Modulo } from "@/lib/modulos";

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
  // Escondido de todos, inclusive do administrador (ex.: menu ainda não liberado).
  oculto?: boolean;
  ativo: (pathname: string) => boolean;
  icone: ReactNode;
  filhos?: ItemMenu[];
  // Só agrupa menus (não tem tela própria): clicar abre e fecha o submenu.
  grupo?: boolean;
};

const TODOS: ItemMenu[] = [
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
    rotulo: "Academias",
    ativo: (p: string) => p === "/academias",
    icone: (
      <Icone>
        <path d="M6.5 6.5h11M6.5 17.5h11" />
        <path d="M3 9v6M21 9v6M6.5 5v14M17.5 5v14" />
      </Icone>
    ),
  },
  {
    href: "/vendas",
    rotulo: "Vendas",
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
        rotulo: "Diário",
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
        rotulo: "Conversão",
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
    rotulo: "Frequência",
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
    href: "/compras",
    rotulo: "Compras",
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
    rotulo: "Manutenção",
    ativo: (p: string) => p === "/manutencao",
    icone: (
      <Icone>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </Icone>
    ),
  },
  {
    href: "/avaliacao/adb",
    rotulo: "A.D.B",
    ativo: (p: string) => p.startsWith("/avaliacao"),
    icone: (
      <Icone>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </Icone>
    ),
  },
  {
    href: "/relatorios",
    rotulo: "Relatórios",
    ativo: (p: string) => p === "/relatorios",
    icone: (
      <Icone>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </Icone>
    ),
    filhos: [
      {
        href: "/relatorios/acompanhamento",
        rotulo: "Acompanhamento diário",
        somenteAdmin: true,
        ativo: (p: string) => p === "/relatorios/acompanhamento",
        icone: (
          <Icone>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </Icone>
        ),
      },
      {
        href: "/relatorios/fechamento",
        rotulo: "Fechamento do mês",
        ativo: (p: string) => p === "/relatorios/fechamento",
        icone: (
          <Icone>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <polyline points="9 16 11 18 15 14" />
          </Icone>
        ),
      },
      {
        href: "/relatorios/visitantes",
        rotulo: "Alunos de outras unidades",
        ativo: (p: string) => p === "/relatorios/visitantes",
        icone: (
          <Icone>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <polyline points="16 11 18 13 22 9" />
          </Icone>
        ),
      },
      {
        href: "/relatorios/pendencias",
        rotulo: "Compras e manutenção",
        ativo: (p: string) => p === "/relatorios/pendencias",
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
    href: "/rh",
    rotulo: "RH",
    ativo: (p: string) => p === "/rh",
    icone: (
      <Icone>
        {/* crachá */}
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <circle cx="12" cy="10" r="3" />
        <path d="M8 17c0-2 2-3 4-3s4 1 4 3" />
      </Icone>
    ),
    filhos: [
      {
        href: "/rh/folha",
        rotulo: "Conferência da folha",
        ativo: (p: string) => p === "/rh/folha",
        icone: (
          <Icone>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <polyline points="9 15 11 17 15 13" />
          </Icone>
        ),
      },
    ],
  },
  {
    // Grupo (sem tela própria): conferências, cadastros, contas a pagar e a receber, conciliação e relatórios.
    href: "/financeiro/menu",
    rotulo: "Financeiro",
    grupo: true,
    ativo: () => false,
    icone: (
      <Icone>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9v.01M18 15v.01" />
      </Icone>
    ),
    filhos: [
      {
        href: "/financeiro/cadastros/pessoas",
        rotulo: "Cadastros",
        ativo: (p: string) => p.startsWith("/financeiro/cadastros"),
        icone: (
          <Icone>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </Icone>
        ),
        filhos: [
          {
            href: "/financeiro/cadastros/pessoas",
            rotulo: "Clientes e fornecedores",
            ativo: (p: string) => p === "/financeiro/cadastros/pessoas",
            icone: (
              <Icone>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </Icone>
            ),
          },
          {
            href: "/financeiro/cadastros/contas",
            rotulo: "Contas bancárias",
            ativo: (p: string) => p === "/financeiro/cadastros/contas",
            icone: (
              <Icone>
                <path d="M3 21h18M3 10h18M5 6l7-3 7 3" />
                <path d="M6 10v11M10 10v11M14 10v11M18 10v11" />
              </Icone>
            ),
          },
          {
            href: "/financeiro/cadastros/categorias",
            rotulo: "Grupos e categorias",
            ativo: (p: string) => p === "/financeiro/cadastros/categorias",
            icone: (
              <Icone>
                <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </Icone>
            ),
          },
        ],
      },
      {
        href: "/financeiro/pagar",
        rotulo: "Contas a pagar",
        ativo: (p: string) => p === "/financeiro/pagar",
        icone: (
          <Icone>
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </Icone>
        ),
      },
      {
        href: "/financeiro/nf",
        rotulo: "Importar NF",
        ativo: (p: string) => p === "/financeiro/nf",
        icone: (
          <Icone>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 12 15 15" />
          </Icone>
        ),
      },
      {
        href: "/financeiro/receber",
        rotulo: "Contas a receber",
        ativo: (p: string) => p === "/financeiro/receber",
        icone: (
          <Icone>
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </Icone>
        ),
      },
      {
        href: "/financeiro/conciliacao",
        rotulo: "Conciliação",
        ativo: (p: string) => p === "/financeiro/conciliacao",
        icone: (
          <Icone>
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </Icone>
        ),
      },
      {
        href: "/financeiro/relatorios",
        rotulo: "Relatórios",
        ativo: (p: string) => p === "/financeiro/relatorios",
        icone: (
          <Icone>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </Icone>
        ),
      },
      {
        href: "/financeiro",
        rotulo: "Conferências",
        ativo: (p: string) => p === "/financeiro" || p === "/financeiro/fechamento" || p === "/financeiro/semanal",
        icone: (
          <Icone>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <polyline points="9 15 11 17 15 13" />
          </Icone>
        ),
        filhos: [
          {
            href: "/financeiro",
            rotulo: "Conferência de pagamentos",
            ativo: (p: string) => p === "/financeiro",
            icone: (
              <Icone>
                <polyline points="9 15 11 17 15 13" />
                <rect x="4" y="3" width="16" height="18" rx="2" />
              </Icone>
            ),
          },
          {
            href: "/financeiro/fechamento",
            rotulo: "Fechamento mensal",
            ativo: (p: string) => p === "/financeiro/fechamento",
            icone: (
              <Icone>
                <line x1="4" y1="20" x2="4" y2="10" />
                <line x1="10" y1="20" x2="10" y2="4" />
                <line x1="16" y1="20" x2="16" y2="13" />
                <line x1="2" y1="20" x2="22" y2="20" />
              </Icone>
            ),
          },
          {
            href: "/financeiro/semanal",
            rotulo: "Fechamento semanal",
            ativo: (p: string) => p === "/financeiro/semanal",
            icone: (
              <Icone>
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="16" y1="2" x2="16" y2="6" />
              </Icone>
            ),
          },
        ],
      },
    ],
  },
  {
    href: "/thais",
    rotulo: "Thais",
    somenteAdmin: true,
    oculto: true, // pedido do Bruno: fora do menu por enquanto
    ativo: (p: string) => p === "/thais",
    icone: (
      <Icone>
        {/* diamante */}
        <path d="M6 3h12l4 6-10 12L2 9z" />
        <path d="M2 9h20M12 21 8 9l4-6 4 6z" />
      </Icone>
    ),
    filhos: [
      {
        href: "/thais/produtos",
        rotulo: "Cadastro de produtos",
        ativo: (p: string) => p === "/thais/produtos",
        icone: (
          <Icone>
            <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </Icone>
        ),
      },
    ],
  },
  {
    href: "/clientes",
    rotulo: "Clientes",
    ativo: (p: string) => p === "/clientes",
    icone: (
      <Icone>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </Icone>
    ),
  },
  {
    // Grupo (sem tela própria): usuários, tarefas e o fechamento de período do financeiro.
    href: "/admin/menu",
    rotulo: "Administrador",
    grupo: true,
    somenteAdmin: true,
    ativo: () => false,
    icone: (
      <Icone>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </Icone>
    ),
    filhos: [
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
      {
        href: "/admin/envios",
        rotulo: "Envios automáticos",
        somenteAdmin: true,
        ativo: (p: string) => p === "/admin/envios",
        icone: (
          <Icone>
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </Icone>
        ),
      },
      {
        href: "/admin/fechamento",
        rotulo: "Fechamento de período",
        somenteAdmin: true,
        ativo: (p: string) => p === "/admin/fechamento",
        icone: (
          <Icone>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </Icone>
        ),
      },
      {
        href: "/tarefas",
        rotulo: "Tarefas",
        somenteAdmin: true,
        ativo: (p: string) => p === "/tarefas",
        icone: (
          <Icone>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </Icone>
        ),
        filhos: [
          {
            href: "/tarefas",
            rotulo: "Cadastro de tarefas",
            ativo: (p: string) => p === "/tarefas",
            icone: (
              <Icone>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <polyline points="3 6 4 7 6 5" />
                <polyline points="3 12 4 13 6 11" />
                <polyline points="3 18 4 19 6 17" />
              </Icone>
            ),
          },
          {
            href: "/tarefas/log",
            rotulo: "Log de tarefas",
            ativo: (p: string) => p === "/tarefas/log",
            icone: (
              <Icone>
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </Icone>
            ),
          },
        ],
      },
    ],
  },
  {
    href: "/backup",
    rotulo: "Backup",
    somenteAdmin: true,
    ativo: (p: string) => p === "/backup",
    icone: (
      <Icone>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </Icone>
    ),
  },
];

// Menus do dia a dia das academias, agrupados em "Operação" (na ordem em que aparecem acima).
const DA_OPERACAO = ["/", "/academias", "/vendas", "/frequencia", "/compras", "/manutencao", "/avaliacao/adb", "/relatorios", "/clientes"];

const ITENS: ItemMenu[] = [
  {
    href: "/operacao",
    rotulo: "Operação",
    grupo: true,
    ativo: () => false,
    icone: (
      <Icone>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </Icone>
    ),
    filhos: TODOS.filter((i) => DA_OPERACAO.includes(i.href)),
  },
  ...TODOS.filter((i) => !DA_OPERACAO.includes(i.href)),
];

// A página atual é este item ou está em algum submenu dele?
const contem = (item: ItemMenu, caminho: string): boolean =>
  item.ativo(caminho) || (item.filhos?.some((f) => contem(f, caminho)) ?? false);

// "Academias" ganha um submenu por academia cadastrada e, dentro de cada uma, os cadastros dela.
const CADASTROS_DA_ACADEMIA = [
  {
    caminho: "funcionarios",
    rotulo: "Funcionários",
    icone: (
      <Icone>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
      </Icone>
    ),
  },
  {
    caminho: "modalidades",
    rotulo: "Modalidades",
    icone: (
      <Icone>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </Icone>
    ),
  },
  {
    caminho: "datas",
    rotulo: "Datas importantes",
    icone: (
      <Icone>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="12" y1="14" x2="12" y2="17" />
        <circle cx="12" cy="19.5" r="0.5" />
      </Icone>
    ),
  },
  {
    caminho: "grade",
    rotulo: "Grade de aulas",
    icone: (
      <Icone>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </Icone>
    ),
  },
  {
    caminho: "escala",
    rotulo: "Escala",
    icone: (
      <Icone>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="9" y1="4" x2="9" y2="22" />
      </Icone>
    ),
  },
  {
    caminho: "fechamento-coletivas",
    rotulo: "Fechamento coletivas",
    icone: (
      <Icone>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </Icone>
    ),
  },
];

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
      filhos: CADASTROS_DA_ACADEMIA.map((c) => ({
        href: `/academias/${a.id}/${c.caminho}`,
        rotulo: c.rotulo,
        ativo: (p: string) => p === `/academias/${a.id}/${c.caminho}`,
        icone: c.icone,
      })),
    })),
  };
}

function LinkMenu({
  item,
  pathname,
  recolhido,
  filho,
  forcarAtivo,
  aoClicarGrupo,
}: {
  item: ItemMenu;
  pathname: string;
  recolhido: boolean;
  filho?: boolean;
  forcarAtivo?: boolean;
  // Item de grupo (sem tela): vira um botão que abre e fecha o submenu.
  aoClicarGrupo?: () => void;
}) {
  const ativo = forcarAtivo || item.ativo(pathname);
  const classe = `flex w-full min-w-0 items-center rounded-md py-2 text-left ${filho && !recolhido ? "gap-2 px-2 text-[13px]" : "gap-3 px-3 text-sm"} ${
    recolhido ? "justify-center" : ""
  } ${
    ativo
      ? "bg-white/10 font-medium text-white shadow-[inset_3px_0_0_var(--color-marca-claro)]"
      : "text-slate-300 hover:bg-white/5 hover:text-white"
  }`;
  const conteudo = (
    <>
      {item.icone}
      {!recolhido && <span className={filho ? "min-w-0 break-words leading-tight" : "truncate"}>{item.rotulo}</span>}
    </>
  );
  if (item.grupo)
    return (
      <button type="button" onClick={aoClicarGrupo} title={recolhido ? item.rotulo : undefined} aria-label={item.rotulo} className={classe}>
        {conteudo}
      </button>
    );
  return (
    <Link href={item.href} title={recolhido ? item.rotulo : undefined} aria-label={item.rotulo} aria-current={ativo ? "page" : undefined} className={classe}>
      {conteudo}
    </Link>
  );
}

// Seta que abre e fecha um submenu.
function BotaoSeta({ aberto, rotulo, onClick }: { aberto: boolean; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberto}
      aria-label={aberto ? `Recolher ${rotulo}` : `Expandir ${rotulo}`}
      title={aberto ? "Recolher submenu" : "Expandir submenu"}
      className="ml-1 shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {aberto ? <polyline points="6 9 12 15 18 9" /> : <polyline points="9 6 15 12 9 18" />}
      </svg>
    </button>
  );
}

// Preferências do menu guardadas por um ano (lidas pelo layout no servidor).
function gravarCookie(nome: string, valor: string) {
  document.cookie = `${nome}=${valor}; path=/; max-age=31536000; samesite=lax`;
}

// Tela de computador (md ou maior). No servidor considera computador; no celular o menu vira uma gaveta.
function useTelaGrande() {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia("(min-width: 768px)");
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true
  );
}

export function Sidebar({
  nome,
  perfil,
  academiaNome,
  academias,
  recolhidoInicial,
  submenusIniciais,
  modulos,
}: {
  nome: string;
  perfil: "admin" | "usuario" | "manutencao";
  modulos: Modulo[];
  academiaNome: string | null;
  academias: { id: string; nome: string }[];
  recolhidoInicial: boolean;
  submenusIniciais: string[];
}) {
  const pathname = usePathname();
  const [recolhidoNoComputador, setRecolhido] = useState(recolhidoInicial);
  const telaGrande = useTelaGrande();
  // No celular o menu nunca fica recolhido (ele abre como gaveta, com os nomes).
  const recolhido = recolhidoNoComputador && telaGrande;
  const [aberto, setAberto] = useState(false);

  // Filtra em todos os níveis; grupo que fica sem nenhum menu some.
  const filtrar = (lista: ItemMenu[]): ItemMenu[] =>
    lista
      .filter(
        (item) =>
          !item.oculto &&
          (!item.somenteAdmin || perfil === "admin") &&
          // Só os menus dos módulos que o usuário tem.
          modulos.includes(moduloDaRota(item.href) ?? "academia") &&
          // Perfil Manutenção: só o menu Manutenção (e o grupo em que ele está).
          (perfil !== "manutencao" || item.href === "/manutencao" || Boolean(item.grupo))
      )
      .map((item) =>
        item.href === "/academias"
          ? comSubmenuDeAcademias(item, academias)
          : item.filhos
            ? { ...item, filhos: filtrar(item.filhos) }
            : item
      )
      .filter((item) => !item.grupo || (item.filhos?.length ?? 0) > 0);
  const itens = filtrar(ITENS);
  // Menu (e, dentro dele, o submenu) da página atual: ex.: em Vendas → Diário, Operação e Vendas.
  const menuDaPagina = (caminho: string) => itens.find((i) => i.filhos?.some((f) => contem(f, caminho)))?.href ?? null;
  const submenuDaPagina = (caminho: string) =>
    itens.flatMap((i) => i.filhos ?? []).find((f) => f.filhos?.some((n) => contem(n, caminho)))?.href ?? null;

  // Só um submenu aberto por vez em cada nível: abrir um fecha os outros. Ao navegar para a página de outro
  // menu, ele abre sozinho e os demais fecham; a seta abre e fecha livremente (inclusive o da página atual).
  const [submenuAberto, setSubmenuAberto] = useState<string | null>(() => menuDaPagina(pathname) ?? submenusIniciais[0] ?? null);
  const [segundoNivelAberto, setSegundoNivelAberto] = useState<string | null>(() => submenuDaPagina(pathname));
  const [paginaAnterior, setPaginaAnterior] = useState(pathname);
  if (pathname !== paginaAnterior) {
    setPaginaAnterior(pathname);
    const daPagina = menuDaPagina(pathname);
    if (daPagina && daPagina !== submenuAberto) setSubmenuAberto(daPagina);
    const subDaPagina = submenuDaPagina(pathname);
    if (subDaPagina && subDaPagina !== segundoNivelAberto) setSegundoNivelAberto(subDaPagina);
  }

  function alternarSubmenu(href: string) {
    const proximo = submenuAberto === href ? null : href;
    setSubmenuAberto(proximo);
    gravarCookie("submenus_abertos", encodeURIComponent(proximo ?? ""));
  }

  function alternar() {
    const proximo = !recolhidoNoComputador;
    setRecolhido(proximo);
    gravarCookie("sidebar_recolhido", proximo ? "1" : "0");
  }

  // Grupo clicado com o menu recolhido: expande o menu já com o grupo aberto.
  function abrirGrupo(href: string) {
    if (recolhido) {
      alternar();
      if (submenuAberto !== href) alternarSubmenu(href);
    } else alternarSubmenu(href);
  }

  return (
    <>
      {/* Celular: barra no topo com o botão que abre o menu. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-grafite-escuro bg-grafite px-4 py-3 md:hidden print:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={aberto}
          className="rounded-md p-2 text-slate-200 hover:bg-white/10"
        >
          <Icone>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </Icone>
        </button>
      </header>
      {aberto && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setAberto(false)} aria-hidden="true" />
      )}
    <aside
      // Fecha a gaveta do celular ao escolher uma tela.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) setAberto(false);
      }}
      className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-grafite-escuro bg-grafite transition-transform duration-200 md:sticky md:top-0 md:z-auto md:translate-x-0 md:transition-[width] print:hidden ${
        aberto ? "translate-x-0" : "-translate-x-full"
      } ${recolhido ? "md:w-16" : "md:w-64"}`}
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
          onClick={() => setAberto(false)}
          aria-label="Fechar menu"
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
        >
          <Icone>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </Icone>
        </button>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhido}
          aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          className="hidden shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white md:inline-flex"
        >
          <Icone>
            {recolhido ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
          </Icone>
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2">
        {itens.map((item) => {
          // Com o submenu fechado, o item pai fica destacado se a página atual estiver dentro dele.
          const estaAberto = submenuAberto === item.href;
          const destacar = (item.filhos?.some((f) => contem(f, pathname)) ?? false) && (!estaAberto || recolhido);
          return (
            <div key={item.href} className="space-y-1">
              <div className="flex items-center">
                <div className="min-w-0 flex-1">
                  <LinkMenu
                    item={item}
                    pathname={pathname}
                    recolhido={recolhido}
                    forcarAtivo={destacar}
                    aoClicarGrupo={() => abrirGrupo(item.href)}
                  />
                </div>
                {item.filhos && !recolhido && (
                  <BotaoSeta aberto={estaAberto} rotulo={item.rotulo} onClick={() => alternarSubmenu(item.href)} />
                )}
              </div>
              {item.filhos && !recolhido && estaAberto && (
                <div className="ml-3 space-y-1 border-l border-white/15 pl-1.5">
                  {item.filhos.map((filho) => {
                    const filhoAberto = segundoNivelAberto === filho.href;
                    return (
                      <div key={filho.href} className="space-y-1">
                        <div className="flex items-center">
                          <div className="min-w-0 flex-1">
                            <LinkMenu
                              item={filho}
                              pathname={pathname}
                              recolhido={recolhido}
                              filho
                              forcarAtivo={!filhoAberto && (filho.filhos?.some((n) => contem(n, pathname)) ?? false)}
                            />
                          </div>
                          {/* Submenu dentro de um grupo (ex.: Operação → Vendas): tem a própria seta. */}
                          {filho.filhos && item.grupo && (
                            <BotaoSeta
                              aberto={filhoAberto}
                              rotulo={filho.rotulo}
                              onClick={() => setSegundoNivelAberto(filhoAberto ? null : filho.href)}
                            />
                          )}
                        </div>
                        {filho.filhos && (item.grupo ? filhoAberto : filho.ativo(pathname)) && (
                          <div className="ml-2.5 space-y-1 border-l border-white/15 pl-1.5">
                            {filho.filhos.map((neto) => (
                              <div key={neto.href} className="space-y-1">
                                <LinkMenu item={neto} pathname={pathname} recolhido={recolhido} filho />
                                {/* Último nível (ex.: cadastros de uma academia): aparece quando se está dentro dela. */}
                                {neto.filhos && neto.ativo(pathname) && (
                                  <div className="ml-2.5 space-y-1 border-l border-white/15 pl-1.5">
                                    {neto.filhos.map((bisneto) => (
                                      <LinkMenu key={bisneto.href} item={bisneto} pathname={pathname} recolhido={recolhido} filho />
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
    </>
  );
}
