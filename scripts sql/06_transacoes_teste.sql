-- Nota Técnica do DBA: Este script demonstra a propriedade ACID da Atomicidade.
-- Simula um cenário onde um cliente compra dois medicamentos. O primeiro é 
-- processado, mas o segundo falha por falta de stock. O SAVEPOINT e o ROLLBACK 
-- garantem que a base de dados desfaça a operação, impedindo uma venda incompleta.

-- ----------------------------------------------------------------------------
-- CENÁRIO DE TESTE: VENDA COM FALHA E RECUPERAÇÃO AUTOMÁTICA
-- ----------------------------------------------------------------------------

-- 1. Inicia a transação mestre
BEGIN;

-- 2. Regista o cabeçalho da nova venda (idVenda gerado será o 2)
INSERT INTO venda (formaDePagamento, observacoes, idUsuarios) VALUES
('Multicaixa', 'Simulação de venda com falha no segundo item', 1);

-- 3. Cria um ponto de salvaguarda logo após a abertura da venda
SAVEPOINT ponto_venda_inicial;

-- 4. Processa o ITEM 1: Venda de 10 unidades de Paracetamol (idMedicamento = 1)
-- Nota de DBA: Há stock suficiente (o lote tem 70 unidades restantes). Ocorre com sucesso.
INSERT INTO itemVenda (qtdVendida, precoUnitario, idVenda, idMedicamento) VALUES
(10, 1500.00, 2, 1);

-- 5. Processa o ITEM 2: Venda de 500 unidades de Amoxicilina (idMedicamento = 2)
-- !!! ERRO PREVISTO !!! 
-- Nota de DBA: Não inserimos nenhum lote para Amoxicilina no ficheiro 03.
-- O gatilho (fn_atualizar_estoque_por_lote) vai disparar uma EXCEÇÃO e abortar este comando.
INSERT INTO itemVenda (qtdVendida, precoUnitario, idVenda, idMedicamento) VALUES
(500, 4500.00, 2, 2);

-- 6. TRATAMENTO DA FALHA (Simulado para o relatório)
-- Como o item 2 falhou, se tentássemos fazer COMMIT, o PostgreSQL rejeitaria toda a transação.
-- Executamos o ROLLBACK para o savepoint para anular o Item 1 e o cabeçalho da venda, 
-- deixando a base de dados limpa e íntegra como estava antes.
ROLLBACK TO ponto_venda_inicial;

-- Finaliza e liberta a sessão da transação
COMMIT;

-- ----------------------------------------------------------------------------
-- SCRIPT DE VERIFICAÇÃO PARA O RELATÓRIO
-- ----------------------------------------------------------------------------
-- Execute o comando abaixo para provar ao docente que, devido ao ROLLBACK, 
-- nenhuma linha "fantasma" da venda 2 ou do item 1 foi gravada incorretamente.
-- SELECT * FROM venda WHERE idVenda = 2; -- Deve retornar 0 linhas.
