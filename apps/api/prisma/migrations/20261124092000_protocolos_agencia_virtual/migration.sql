-- Protocolos (PLU-348): o atalho "Agência Virtual" da distribuidora. Só o
-- endereço, em https e sem credencial (sem usuário/senha na URL nem parâmetro
-- de login). O login e a senha continuam fora, no cofre da UC (issue própria).
-- A Amazonas Energia nasce sem endereço; o gerente preenche nas Configurações.

ALTER TABLE public.distribuidoras ADD COLUMN agencia_virtual_url text;
ALTER TABLE public.distribuidoras ADD CONSTRAINT distribuidoras_agencia_virtual_url CHECK (
  agencia_virtual_url IS NULL OR (
    length(agencia_virtual_url) <= 300
    AND agencia_virtual_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'
    AND agencia_virtual_url !~* '[?&#](senha|password|pass|pwd|token|login|user|usuario|cpf|cnpj)='
  )
);
