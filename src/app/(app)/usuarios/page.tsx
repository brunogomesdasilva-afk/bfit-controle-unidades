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
  redefinirSenhaUsuario,
} from "./actions";
import { MenuAcoesUsuario } from "./MenuAcoesUsuario";

const CAMPO =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

// Acesso do usuário: "admin" (todas as academias) ou o id da academia que ele pode ver.
function valorAcesso(u: Profile) {
  return u.perfil === "admin"
    ? "admin"
    : u.perfil === "manutencao"
      ? "manutencao"
      : (u.academia_id ?? "");
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

        <div className="mt-6 overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">E-mail de acesso</th>
                <th className="px-4 py-2 font-medium">
                  E-mail para relatórios
                </th>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
                <th className="px-4 py-2 font-medium">Acesso</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.map((u) => (
                <tr
                  key={u.id}
                  className={
                    u.ativo === false ? "bg-slate-50 text-slate-400" : undefined
                  }
                >
                  <td className="px-4 py-2">
                    <form
                      action={alterarNomeUsuario.bind(null, u.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="nome"
                        defaultValue={u.nome}
                        required
                        maxLength={80}
                        className="w-full min-w-40 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
                      />
                      <button
                        type="submit"
                        className="text-xs text-slate-500 underline hover:text-slate-900"
                      >
                        salvar
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2">
                    <form
                      action={alterarEmailRelatorios.bind(null, u.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="email_relatorios"
                        type="email"
                        defaultValue={u.email_relatorios ?? ""}
                        placeholder="mesmo do acesso"
                        className="w-full min-w-48 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
                      />
                      <button
                        type="submit"
                        className="text-xs text-slate-500 underline hover:text-slate-900"
                      >
                        salvar
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    <form
                      action={alterarWhatsappUsuario.bind(null, u.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="whatsapp"
                        type="tel"
                        defaultValue={u.whatsapp ?? ""}
                        placeholder="(11) 98888-7777"
                        className="w-full min-w-36 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
                      />
                      <button
                        type="submit"
                        className="text-xs text-slate-500 underline hover:text-slate-900"
                      >
                        salvar
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    {u.id === atual.id ? (
                      <span className="text-slate-600">
                        {u.perfil === "admin"
                          ? "Administrador"
                          : u.perfil === "manutencao"
                            ? "Manutenção"
                            : (nomeAcademia.get(u.academia_id ?? "") ??
                              "Sem acesso")}{" "}
                        (você)
                        <span className="mt-1 block text-xs text-slate-500">Módulos: {nomesDosModulos(u)}</span>
                      </span>
                    ) : (
                      <form action={alterarAcessoUsuario.bind(null, u.id)}>
                        <div className="flex items-center gap-2">
                          <select
                            name="acesso"
                            defaultValue={valorAcesso(u)}
                            required
                            className="max-w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          >
                            <OpcoesAcesso academias={academias} />
                          </select>
                          <button
                            type="submit"
                            className="text-xs text-slate-500 underline hover:text-slate-900"
                          >
                            salvar
                          </button>
                        </div>
                        <UnidadesManutencao
                          academias={academias}
                          marcadas={u.academias_manutencao ?? []}
                        />
                        <CaixasModulos marcados={modulosDoPerfil(u)} />
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        {u.ativo === false ? (
                          <>
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                              Inativo
                            </span>
                            {u.ativo_alterado_em && (
                              <p className="mt-1 text-xs text-slate-500">
                                desde{" "}
                                {new Date(
                                  u.ativo_alterado_em,
                                ).toLocaleDateString("pt-BR")}
                                {u.ativo_alterado_por &&
                                nomePorId.get(u.ativo_alterado_por)
                                  ? ` por ${nomePorId.get(u.ativo_alterado_por)}`
                                  : ""}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Ativo
                          </span>
                        )}
                      </div>
                      <MenuAcoesUsuario>
                        <Link
                          href={`/usuarios?editarEmail=${u.id}`}
                          role="menuitem"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Alterar e-mail
                        </Link>
                        <Link
                          href={`/usuarios?redefinirSenha=${u.id}`}
                          role="menuitem"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Redefinir senha
                        </Link>
                        {u.ativo === false ? (
                          <form action={alterarStatusUsuario.bind(null, u.id)}>
                            <input type="hidden" name="ativo" value="true" />
                            <button
                              type="submit"
                              role="menuitem"
                              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              Reativar usuário
                            </button>
                          </form>
                        ) : u.id === atual.id ? (
                          <span className="block px-4 py-2 text-sm text-slate-400">
                            Você não pode inativar a si mesmo
                          </span>
                        ) : (
                          <Link
                            href={`/usuarios?inativar=${u.id}`}
                            role="menuitem"
                            className="block px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                          >
                            Inativar usuário
                          </Link>
                        )}
                      </MenuAcoesUsuario>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
