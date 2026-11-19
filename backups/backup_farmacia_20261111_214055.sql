--
-- PostgreSQL database dump
--

\restrict 5XCbYKnoVjPOy21quTQtZzxXZItAZP2LK6pNiGga7xCkm5LW173hg5k3cNZ9k6G

-- Dumped from database version 18.6 (Ubuntu 18.6-1.pgdg24.04+2)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fn_atualizar_estoque_por_lote(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_atualizar_estoque_por_lote() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.fn_atualizar_estoque_por_lote() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categoria; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categoria (
    idcategoria bigint NOT NULL,
    nomedacategoria character varying(100) NOT NULL,
    descricao character varying(255)
);


ALTER TABLE public.categoria OWNER TO postgres;

--
-- Name: categoria_idcategoria_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categoria_idcategoria_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categoria_idcategoria_seq OWNER TO postgres;

--
-- Name: categoria_idcategoria_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categoria_idcategoria_seq OWNED BY public.categoria.idcategoria;


--
-- Name: fornecedor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fornecedor (
    idfornecedor bigint NOT NULL,
    nomedaempresa character varying(150) NOT NULL,
    nif character varying(20) NOT NULL,
    telefone character varying(20),
    email character varying(100),
    status character varying(20) DEFAULT 'ATIVO'::character varying NOT NULL
);


ALTER TABLE public.fornecedor OWNER TO postgres;

--
-- Name: fornecedor_idfornecedor_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fornecedor_idfornecedor_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.fornecedor_idfornecedor_seq OWNER TO postgres;

--
-- Name: fornecedor_idfornecedor_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fornecedor_idfornecedor_seq OWNED BY public.fornecedor.idfornecedor;


--
-- Name: itemvenda; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.itemvenda (
    iditemvenda bigint NOT NULL,
    qtdvendida integer NOT NULL,
    precounitario numeric(12,2) NOT NULL,
    idvenda bigint NOT NULL,
    idmedicamento bigint NOT NULL,
    CONSTRAINT chk_preco_unitario_positivo CHECK ((precounitario >= (0)::numeric)),
    CONSTRAINT chk_qtd_vendida_positiva CHECK ((qtdvendida > 0))
);


ALTER TABLE public.itemvenda OWNER TO postgres;

--
-- Name: itemvenda_iditemvenda_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.itemvenda_iditemvenda_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.itemvenda_iditemvenda_seq OWNER TO postgres;

--
-- Name: itemvenda_iditemvenda_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.itemvenda_iditemvenda_seq OWNED BY public.itemvenda.iditemvenda;


--
-- Name: loteemestoque; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loteemestoque (
    idloteemestoque bigint NOT NULL,
    numerodolote character varying(50) NOT NULL,
    qtdinicial integer NOT NULL,
    qtdatual integer NOT NULL,
    custototal numeric(12,2) NOT NULL,
    datadeentrega date DEFAULT CURRENT_DATE NOT NULL,
    datadevalidade date NOT NULL,
    idusuarios bigint NOT NULL,
    idfornecedor bigint NOT NULL,
    idmedicamento bigint NOT NULL,
    CONSTRAINT chk_custo_positivo CHECK ((custototal >= (0)::numeric)),
    CONSTRAINT chk_datas_lote CHECK ((datadevalidade > datadeentrega)),
    CONSTRAINT chk_qtd_atual_valida CHECK (((qtdatual >= 0) AND (qtdatual <= qtdinicial))),
    CONSTRAINT chk_qtd_inicial_positiva CHECK ((qtdinicial > 0))
);


ALTER TABLE public.loteemestoque OWNER TO postgres;

--
-- Name: loteemestoque_idloteemestoque_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.loteemestoque_idloteemestoque_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.loteemestoque_idloteemestoque_seq OWNER TO postgres;

--
-- Name: loteemestoque_idloteemestoque_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.loteemestoque_idloteemestoque_seq OWNED BY public.loteemestoque.idloteemestoque;


--
-- Name: medicamento; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.medicamento (
    idmedicamento bigint NOT NULL,
    nome character varying(150) NOT NULL,
    precodevenda numeric(12,2) NOT NULL,
    idcategoria bigint NOT NULL,
    CONSTRAINT chk_preco_venda_positivo CHECK ((precodevenda >= (0)::numeric))
);


ALTER TABLE public.medicamento OWNER TO postgres;

--
-- Name: medicamento_idmedicamento_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.medicamento_idmedicamento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.medicamento_idmedicamento_seq OWNER TO postgres;

--
-- Name: medicamento_idmedicamento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.medicamento_idmedicamento_seq OWNED BY public.medicamento.idmedicamento;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    idusuarios bigint NOT NULL,
    nome character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    senha character varying(255) NOT NULL,
    perfil character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'ATIVO'::character varying NOT NULL,
    datadecriacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- Name: usuarios_idusuarios_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_idusuarios_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_idusuarios_seq OWNER TO postgres;

--
-- Name: usuarios_idusuarios_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_idusuarios_seq OWNED BY public.usuarios.idusuarios;


--
-- Name: venda; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venda (
    idvenda bigint NOT NULL,
    dataehora timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    valortotal numeric(12,2) DEFAULT 0.00 NOT NULL,
    formadepagamento character varying(50) NOT NULL,
    observacoes text,
    idusuarios bigint NOT NULL,
    CONSTRAINT chk_venda_total_positivo CHECK ((valortotal >= (0)::numeric))
);


ALTER TABLE public.venda OWNER TO postgres;

--
-- Name: venda_idvenda_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.venda_idvenda_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.venda_idvenda_seq OWNER TO postgres;

--
-- Name: venda_idvenda_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.venda_idvenda_seq OWNED BY public.venda.idvenda;


--
-- Name: vw_posicao_estoque; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_posicao_estoque AS
 SELECT m.idmedicamento,
    m.nome AS nomemedicamento,
    c.nomedacategoria,
    m.precodevenda,
    COALESCE(sum(l.qtdatual), (0)::bigint) AS estoquetotaldisponivel,
    count(
        CASE
            WHEN ((l.datadevalidade <= (CURRENT_DATE + '90 days'::interval)) AND (l.qtdatual > 0)) THEN 1
            ELSE NULL::integer
        END) AS lotesproximosvencimento
   FROM ((public.medicamento m
     JOIN public.categoria c ON ((m.idcategoria = c.idcategoria)))
     LEFT JOIN public.loteemestoque l ON (((m.idmedicamento = l.idmedicamento) AND (l.datadevalidade > CURRENT_DATE))))
  GROUP BY m.idmedicamento, m.nome, c.nomedacategoria, m.precodevenda;


ALTER VIEW public.vw_posicao_estoque OWNER TO postgres;

--
-- Name: categoria idcategoria; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categoria ALTER COLUMN idcategoria SET DEFAULT nextval('public.categoria_idcategoria_seq'::regclass);


--
-- Name: fornecedor idfornecedor; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fornecedor ALTER COLUMN idfornecedor SET DEFAULT nextval('public.fornecedor_idfornecedor_seq'::regclass);


--
-- Name: itemvenda iditemvenda; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemvenda ALTER COLUMN iditemvenda SET DEFAULT nextval('public.itemvenda_iditemvenda_seq'::regclass);


--
-- Name: loteemestoque idloteemestoque; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loteemestoque ALTER COLUMN idloteemestoque SET DEFAULT nextval('public.loteemestoque_idloteemestoque_seq'::regclass);


--
-- Name: medicamento idmedicamento; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.medicamento ALTER COLUMN idmedicamento SET DEFAULT nextval('public.medicamento_idmedicamento_seq'::regclass);


--
-- Name: usuarios idusuarios; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN idusuarios SET DEFAULT nextval('public.usuarios_idusuarios_seq'::regclass);


--
-- Name: venda idvenda; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda ALTER COLUMN idvenda SET DEFAULT nextval('public.venda_idvenda_seq'::regclass);


--
-- Data for Name: categoria; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categoria (idcategoria, nomedacategoria, descricao) FROM stdin;
1	Analgésicos e Antipiréticos	Medicamentos para alívio da dor e controlo da febre
2	Antibióticos / Antibacterianos	Medicamentos para o combate a infeções bacterianas
3	Antihistamínicos	Medicamentos para o tratamento de reações alérgicas
\.


--
-- Data for Name: fornecedor; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fornecedor (idfornecedor, nomedaempresa, nif, telefone, email, status) FROM stdin;
1	AngoMed Distribuidora S.A.	5401122334	+244923111222	comercial@angomed.ao	ATIVO
2	Farmacêutica do Kwanza	5409988776	+244934333444	pedidos@farmakwanza.co.ao	ATIVO
\.


--
-- Data for Name: itemvenda; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.itemvenda (iditemvenda, qtdvendida, precounitario, idvenda, idmedicamento) FROM stdin;
1	30	1500.00	1	1
\.


--
-- Data for Name: loteemestoque; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.loteemestoque (idloteemestoque, numerodolote, qtdinicial, qtdatual, custototal, datadeentrega, datadevalidade, idusuarios, idfornecedor, idmedicamento) FROM stdin;
1	LOT-PAR-001A	100	100	50000.00	2026-11-01	2027-02-15	1	1	1
2	LOT-PAR-001B	150	150	75000.00	2026-11-05	2027-06-30	1	1	1
\.


--
-- Data for Name: medicamento; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.medicamento (idmedicamento, nome, precodevenda, idcategoria) FROM stdin;
1	Paracetamol 500mg	1500.00	1
2	Amoxicilina 500mg (Cápsulas)	4500.00	2
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (idusuarios, nome, email, senha, perfil, status, datadecriacao) FROM stdin;
1	Amílcar Augusto	amilcar.farmacia@gmail.com	$2b$12$K.Xv97u1A0X46F6...	Farmacêutico	ATIVO	2026-11-09 20:33:03.742289+01
2	Beatriz Manuel	beatriz.dba@unikivi.ed	$2b$12$L.Yw98v2B1Y57G7...	Administrador	ATIVO	2026-11-09 20:33:03.742289+01
0	Pedro Bengui	pbengui@gmail.com	bengui	Administrador	ATIVO	2026-11-09 21:10:26.963123+01
\.


--
-- Data for Name: venda; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venda (idvenda, dataehora, valortotal, formadepagamento, observacoes, idusuarios) FROM stdin;
1	2026-11-09 20:33:03.742289+01	0.00	Dinheiro / Cash	Venda de teste para validação da Trigger de stock	1
\.


--
-- Name: categoria_idcategoria_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categoria_idcategoria_seq', 3, true);


--
-- Name: fornecedor_idfornecedor_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.fornecedor_idfornecedor_seq', 2, true);


--
-- Name: itemvenda_iditemvenda_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.itemvenda_iditemvenda_seq', 4, true);


--
-- Name: loteemestoque_idloteemestoque_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.loteemestoque_idloteemestoque_seq', 2, true);


--
-- Name: medicamento_idmedicamento_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.medicamento_idmedicamento_seq', 2, true);


--
-- Name: usuarios_idusuarios_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_idusuarios_seq', 2, true);


--
-- Name: venda_idvenda_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.venda_idvenda_seq', 3, true);


--
-- Name: categoria pk_categoria; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categoria
    ADD CONSTRAINT pk_categoria PRIMARY KEY (idcategoria);


--
-- Name: fornecedor pk_fornecedor; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fornecedor
    ADD CONSTRAINT pk_fornecedor PRIMARY KEY (idfornecedor);


--
-- Name: itemvenda pk_item_venda; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemvenda
    ADD CONSTRAINT pk_item_venda PRIMARY KEY (iditemvenda);


--
-- Name: loteemestoque pk_lote_em_estoque; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loteemestoque
    ADD CONSTRAINT pk_lote_em_estoque PRIMARY KEY (idloteemestoque);


--
-- Name: medicamento pk_medicamento; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.medicamento
    ADD CONSTRAINT pk_medicamento PRIMARY KEY (idmedicamento);


--
-- Name: usuarios pk_usuarios; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT pk_usuarios PRIMARY KEY (idusuarios);


--
-- Name: venda pk_venda; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda
    ADD CONSTRAINT pk_venda PRIMARY KEY (idvenda);


--
-- Name: fornecedor uq_fornecedor_nif; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fornecedor
    ADD CONSTRAINT uq_fornecedor_nif UNIQUE (nif);


--
-- Name: usuarios uq_usuarios_email; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT uq_usuarios_email UNIQUE (email);


--
-- Name: itemvenda uq_venda_medicamento; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemvenda
    ADD CONSTRAINT uq_venda_medicamento UNIQUE (idvenda, idmedicamento);


--
-- Name: idx_item_venda_id_venda; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_item_venda_id_venda ON public.itemvenda USING btree (idvenda);


--
-- Name: idx_lote_id_medicamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lote_id_medicamento ON public.loteemestoque USING btree (idmedicamento);


--
-- Name: idx_lote_validade; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lote_validade ON public.loteemestoque USING btree (datadevalidade);


--
-- Name: idx_medicamento_nome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_medicamento_nome ON public.medicamento USING btree (nome);


--
-- Name: idx_venda_data; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venda_data ON public.venda USING btree (dataehora);


--
-- Name: itemvenda trg_item_venda_estoque; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_item_venda_estoque BEFORE INSERT ON public.itemvenda FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_estoque_por_lote();


--
-- Name: itemvenda fk_item_venda_medicamento; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemvenda
    ADD CONSTRAINT fk_item_venda_medicamento FOREIGN KEY (idmedicamento) REFERENCES public.medicamento(idmedicamento) ON DELETE RESTRICT;


--
-- Name: itemvenda fk_item_venda_venda; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemvenda
    ADD CONSTRAINT fk_item_venda_venda FOREIGN KEY (idvenda) REFERENCES public.venda(idvenda) ON DELETE CASCADE;


--
-- Name: loteemestoque fk_lote_fornecedor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loteemestoque
    ADD CONSTRAINT fk_lote_fornecedor FOREIGN KEY (idfornecedor) REFERENCES public.fornecedor(idfornecedor) ON DELETE RESTRICT;


--
-- Name: loteemestoque fk_lote_medicamento; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loteemestoque
    ADD CONSTRAINT fk_lote_medicamento FOREIGN KEY (idmedicamento) REFERENCES public.medicamento(idmedicamento) ON DELETE RESTRICT;


--
-- Name: loteemestoque fk_lote_usuario; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loteemestoque
    ADD CONSTRAINT fk_lote_usuario FOREIGN KEY (idusuarios) REFERENCES public.usuarios(idusuarios) ON DELETE RESTRICT;


--
-- Name: medicamento fk_medicamento_categoria; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.medicamento
    ADD CONSTRAINT fk_medicamento_categoria FOREIGN KEY (idcategoria) REFERENCES public.categoria(idcategoria) ON DELETE RESTRICT;


--
-- Name: venda fk_venda_usuario; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda
    ADD CONSTRAINT fk_venda_usuario FOREIGN KEY (idusuarios) REFERENCES public.usuarios(idusuarios) ON DELETE RESTRICT;


--
-- Name: TABLE categoria; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.categoria TO grupo_farmacia_app;


--
-- Name: SEQUENCE categoria_idcategoria_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.categoria_idcategoria_seq TO grupo_farmacia_app;


--
-- Name: TABLE fornecedor; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.fornecedor TO grupo_farmacia_app;


--
-- Name: SEQUENCE fornecedor_idfornecedor_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.fornecedor_idfornecedor_seq TO grupo_farmacia_app;


--
-- Name: TABLE itemvenda; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.itemvenda TO grupo_farmacia_app;


--
-- Name: SEQUENCE itemvenda_iditemvenda_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.itemvenda_iditemvenda_seq TO grupo_farmacia_app;


--
-- Name: TABLE loteemestoque; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.loteemestoque TO grupo_farmacia_app;


--
-- Name: SEQUENCE loteemestoque_idloteemestoque_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.loteemestoque_idloteemestoque_seq TO grupo_farmacia_app;


--
-- Name: TABLE medicamento; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.medicamento TO grupo_farmacia_app;


--
-- Name: SEQUENCE medicamento_idmedicamento_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.medicamento_idmedicamento_seq TO grupo_farmacia_app;


--
-- Name: TABLE usuarios; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.usuarios TO grupo_farmacia_app;


--
-- Name: SEQUENCE usuarios_idusuarios_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.usuarios_idusuarios_seq TO grupo_farmacia_app;


--
-- Name: TABLE venda; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.venda TO grupo_farmacia_app;


--
-- Name: SEQUENCE venda_idvenda_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE public.venda_idvenda_seq TO grupo_farmacia_app;


--
-- Name: TABLE vw_posicao_estoque; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.vw_posicao_estoque TO grupo_farmacia_app;


--
-- PostgreSQL database dump complete
--

\unrestrict 5XCbYKnoVjPOy21quTQtZzxXZItAZP2LK6pNiGga7xCkm5LW173hg5k3cNZ9k6G

