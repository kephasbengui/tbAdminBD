-- Nota Técnica do DBA: Este script remove todos os acessos públicos padrões,
-- cria papéis isolados (Roles) e garante que o utilizador de consumo da Web 
-- opere estritamente com os privilégios mínimos necessários para o negócio.

-- ----------------------------------------------------------------------------
-- 1. LIMPEZA DE PRIVILÉGIOS PADRÃO (HARDENING)
-- ----------------------------------------------------------------------------
-- Revoga privilégios de criação no esquema público para utilizadores anónimos
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;

-- ----------------------------------------------------------------------------
-- 2. CRIAÇÃO DE PAPÉIS (ROLES) E UTILIZADORES
-- ----------------------------------------------------------------------------

-- Criação do Papel da Aplicação Web (Grupo de Permissões)
CREATE ROLE grupo_farmacia_app;

-- Criação do Utilizador Físico que a Aplicação Web usará para ligar ao PostgreSQL
-- Nota: Substituir 'SenhaSeguraApp123!' por uma credencial forte em ambiente real
CREATE USER usr_farmacia_web WITH PASSWORD 'SenhaSeguraApp123!';

-- Atribui o utilizador ao grupo de permissões da aplicação
GRANT grupo_farmacia_app TO usr_farmacia_web;

-- ----------------------------------------------------------------------------
-- 3. ATRIBUIÇÃO DE PERMISSÕES ESTRITAS (DCL)
-- ----------------------------------------------------------------------------

-- Concede direito de leitura (SELECT) em tabelas de catálogo/configuração
GRANT SELECT ON categoria, medicamento, fornecedor TO grupo_farmacia_app;

-- Concede direito de leitura em visões (Views) operacionais
GRANT SELECT ON vw_posicao_estoque TO grupo_farmacia_app;

-- Concede direito de escrita, atualização e leitura em tabelas transacionais
-- Justificação: A app precisa de registar vendas, itens de venda, utilizadores e gerir lotes.
GRANT SELECT, INSERT, UPDATE ON venda, itemVenda, usuarios, loteEmEstoque TO grupo_farmacia_app;

-- ----------------------------------------------------------------------------
-- 4. GESTÃO DE SEQUÊNCIAS (CRÍTICO PARA BIGSERIAL)
-- ----------------------------------------------------------------------------
-- Nota de DBA: Como utilizamos BIGSERIAL, o utilizador da Web precisa de permissão 
-- para incrementar os contadores automáticos (Sequences) ao fazer INSERTS.
GRANT USAGE, SELECT ON SEQUENCE 
    categoria_idcategoria_seq, 
    usuarios_idusuarios_seq, 
    fornecedor_idfornecedor_seq, 
    medicamento_idmedicamento_seq, 
    venda_idvenda_seq, 
    loteemestoque_idloteemestoque_seq, 
    itemvenda_iditemvenda_seq 
TO grupo_farmacia_app;

-- ----------------------------------------------------------------------------
-- 5. VALIDAÇÃO DE SEGURANÇA PARA O RELATÓRIO
-- ----------------------------------------------------------------------------
-- O comando DELETE foi omitido intencionalmente para grupo_farmacia_app.
-- Qualquer tentativa de remoção de registos físicos pela Web será bloqueada pelo SGBD.
