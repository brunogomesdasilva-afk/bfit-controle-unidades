import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /auth/confirm troca o link do e-mail (redefinir senha etc.) por uma sessão; roda sem estar logado.
  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/auth/");

  // Usuário inativo: encerra a sessão e volta para o login com um aviso.
  if (user) {
    const { data: perfil } = await supabase.from("profiles").select("ativo").eq("id", user.id).single();
    if (perfil?.ativo === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("erro", "Este usuário está inativo. Fale com o administrador do sistema.");
      const redirecionamento = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirecionamento.cookies.set(c));
      return redirecionamento;
    }
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // /login/redefinir-senha é a exceção: quem clicou no link de recuperação chega autenticado
  // (sessão de recuperação) e precisa ver essa tela antes de ser levado para dentro do sistema.
  if (user && isPublicRoute && request.nextUrl.pathname !== "/login/redefinir-senha") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
