
-- Criação da tabela de categorias de medicamentos
CREATE TABLE categoria (
    idCategoria BIGSERIAL,
    nomeDaCategoria VARCHAR(100) NOT NULL,
    descricao VARCHAR(255),
    CONSTRAINT pk_categoria PRIMARY KEY (idCategoria)
);

-- Criação da tabela de utilizadores do sistema (funcionários/DBAs)
CREATE TABLE usuarios (
    idUsuarios BIGSERIAL,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    perfil VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    dataDeCriacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_usuarios PRIMARY KEY (idUsuarios),
    CONSTRAINT uq_usuarios_email UNIQUE (email)
);

-- Criação da tabela de fornecedores da farmácia
CREATE TABLE fornecedor (
    idFornecedor BIGSERIAL,
    nomeDaEmpresa VARCHAR(150) NOT NULL,
    nif VARCHAR(20) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    CONSTRAINT pk_fornecedor PRIMARY KEY (idFornecedor),
    CONSTRAINT uq_fornecedor_nif UNIQUE (nif)
);


-- Criação da tabela de medicamentos (vinculada à categoria)
CREATE TABLE medicamento (
    idMedicamento BIGSERIAL,
    nome VARCHAR(150) NOT NULL,
    precoDeVenda NUMERIC(12,2) NOT NULL,
    idCategoria BIGINT NOT NULL,
    CONSTRAINT pk_medicamento PRIMARY KEY (idMedicamento),
    CONSTRAINT fk_medicamento_categoria FOREIGN KEY (idCategoria) 
        REFERENCES categoria(idCategoria) ON DELETE RESTRICT
);

-- Criação da tabela mestre de vendas (vinculada ao funcionário/utilizador)
CREATE TABLE venda (
    idVenda BIGSERIAL,
    dataEHora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valorTotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    formaDePagamento VARCHAR(50) NOT NULL,
    observacoes TEXT,
    idUsuarios BIGINT NOT NULL,
    CONSTRAINT pk_venda PRIMARY KEY (idVenda),
    CONSTRAINT fk_venda_usuario FOREIGN KEY (idUsuarios) 
        REFERENCES usuarios(idUsuarios) ON DELETE RESTRICT
);


-- Criação da tabela de lotes em estoque (vinculada ao medicamento, fornecedor e utilizador)
CREATE TABLE loteEmEstoque (
    idLoteEmEstoque BIGSERIAL,
    numeroDoLote VARCHAR(50) NOT NULL,
    qtdInicial INT NOT NULL,
    qtdAtual INT NOT NULL,
    custoTotal NUMERIC(12,2) NOT NULL,
    dataDeEntrega DATE NOT NULL DEFAULT CURRENT_DATE,
    dataDeValidade DATE NOT NULL,
    idUsuarios BIGINT NOT NULL,
    idFornecedor BIGINT NOT NULL,
    idMedicamento BIGINT NOT NULL,
    CONSTRAINT pk_lote_em_estoque PRIMARY KEY (idLoteEmEstoque),
    CONSTRAINT fk_lote_usuario FOREIGN KEY (idUsuarios) 
        REFERENCES usuarios(idUsuarios) ON DELETE RESTRICT,
    CONSTRAINT fk_lote_fornecedor FOREIGN KEY (idFornecedor) 
        REFERENCES fornecedor(idFornecedor) ON DELETE RESTRICT,
    CONSTRAINT fk_lote_medicamento FOREIGN KEY (idMedicamento) 
        REFERENCES medicamento(idMedicamento) ON DELETE RESTRICT
);

-- Criação da tabela detalhada de itens de cada venda (vinculada à venda e ao medicamento)
CREATE TABLE itemVenda (
    idItemVenda BIGSERIAL,
    qtdVendida INT NOT NULL,
    precoUnitario NUMERIC(12,2) NOT NULL,
    idVenda BIGINT NOT NULL,
    idMedicamento BIGINT NOT NULL,
    CONSTRAINT pk_item_venda PRIMARY KEY (idItemVenda),
    CONSTRAINT fk_item_venda_venda FOREIGN KEY (idVenda) 
        REFERENCES venda(idVenda) ON DELETE CASCADE,
    CONSTRAINT fk_item_venda_medicamento FOREIGN KEY (idMedicamento) 
        REFERENCES medicamento(idMedicamento) ON DELETE RESTRICT,
    CONSTRAINT uq_venda_medicamento UNIQUE (idVenda, idMedicamento)
);
