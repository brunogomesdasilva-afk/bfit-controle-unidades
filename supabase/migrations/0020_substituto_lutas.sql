-- Contagem lutas: professor substituto (quando preenchido, o professor pode ficar em branco), como em coletivas.
alter table contagem_lutas add column if not exists professor_substituto text;
