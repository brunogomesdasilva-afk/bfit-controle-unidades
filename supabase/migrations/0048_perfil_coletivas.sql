-- Perfil "coletivas": usuário de uma academia (academia_id) que só vê a Grade de aulas (coletivas e lutas) e as
-- contagens de coletivas e de lutas. O acesso aos dados é o mesmo do usuário da academia (regras por academia_id);
-- as telas que ele abre são limitadas pelo sistema.
alter table profiles drop constraint if exists profiles_perfil_check;
alter table profiles add constraint profiles_perfil_check check (perfil in ('admin', 'usuario', 'manutencao', 'coletivas'));
