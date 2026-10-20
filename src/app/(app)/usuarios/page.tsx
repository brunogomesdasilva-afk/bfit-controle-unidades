import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirModulo } from "@/lib/auth";
import type { Academia, Profile } from "@/lib/database.types";
import { DESCRICAO_MODULOS, MODULOS, modulosDoPerfil, type Modulo } from "@/lib/modulos";
import {
  alterarAcessoUsuario,
  alterarEmailRelatorios,
  alterarWhatsappUsuario,
  alterarEmailUsuario,
  alterarNomeUsuario,
  alterarStatusUsuario,
  criarUsuario,
  excluirUsuario,
  redefinirSenhaUsuario,
} from "./actions";
import { BotaoExcluirUsuario } from "./BotaoExcluirUsuario";
import { MenuAcoesUsuario } from "./MenuAcoesUsuario";

const CAMPO =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

// Acesso do usuário: "admin" (todas as academias) ou o id da academia que ele pode ver.
function valorAcesso(u: Profile) {
  return u.perfil === "admin"
    ? "admin"
    : u.perfil === "manutencao"
      ? "manutencao"
      : u.perfil === "coletivas"
        ? `coletivas:${u.academia_id ?? ""}`
        : (u.academia_id ?? "");
}

// "5511988887777" → "(11) 98888-7777" (o que não reconhecer fica como está).
function celularFormatado(numero: string) {
  const d = numero.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero;
}

