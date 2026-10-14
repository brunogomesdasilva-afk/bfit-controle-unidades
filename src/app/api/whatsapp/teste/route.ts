import { getPerfilAtual } from "@/lib/auth";
import { gerarPdfFechamento } from "@/lib/pdfFechamento";
import { createClient } from "@/lib/supabase/server";
import { normalizarCelular, provedorWhatsapp, sendDocument, whatsappConfigurado } from "@/lib/whatsapp";

// Teste do envio por WhatsApp para UM número (só administrador, logado no sistema). Abra no navegador:
//   /api/whatsapp/teste                     → manda para o WhatsApp do seu cadastro
//   /api/whatsapp/teste?para=11988887777    → manda para esse número
// Envia um PDF pequeno de teste pelo provedor de WHATSAPP_PROVIDER e mostra o resultado (ou o erro do provedor).
export async function GET(request: Request) {
  const atual = await getPerfilAtual();
  if (atual?.perfil !== "admin") return Response.json({ ok: false, erro: "Só o administrador pode testar o envio." }, { status: 403 });
  if (!whatsappConfigurado())
    return Response.json({ ok: false, erro: "WhatsApp não configurado: confira WHATSAPP_PROVIDER e as credenciais do provedor." }, { status: 500 });

  let para = new URL(request.url).searchParams.get("para");
  if (!para) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("whatsapp").eq("id", atual.id).maybeSingle();
    para = data?.whatsapp ?? null;
  }
  const celular = normalizarCelular(para);
  if (!celular) return Response.json({ ok: false, erro: "Informe ?para=DDD+número ou cadastre seu WhatsApp em Usuários." }, { status: 400 });

  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const pdf = await gerarPdfFechamento({
    academia: "",
    mesTexto: "",
    titulo: "Teste de envio por WhatsApp",
    subtitulo: `Gerado em ${agora} por ${atual.nome}`,
    secoes: [
      {
        titulo: "Tudo certo",
        mostrarQuantidade: false,
        colunas: [{ rotulo: "Mensagem", largura: 523 }],
        linhas: [["Se este PDF chegou, o envio dos relatórios por WhatsApp está funcionando."]],
        vazio: "",
      },
    ],
  });
  try {
    await sendDocument({ to: celular, fileBuffer: pdf, fileName: "Teste BFIT.pdf", caption: `BFIT · Teste de envio · ${agora}` });
    return Response.json({ ok: true, provedor: provedorWhatsapp().nome, para: celular });
  } catch (e) {
    return Response.json({ ok: false, provedor: provedorWhatsapp().nome, para: celular, erro: e instanceof Error ? e.message : "erro" }, { status: 502 });
  }
}
