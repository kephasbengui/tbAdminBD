-- ----------------------------------------------------------------------------
-- 1. RESTRIÇÕES DE VERIFICAÇÃO (CHECK CONSTRAINTS)
-- ----------------------------------------------------------------------------

-- Validações na tabela: medicamento
ALTER TABLE medicamento
    ADD CONSTRAINT chk_preco_venda_positivo CHECK (precoDeVenda >= 0);

-- Validações na tabela: loteEmEstoque
ALTER TABLE loteEmEstoque
    ADD CONSTRAINT chk_qtd_inicial_positiva CHECK (qtdInicial > 0),
    ADD CONSTRAINT chk_qtd_atual_valida CHECK (qtdAtual >= 0 AND qtdAtual <= qtdInicial),
    ADD CONSTRAINT chk_custo_positivo CHECK (custoTotal >= 0),
    ADD CONSTRAINT chk_datas_lote CHECK (dataDeValidade > dataDeEntrega);

-- Validações na tabela: venda
ALTER TABLE venda
    ADD CONSTRAINT chk_venda_total_positivo CHECK (valorTotal >= 0);

-- Validações na tabela: itemVenda
ALTER TABLE itemVenda
    ADD CONSTRAINT chk_qtd_vendida_positiva CHECK (qtdVendida > 0),
    ADD CONSTRAINT chk_preco_unitario_positivo CHECK (precoUnitario >= 0);


-- ----------------------------------------------------------------------------
-- 2. ÍNDICES DE DESEMPENHO (INDEXING)
-- ----------------------------------------------------------------------------

-- Otimização de busca na interface web: Pesquisa de medicamentos por nome
-- Justificação: Filtro crítico na barra de pesquisa da aplicação do cliente.
CREATE INDEX idx_medicamento_nome ON medicamento(nome);

-- Otimização de alertas de faturação/auditoria: Consultas por intervalo de datas
-- Justificação: Agiliza a geração de relatórios financeiros e consultas de histórico.
CREATE INDEX idx_venda_data ON venda(dataEHora);

-- Otimização de alertas de validade de medicamentos
-- Justificação: Permite à aplicação identificar e listar rapidamente lotes próximos do vencimento.
CREATE INDEX idx_lote_validade ON loteEmEstoque(dataDeValidade);

-- Otimização de chaves estrangeiras com alta frequência de JOINs
-- Justificação: Acelera o acoplamento de tabelas durante a listagem de itens de uma venda.
CREATE INDEX idx_item_venda_id_venda ON itemVenda(idVenda);
CREATE INDEX idx_lote_id_medicamento ON loteEmEstoque(idMedicamento);