// Unidades do perfil Manutenção (marcadas só quando o acesso escolhido é "Manutenção").
function UnidadesManutencao({
  academias,
  marcadas,
}: {
  academias: Academia[];
  marcadas: string[];
}) {
  return (
    <details className="mt-1 text-xs text-slate-600" open={marcadas.length > 0}>
      <summary className="cursor-pointer">Unidades (perfil Manutenção)</summary>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {academias.map((a) => (
          <label key={a.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              name="unidades_manutencao"
              value={a.id}
              defaultChecked={marcadas.includes(a.id)}
            />
            {a.nome}
          </label>
        ))}
      </div>
    </details>
  );
}

// Módulos que o usuário pode usar: uma caixa para cada (Academia, RH, Financeiro, ADM).
function CaixasModulos({ marcados }: { marcados: Modulo[] }) {
  return (
    <fieldset className="mt-2">
      <legend className="text-xs font-medium text-slate-700">Módulos</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(MODULOS) as Modulo[]).map((m) => (
          <label key={m} className="flex items-center gap-1.5 text-sm text-slate-700" title={DESCRICAO_MODULOS[m]}>
            <input type="checkbox" name="modulos" value={m} defaultChecked={marcados.includes(m)} className="h-4 w-4 accent-marca" />
            {MODULOS[m]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const nomesDosModulos = (u: Profile) => {
  const modulos = modulosDoPerfil(u);
  return modulos.length ? modulos.map((m) => MODULOS[m]).join(", ") : "nenhum módulo";
};

function OpcoesAcesso({ academias }: { academias: Academia[] }) {
  return (
    <>
      <option value="" disabled>
        Selecione o acesso
      </option>
      <option value="admin">Administrador (todas as academias)</option>
      <option value="manutencao">Manutenção (só a tela de Manutenção)</option>
      {academias.map((a) => (
        <option key={a.id} value={a.id}>
          {a.nome}
        </option>
      ))}
      <optgroup label="Coletivas (só grade de aulas e contagens de coletivas e lutas)">
        {academias.map((a) => (
          <option key={a.id} value={`coletivas:${a.id}`}>
            Coletivas · {a.nome}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    ok?: string;
    inativar?: string;
    editarEmail?: string;
    redefinirSenha?: string;
    novo?: string;
  }>;
}) {
  const atual = await exigirModulo("adm");
  const {
    erro,
    ok,
    inativar,
    editarEmail,
    redefinirSenha,
    novo: novoParam,
  } = await searchParams;
  // "Incluir usuário": o formulário de criação abre só quando pedido (ou de novo, se a criação deu erro).
  const novo = novoParam === "1";

  const supabase = await createClient();
  const [{ data }, { data: listaAcademias }] = await Promise.all([
    supabase.from("profiles").select("*").order("nome"),
    supabase.from("academias").select("*").order("nome"),
  ]);
  const usuarios = (data ?? []) as Profile[];
  const academias = (listaAcademias ?? []) as Academia[];
  const nomeAcademia = new Map(academias.map((a) => [a.id, a.nome]));
  const chaveConfigurada = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.nome]));
  // Acesso em texto, para o resumo de cada usuário.
  const rotuloAcesso = (u: Profile) =>
    u.perfil === "admin"
      ? "Administrador"
      : u.perfil === "manutencao"
        ? "Manutenção"
        : u.perfil === "coletivas"
          ? `Coletivas · ${nomeAcademia.get(u.academia_id ?? "") ?? "sem academia"}`
          : (nomeAcademia.get(u.academia_id ?? "") ?? "Sem acesso");

  const alvoInativar =
    inativar && inativar !== atual.id
      ? usuarios.find((u) => u.id === inativar && u.ativo !== false)
      : undefined;
  const alvoEmail = editarEmail
    ? usuarios.find((u) => u.id === editarEmail)
    : undefined;
  const alvoSenha = redefinirSenha
    ? usuarios.find((u) => u.id === redefinirSenha)
    : undefined;

  return (
    <div>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">Usuários</h1>
          {!novo && (
            <Link
              href="/usuarios?novo=1"
              className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
            >
              + Incluir usuário
            </Link>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          O acesso define quais academias o usuário vê (todas ou só uma). Os
          módulos definem o que ele pode usar: {(Object.keys(MODULOS) as Modulo[]).map((m, i) => (
            <span key={m}>
              {i > 0 && "; "}
              <strong className="font-medium text-slate-700">{MODULOS[m]}</strong> ({DESCRICAO_MODULOS[m]})
            </span>
          ))}
          .
        </p>

        {erro && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}

        {novo && (
          <div className="mt-4 rounded-xl border border-marca/30 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Incluir usuário
              </h2>
              <Link
                href="/usuarios"
                className="text-sm text-slate-600 underline hover:text-slate-900"
              >
                Cancelar
              </Link>
            </div>

            {!chaveConfigurada && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Para criar usuários por aqui, adicione a chave{" "}
                <code>SUPABASE_SERVICE_ROLE_KEY</code> ao arquivo{" "}
                <code>.env.local</code> (Supabase → Project Settings → API →
                service_role) e reinicie o servidor. Essa chave é secreta: nunca
                a compartilhe nem a envie ao navegador.
              </p>
            )}

            <form
              action={criarUsuario}
              className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Nome
                </label>
                <input name="nome" required className={CAMPO} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <input name="email" type="email" required className={CAMPO} />
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  E-mail para relatórios (opcional)
                </label>
                <input
                  name="email_relatorios"
                  type="email"
                  placeholder="se vazio, usa o e-mail de acesso"
                  className={CAMPO}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Senha inicial
                </label>
                <input
                  name="senha"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={CAMPO}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Acesso
                </label>
                <select
                  name="acesso"
                  defaultValue=""
                  required
                  className={CAMPO}
                >
                  <OpcoesAcesso academias={academias} />
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Escolhendo uma academia, o usuário vê só os dados dela.
                  Manutenção: só a tela de Manutenção das unidades marcadas
                  abaixo, e recebe por WhatsApp/e-mail só as manutenções
                  pendentes delas (os módulos não se aplicam).
                </p>
                <UnidadesManutencao academias={academias} marcadas={[]} />
                <CaixasModulos marcados={["academia"]} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  WhatsApp (opcional)
                </label>
                <input
                  name="whatsapp"
                  type="tel"
                  placeholder="(11) 98888-7777"
                  className={CAMPO}
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
                >
                  Criar usuário
                </button>
              </div>
            </form>
          </div>
        )}
        {ok && (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {ok}
          </p>
        )}

        {alvoEmail && (
          <form
            action={alterarEmailUsuario.bind(null, alvoEmail.id)}
            className="mt-4 rounded-xl border border-slate-300 bg-white p-5"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Alterar e-mail de {alvoEmail.nome}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              O e-mail é o login do usuário. Depois da troca ele entra com o
              novo e-mail e a mesma senha.
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Novo e-mail
            </label>
            <input
              name="email"
              type="email"
              required
              defaultValue={alvoEmail.email}
              autoComplete="off"
              className={CAMPO}
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
              >
                Salvar e-mail
              </button>
              <Link
                href="/usuarios"
                className="text-sm text-slate-600 underline hover:text-slate-900"
              >
                Cancelar
              </Link>
            </div>
          </form>
        )}

        {alvoSenha && (
          <form
            action={redefinirSenhaUsuario.bind(null, alvoSenha.id)}
            className="mt-4 rounded-xl border border-slate-300 bg-white p-5"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Redefinir senha de {alvoSenha.nome}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ele passa a entrar com essa senha. Avise-o pessoalmente (telefone,
              presencialmente etc.) — a senha não fica registrada em nenhum
              lugar do sistema.
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Senha nova
            </label>
            <input
              name="senha"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={CAMPO}
            />
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Confirme a senha nova
            </label>
            <input
              name="confirmacao"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={CAMPO}
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro"
              >
                Salvar senha nova
              </button>
              <Link
                href="/usuarios"
                className="text-sm text-slate-600 underline hover:text-slate-900"
              >
                Cancelar
              </Link>
            </div>
          </form>
        )}

        {alvoInativar && (
          <form
            action={alterarStatusUsuario.bind(null, alvoInativar.id)}
            className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5"
          >
            <input type="hidden" name="ativo" value="false" />
            <h2 className="text-sm font-semibold text-amber-900">
              Inativar {alvoInativar.nome}
            </h2>
            <p className="mt-1 text-sm text-amber-900">
              O usuário deixa de ter acesso ao sistema, mas continua no
              histórico. Você pode reativá-lo depois.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Inativar usuário
              </button>
              <Link
                href="/usuarios"
                className="text-sm text-slate-600 underline hover:text-slate-900"
              >
                Cancelar
              </Link>
            </div>
          </form>
        )}

        {/* Lista: um cartão por usuário com o resumo; "Editar" abre os campos daquele usuário. */}
        <ul className="mt-6 space-y-2.5">
          {usuarios.map((u) => (
            <li
              key={u.id}
              className={`relative rounded-xl border ${u.ativo === false ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}
            >
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 pr-24 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:w-64 sm:shrink-0">
                    <p className={`truncate font-medium ${u.ativo === false ? "text-slate-500" : "text-slate-900"}`}>
                      {u.nome}
                      {u.id === atual.id && <span className="ml-1 text-xs font-normal text-slate-500">(você)</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{rotuloAcesso(u)}</span>
                    {u.whatsapp ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">WhatsApp {celularFormatado(u.whatsapp)}</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">sem WhatsApp</span>
                    )}
                    {u.ativo === false ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-600">Inativo</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">Ativo</span>
                    )}
                    <span className="text-slate-400">· {nomesDosModulos(u)}</span>
                  </div>
                  <span className="text-xs font-medium text-marca group-open:hidden">Editar</span>
                  <span className="hidden text-xs font-medium text-slate-500 group-open:inline">Fechar</span>
                </summary>

                <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-3">
                  <form action={alterarNomeUsuario.bind(null, u.id)} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600" htmlFor={`nome-${u.id}`}>
                      Nome
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`nome-${u.id}`}
                        name="nome"
                        defaultValue={u.nome}
                        required
                        maxLength={80}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                      />
                      <button type="submit" className="rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
                        Salvar
                      </button>
                    </div>
                  </form>
                  <form action={alterarEmailRelatorios.bind(null, u.id)} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600" htmlFor={`email-rel-${u.id}`}>
                      E-mail para relatórios
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`email-rel-${u.id}`}
                        name="email_relatorios"
                        type="email"
                        defaultValue={u.email_relatorios ?? ""}
                        placeholder="mesmo do acesso"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                      />
                      <button type="submit" className="rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
                        Salvar
                      </button>
                    </div>
                  </form>
                  <form action={alterarWhatsappUsuario.bind(null, u.id)} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600" htmlFor={`whatsapp-${u.id}`}>
                      WhatsApp
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`whatsapp-${u.id}`}
                        name="whatsapp"
                        type="tel"
                        defaultValue={u.whatsapp ?? ""}
                        placeholder="(11) 98888-7777"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                      />
                      <button type="submit" className="rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
                        Salvar
                      </button>
                    </div>
                  </form>

                  <div className="sm:col-span-3">
                    <p className="text-xs font-medium text-slate-600">Acesso e módulos</p>
                    {u.id === atual.id ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {rotuloAcesso(u)} (você) · Módulos: {nomesDosModulos(u)}
                      </p>
                    ) : (
                      <form action={alterarAcessoUsuario.bind(null, u.id)} className="mt-1 rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            name="acesso"
                            defaultValue={valorAcesso(u)}
                            required
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:w-auto sm:max-w-72"
                          >
                            <OpcoesAcesso academias={academias} />
                          </select>
                          <button type="submit" className="rounded-md bg-marca px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-escuro">
                            Salvar acesso
                          </button>
                        </div>
                        <UnidadesManutencao academias={academias} marcadas={u.academias_manutencao ?? []} />
                        <CaixasModulos marcados={modulosDoPerfil(u)} />
                      </form>
                    )}
                  </div>

                  {u.ativo === false && u.ativo_alterado_em && (
                    <p className="text-xs text-slate-500 sm:col-span-3">
                      Inativo desde {new Date(u.ativo_alterado_em).toLocaleDateString("pt-BR")}
                      {u.ativo_alterado_por && nomePorId.get(u.ativo_alterado_por) ? ` por ${nomePorId.get(u.ativo_alterado_por)}` : ""}.
                    </p>
                  )}
                </div>
              </details>

              {/* Ações fora do resumo (clicar nelas não abre/fecha o cartão). */}
              <div className="absolute right-2 top-3 flex items-center gap-0.5">
                {u.id !== atual.id && <BotaoExcluirUsuario nome={u.nome} excluir={excluirUsuario.bind(null, u.id)} />}
                <MenuAcoesUsuario>
                  <Link href={`/usuarios?editarEmail=${u.id}`} role="menuitem" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    Alterar e-mail
                  </Link>
                  <Link href={`/usuarios?redefinirSenha=${u.id}`} role="menuitem" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    Redefinir senha
                  </Link>
                  {u.ativo === false ? (
                    <form action={alterarStatusUsuario.bind(null, u.id)}>
                      <input type="hidden" name="ativo" value="true" />
                      <button type="submit" role="menuitem" className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                        Reativar usuário
                      </button>
                    </form>
                  ) : u.id === atual.id ? (
                    <span className="block px-4 py-2 text-sm text-slate-400">Você não pode inativar a si mesmo</span>
                  ) : (
                    <Link href={`/usuarios?inativar=${u.id}`} role="menuitem" className="block px-4 py-2 text-sm text-red-700 hover:bg-red-50">
                      Inativar usuário
                    </Link>
                  )}
                </MenuAcoesUsuario>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
