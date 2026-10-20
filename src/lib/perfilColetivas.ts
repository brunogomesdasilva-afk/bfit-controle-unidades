// Perfil "coletivas": pessoa de uma academia que só cuida das aulas coletivas e de lutas. Vê a Grade de aulas da
// academia dela (abas coletivas e lutas) e lança as contagens de coletivas e de lutas; o resto do sistema fica fechado.

export const INICIO_COLETIVAS = "/frequencia/coletivas";

// Telas que o perfil abre (além de Minha conta e login).
export function rotasDoPerfilColetivas(academiaId: string | null) {
  return [...(academiaId ? [`/academias/${academiaId}/grade`] : []), "/frequencia/coletivas", "/frequencia/lutas"];
}

export function rotaPermitidaColetivas(caminho: string, academiaId: string | null) {
  if (["/minha-conta", "/login", "/auth/"].some((p) => caminho.startsWith(p))) return true;
  return rotasDoPerfilColetivas(academiaId).some((p) => caminho === p || caminho.startsWith(`${p}/`));
}
