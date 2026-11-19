-- Nota Técnica do DBA: Os dados inseridos simulam o cenário real de operação.
-- Inclui o cadastro de múltiplos lotes para o mesmo medicamento com validades 
-- distintas para testar o comportamento do gatilho (Trigger).

-- ----------------------------------------------------------------------------
-- 1. POPULAR TABELAS INDEPENDENTES (NÍVEL 1)
-- ----------------------------------------------------------------------------

-- Inserção de Categorias
INSERT INTO categoria (nomeDaCategoria, descricao) VALUES
('Analgésicos e Antipiréticos', 'Medicamentos para alívio da dor e controlo da febre'),
('Antibióticos / Antibacterianos', 'Medicamentos para o combate a infeções bacterianas'),
('Antihistamínicos', 'Medicamentos para o tratamento de reações alérgicas');

-- Inserção de Utilizadores (Passwords fictícias em texto - a App Web fará o hash)
INSERT INTO usuarios (nome, email, senha, perfil, status) VALUES
('Amílcar Augusto', 'amilcar.farmacia@gmail.com', '$2b$12$K.Xv97u1A0X46F6...', 'Farmacêutico', 'ATIVO'),
('Beatriz Manuel', 'beatriz.dba@unikivi.ed', '$2b$12$L.Yw98v2B1Y57G7...', 'Administrador', 'ATIVO');

-- Inserção de Fornecedores
INSERT INTO fornecedor (nomeDaEmpresa, nif, telefone, email, status) VALUES
('AngoMed Distribuidora S.A.', '5401122334', '+244923111222', 'comercial@angomed.ao', 'ATIVO'),
('Farmacêutica do Kwanza', '5409988776', '+244934333444', 'pedidos@farmakwanza.co.ao', 'ATIVO');

-- ----------------------------------------------------------------------------
-- 2. POPULAR TABELAS DE DEPENDÊNCIA SIMPLES (NÍVEL 2)
-- ----------------------------------------------------------------------------

-- Inserção de Medicamentos (Chaves Estrangeiras apontam para o idCategoria gerado)
-- idMedicamento 1: Paracetamol
INSERT INTO medicamento (nome, precoDeVenda, idCategoria) VALUES
('Paracetamol 500mg', 1500.00, 1);

-- idMedicamento 2: Amoxicilina
INSERT INTO medicamento (nome, precoDeVenda, idCategoria) VALUES
('Amoxicilina 500mg (Cápsulas)', 4500.00, 2);

-- ----------------------------------------------------------------------------
-- 3. POPULAR TABELAS DE DEPENDÊNCIA COMPOSTA (NÍVEL 3)
-- ----------------------------------------------------------------------------

-- Inserção de Lotes (Simulação crítica de múltiplos lotes para o Paracetamol)
-- Lote A (Vence mais cedo: Fevereiro de 2027) -> idMedicamento 1
INSERT INTO loteEmEstoque (numeroDoLote, qtdInicial, qtdAtual, custoTotal, dataDeEntrega, dataDeValidade, idUsuarios, idFornecedor, idMedicamento) VALUES
('LOT-PAR-001A', 100, 100, 50000.00, '2026-11-01', '2027-02-15', 1, 1, 1);

-- Lote B (Vence mais tarde: Junho de 2027) -> idMedicamento 1
INSERT INTO loteEmEstoque (numeroDoLote, qtdInicial, qtdAtual, custoTotal, dataDeEntrega, dataDeValidade, idUsuarios, idFornecedor, idMedicamento) VALUES
('LOT-PAR-001B', 150, 150, 75000.00, '2026-11-05', '2027-06-30', 1, 1, 1);


-- ----------------------------------------------------------------------------
-- 4. SIMULAÇÃO TRANSACIONAL PARA TESTE DO GATILHO (DML)
-- ----------------------------------------------------------------------------

-- Registo de uma Venda Mestre (idVenda = 1)
INSERT INTO venda (formaDePagamento, observacoes, idUsuarios) VALUES
('Dinheiro / Cash', 'Venda de teste para validação da Trigger de stock', 1);

-- Inserção de um Item da Venda (idMedicamento 1 [Paracetamol], solicita 30 unidades)
-- Verificação de DBA: O SGBD deve consumir automaticamente as 30 unidades do 'LOT-PAR-001A' (validade mais curta).
INSERT INTO itemVenda (qtdVendida, precoUnitario, idVenda, idMedicamento) VALUES
(30, 1500.00, 1, 1);

-- Script de validação visual para o relatório (Pode ser executado no console):
-- SELECT numeroDoLote, qtdAtual, dataDeValidade FROM loteEmEstoque WHERE idMedicamento = 1;
