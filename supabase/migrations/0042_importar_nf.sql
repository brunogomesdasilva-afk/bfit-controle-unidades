-- Importação de NF pelo PDF: o CNPJ de cada academia (para saber de qual academia é a nota, pelo tomador) e o
-- PDF da nota guardado junto do título (caminho na pasta "pagamentos" do armazenamento).
alter table academias add column if not exists cnpj text;
update academias set cnpj = '42002981000156' where nome = 'Continental' and cnpj is null;
update academias set cnpj = '44479266000134' where nome = 'Km18' and cnpj is null;
update academias set cnpj = '38252387000146' where nome = 'Novo Osasco' and cnpj is null;
update academias set cnpj = '53751751000106' where nome = 'Rochdale' and cnpj is null;

alter table fin_titulos add column if not exists anexo text;

-- A visão lista as colunas do título: é recriada para incluir o anexo.
drop view if exists fin_titulos_situacao;
create view fin_titulos_situacao with (security_invoker = true) as
select
  t.*,
  coalesce(b.baixado, 0) as baixado,
  coalesce(b.pago, 0) as pago,
  b.ultima_baixa,
  greatest(t.valor - coalesce(b.baixado, 0), 0) as saldo,
  case
    when t.cancelado then 'cancelado'
    when coalesce(b.baixado, 0) >= t.valor then 'liquidado'
    when coalesce(b.baixado, 0) > 0 then 'parcial'
    when t.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
    else 'aberto'
  end as situacao
from fin_titulos t
left join (
  select titulo_id, sum(valor + desconto) as baixado, sum(valor + juros + multa) as pago, max(data) as ultima_baixa
  from fin_baixas group by titulo_id
) b on b.titulo_id = t.id;
