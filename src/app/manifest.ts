import type { MetadataRoute } from "next";

// App instalável (PWA): no celular, "Instalar app" / "Adicionar à Tela de Início" cria o ícone do BFIT, que abre em
// tela cheia, sem a barra do navegador. Os ícones ficam em public/ (icone-*.png) e src/app (icon.png, apple-icon.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BFIT · Controle de unidades",
    short_name: "BFIT",
    description: "Controle de unidades BFIT",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#3b4047",
    theme_color: "#3b4047",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
