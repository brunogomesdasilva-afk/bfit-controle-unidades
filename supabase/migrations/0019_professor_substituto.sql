-- Contagem coletivas: professor substituto (quando preenchido, o professor pode ficar em branco).
alter table contagem_coletivas add column if not exists professor_substituto text;
