-- Aulas coletivas podem ter horário de 15 em 15 minutos (ex.: 18:45, que existe no histórico importado).
alter table contagem_coletivas drop constraint if exists contagem_coletivas_horario_30min;
alter table contagem_coletivas drop constraint if exists contagem_coletivas_horario_15min;
alter table contagem_coletivas add constraint contagem_coletivas_horario_15min
  check (extract(minute from horario) in (0, 15, 30, 45) and extract(second from horario) = 0);
