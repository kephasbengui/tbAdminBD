-- Nota Técnica do DBA: Este script automatiza o controlo de stock transacional.
-- A regra segue o padrão sanitário farmacêutico (FEFO): consome primeiro o lote
-- que tiver a data de validade mais próxima do vencimento.

-- ----------------------------------------------------------------------------
-- 1. FUNÇÃO DA TRIGGER: BAIXA DE STOCK POR LOTE (FEFO)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_atualizar_estoque_por_lote()
RETURNS TRIGGER AS $$
DECLARE
    registo_lote RECORD;
    qtd_a_reduzir INT;
    qtd_disponivel_total INT;
BEGIN
    qtd_a_reduzir := NEW.qtdVendida;

    -- 1. Validação prévia: Verificar se há stock total suficiente somando todos os lotes ativos
    SELECT COALESCE(SUM(qtdAtual), 0) INTO qtd_disponivel_total
    FROM loteEmEstoque
    WHERE idMedicamento = NEW.idMedicamento 
      AND dataDeValidade > CURRENT_DATE 
      AND qtdAtual > 0;

    IF qtd_disponivel_total < qtd_a_reduzir THEN
        RAISE EXCEPTION 'Stock insuficiente para o medicamento ID %. Disponível: %, Solicitado: %', 
            NEW.idMedicamento, qtd_disponivel_total, qtd_a_reduzir;
    END IF;

    -- 2. Loop pelos lotes válidos, ordenados pela data de validade mais próxima (FEFO)
    FOR registo_lote IN 
        SELECT idLoteEmEstoque, qtdAtual 
        FROM loteEmEstoque
        WHERE idMedicamento = NEW.idMedicamento 
          AND dataDeValidade > CURRENT_DATE 
          AND qtdAtual > 0
        ORDER BY dataDeValidade ASC, idLoteEmEstoque ASC
    LOOP
        -- Se o lote atual consegue cobrir toda a quantidade restante
        IF registo_lote.qtdAtual >= qtd_a_reduzir THEN
            UPDATE loteEmEstoque
            SET qtdAtual = qtdAtual - qtd_a_reduzir
            WHERE idLoteEmEstoque = registo_lote.idLoteEmEstoque;
            
            qtd_a_reduzir := 0;
            EXIT; -- Estoque totalmente baixado, sai do loop
        ELSE
            -- Se o lote não cobre tudo, consome o que estiver disponível nele e avança para o próximo
            qtd_a_reduzir := qtd_a_reduzir - registo_lote.qtdAtual;
            
            UPDATE loteEmEstoque
            SET qtdAtual = 0
            WHERE idLoteEmEstoque = registo_lote.idLoteEmEstoque;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. CRIAÇÃO DO GATILHO (TRIGGER)
-- ----------------------------------------------------------------------------
-- O gatilho dispara ANTES da inserção física do item, garantindo que se não houver
-- stock, a transação é abortada imediatamente.
CREATE OR REPLACE TRIGGER trg_item_venda_estoque
    BEFORE INSERT ON itemVenda
    FOR EACH ROW
    EXECUTE FUNCTION fn_atualizar_estoque_por_lote();


-- ----------------------------------------------------------------------------
-- 3. VISTA (VIEW) AUXILIAR: POSIÇÃO DE STOCK ATUALIZADA
-- ----------------------------------------------------------------------------
-- Esta vista consolida o stock total por medicamento, ocultando a complexidade dos
-- lotes para a equipa de programação da interface web.
CREATE OR REPLACE VIEW vw_posicao_estoque AS
SELECT 
    m.idMedicamento,
    m.nome AS nomeMedicamento,
    c.nomeDaCategoria,
    m.precoDeVenda,
    COALESCE(SUM(l.qtdAtual), 0) AS estoqueTotalDisponivel,
    COUNT(CASE WHEN l.dataDeValidade <= CURRENT_DATE + INTERVAL '90 days' AND l.qtdAtual > 0 THEN 1 END) AS lotesProximosVencimento
FROM medicamento m
INNER JOIN categoria c ON m.idCategoria = c.idCategoria
LEFT JOIN loteEmEstoque l ON m.idMedicamento = l.idMedicamento AND l.dataDeValidade > CURRENT_DATE
GROUP BY m.idMedicamento, m.nome, c.nomeDaCategoria, m.precoDeVenda;

