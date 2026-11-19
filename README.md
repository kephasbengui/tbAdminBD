# Sistema de Gestão de Farmácia (PostgreSQL & pgAdmin)

Este repositório contém a arquitetura de base de dados relacional para um **Sistema de Gestão de Farmácia**, desenvolvida em **PostgreSQL** e gerida através do **pgAdmin 4**.

O projeto contempla a modelação estrutural de catálogo, controlo rigoroso de lotes e validades, gestão de vendas, segurança de perfis de utilizador, regras transacionais automatizadas (**FEFO**) e procedimentos de *backup* e restauro.

---

## Índice

1. [Visão Geral e Arquitetura](#-visão-geral-e-arquitetura)
2. [Estrutura da Base de Dados (DDL)](#-estrutura-da-base-dados-ddl)
3. [Restrições e Otimização (Índices)](#-restrições-e-otimização-índices)
4. [Regras de Negócio e Automação (FEFO & Triggers)](#-regras-de-negócio-e-automação-fefo--triggers)
5. [Segurança e Controlo de Acessos (DCL)](#-segurança-e-controlo-de-acessos-dcl)
6. [Testes Transacionais (ACID) e Dados de Teste](#-testes-transacionais-acid-e-dados-de-teste)
7. [Guia Passo a Passo: Como Executar o Projeto no pgAdmin](#-guia-passo-a-passo-como-executar-o-projeto-no-pgadmin)
8. [Rotinas de Cópia de Segurança e Restauro](#-rotinas-de-cópia-de-segurança-e-restauro)

---

## 1-Visão Geral e Arquitetura

O sistema foi desenhado para resolver os desafios críticos da gestão farmacêutica:
* **Controlo de Stock por Lote:** Rastreio individual de lotes, datas de entrega e validades.
* **Saída FEFO (*First Expired, First Out*):** Abatimento automático de stock priorizando o lote que vence mais cedo.
* **Integridade Transacional (ACID):** Proteção contra vendas parciais em caso de falha de stock através de `SAVEPOINT` e `ROLLBACK`.
* **Privilégio Mínimo:** Separação entre a administração do SGBD e o perfil operacional da aplicação Web.

---

## 2-Estrutura da Base de Dados (DDL)

A base de dados inclui as seguintes tabelas principais (`01_esquema.sql`):
* **`categoria`**: Catálogo de categorias de medicamentos.
* **`usuarios`**: Funcionários e administradores do sistema com controlo de acessos.
* **`fornecedor`**: Registo de fornecedores e identificação fiscal (NIF).
* **`medicamento`**: Produtos comercializados vinculados às suas categorias.
* **`venda`**: Registos mestres de vendas (data, valor total, forma de pagamento, funcionário).
* **`loteEmEstoque`**: Gestão detalhada de lotes (quantidade inicial, quantidade atual, custos e datas de validade).
* **`itemVenda`**: Detalhe individual dos produtos associados a cada venda[cite: 1].

---

## 3-Restrições e Otimização (Índices)

O ficheiro `02_restricoes_indices.sql` estabelece a integridade física e otimiza a performance:
* **Restrições `CHECK`:** Validação de preços e custos positivos, quantidades consistentes e regra temporal de validade (`dataDeValidade > dataDeEntrega`).
* **Índices de Desempenho (`INDEX`):** Criação de índices em campos de alta frequência de pesquisa (nomes de medicamentos, datas de vendas, validades de lotes e chaves estrangeiras)[cite: 2].

---

## 4-Regras de Negócio e Automação (FEFO & Triggers)

Implementado no ficheiro `04_vista_procedimentos.sql`:
1. **Função `fn_atualizar_estoque_por_lote()`:** Valida previamente o stock total ativo e consome os lotes por ordem cronológica de validade (`ORDER BY dataDeValidade ASC`).
2. **Gatilho `trg_item_venda_estoque`:** Disparado `BEFORE INSERT` na tabela `itemVenda` para garantir validação em tempo real.
3. **Vista `vw_posicao_estoque`:** Consolida o stock disponível por produto e identifica alertas de lotes com vencimento próximo[cite: 4].

---

## 5-Segurança e Controlo de Acessos (DCL)

O script `05_seguranca.sql` aplica os princípios de *hardening*:
* Isola o esquema público e cria a role `grupo_farmacia_app` com o utilizador de aplicação `usr_farmacia_web`.
* Concede privilégios restritos de consulta e escrita, omitindo comandos destrutivos como `DELETE` para a camada web[cite: 5].

---

## 6-Testes Transacionais (ACID) e Dados de Teste

* **`03_dados_teste.sql`:** Popula o sistema com dados iniciais de teste e múltiplos lotes com validades distintas[cite: 3].
* **`06_transacoes_teste.sql`:** Simula uma transação onde o segundo item falha por falta de stock, demonstrando o uso de `SAVEPOINT` e `ROLLBACK` para manter a consistência da base de dados[cite: 6].

---


## 7-Guia Passo a Passo: Como Executar o Projeto no pgAdmin

   Para implementar e testar este projeto do zero no seu ambiente local utilizando o **pgAdmin 4**, siga rigorosamente a ordem dos passos abaixo:

   ### Passo 1: Criar a Base de Dados
   1. Abra o **pgAdmin 4** e ligue-se ao seu servidor PostgreSQL.
   2. Na árvore de navegação à esquerda, clique com o botão direito em **Databases** > **Create** > **Database...**
   3. No campo **Database**, escreva `farmacia`.
   4. Clique em **Save** para criar a base de dados limpa.

   ### Passo 2: Executar os Scripts na Ordem Correta
   Para garantir que as dependências entre tabelas, restrições, funções e permissões sejam respeitadas, abra a ferramenta de execução de consultas (**Query Tool**) na base de dados `farmacia` e execute os ficheiros `.sql` **um a um, na exata ordem numérica apresentada abaixo**:

   1. **`01_esquema.sql`** *(Criação de Tabelas)*
      * *O que faz:* Cria a estrutura relacional base (categorias, utilizadores, fornecedores, medicamentos, vendas, lotes e itens de venda)[cite: 1].
   2. **`02_restricoes_indices.sql`** *(Restrições e Índices)*
      * *O que faz:* Adiciona as regras de validação (`CHECK`) e os índices para otimizar pesquisas e relatórios[cite: 2].
   3. **`04_vista_procedimentos.sql`** *(Função FEFO, Trigger e View)*
      * *O que faz:* Compila a lógica de baixa automática de stock por validade, cria o gatilho de validação e a vista operacional[cite: 4].
   4. **`05_seguranca.sql`** *(Papéis e Permissões - Hardening)*
      * *O que faz:* Configura o perfil de acesso restrito da aplicação web e protege as tabelas contra remoções indevidas[cite: 5].
   5. **`03_dados_teste.sql`** *(Carga de Dados Iniciais)*
      * *O que faz:* Insere categorias, utilizadores, fornecedores, medicamentos e múltiplos lotes com datas de validade diferentes para testes[cite: 3].
   6. **`06_transacoes_teste.sql`** *(Teste Transacional ACID)*
      * *O que faz:* Simula uma venda complexa com ponto de salvaguarda (`SAVEPOINT`) e reversão automática (`ROLLBACK`) em caso de falha de stock[cite: 6].



Defina a palavra-passe do utilizador PostgreSQL usado pela aplicação:

```bash
sudo -u postgres psql -d farmacia
```

Na consola PostgreSQL, introduza:

```text
\password usr_farmacia_web
```

Escreva e confirme uma palavra-passe forte. Depois saia com:

```text
\q
```

Guarde essa palavra-passe: vai precisar dela no passo seguinte.

> Não execute `03_dados_teste.sql` numa instalação normal. Os utilizadores de exemplo têm palavras-passe fictícias e não conseguem iniciar sessão.

## 4. Configurar o `.env`

Ainda na pasta `admin`, crie e abra o ficheiro:

```bash
cp .env.example .env
nano .env
```

Edite estas linhas:

```dotenv
DB_PASSWORD=PASSWORD_DO_POSTGRES
SESSION_SECRET=SEGREDO_ALEATORIO_COM_32_OU_MAIS_CARACTERES
BOOTSTRAP_ADMIN_NAME=Administrador
BOOTSTRAP_ADMIN_EMAIL=admin@farmacia.local
BOOTSTRAP_ADMIN_PASSWORD=DEFINA_UMA_PASSWORD_FORTE
```

- Substitua `PASSWORD_DO_POSTGRES` pela palavra-passe definida com `\password`.
- Para gerar um segredo aleatório, abra outro terminal e execute `openssl rand -hex 32`; copie o resultado para `SESSION_SECRET`.
- Defina a palavra-passe de acesso à aplicação em `BOOTSTRAP_ADMIN_PASSWORD` (mínimo de 12 caracteres). O email também pode ser alterado.
- Não partilhe o `.env`; contém credenciais.

No `nano`, guarde com **Ctrl+O**, prima **Enter** e saia com **Ctrl+X**.

## 5. Instalar e iniciar

Na pasta `admin`, execute:

```bash
npm install
npm start
```

Deixe esse terminal aberto enquanto utiliza a aplicação. Na primeira inicialização, o servidor cria o administrador caso o email indicado ainda não exista.

## 6. Entrar na aplicação

Abra no navegador:

<http://127.0.0.1:3000/login.html>

Use o email e a palavra-passe que definiu em `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD`.

Para verificar se o servidor responde, abra outro terminal e execute:

```bash
curl http://127.0.0.1:3000/api/health
```

Deve receber:

```json
{"status":"ok"}
```

Para parar o servidor, volte ao terminal do `npm start` e prima **Ctrl+C**.

## Problemas comuns

- **Falha de autenticação PostgreSQL:** confirme se `DB_PASSWORD` corresponde à palavra-passe definida para `usr_farmacia_web`.
- **O utilizador `usr_farmacia_web` não existe:** execute novamente `bd/05_seguranca.sql` com a conta administrativa PostgreSQL.
- **Tabelas ou vistas não encontradas:** confira a base selecionada e execute novamente os scripts de esquema na ordem indicada.
- **Não consegue iniciar sessão:** confirme o email e a palavra-passe no `.env`. Alterar `BOOTSTRAP_ADMIN_PASSWORD` depois de a conta ter sido criada não altera a palavra-passe já guardada na base.

Para publicar a aplicação fora da máquina local, configure HTTPS e `COOKIE_SECURE=true`. As sessões atuais ficam em memória e terminam quando o servidor reinicia.


## 8-Rotinas de Cópia de Segurança e Restauro

Script Bash `07_backup_restauro.sh` para cópias de segurança via `pg_dump`:
```bash
bash 07_backup_restauro.sh
psql -U postgres -d farmacia -f ./backups/backup_farmacia_YYYYMMDD_HHMMSS.sql
```[cite: 7]

---