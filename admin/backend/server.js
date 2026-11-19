import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";

const { Pool } = pg;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.resolve(currentDir, "..");
const frontendDir = path.join(adminDir, "front");
const port = Number(process.env.API_PORT || 3000);
const host = process.env.API_HOST || "127.0.0.1";
const sessionSecret = process.env.SESSION_SECRET || "";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const cookieName = "farma_session";
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "").split(",").map(value => value.trim()).filter(Boolean)
);

if (sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres. Configure-o em admin/.env.");
}
if (!process.env.DB_PASSWORD) {
  throw new Error("DB_PASSWORD não foi configurada. Copie admin/.env.example para admin/.env.");
}

const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "farmacia",
  user: process.env.DB_USER || "usr_farmacia_web",
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

const app = express();
const sessions = new Map();
const loginAttempts = new Map();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const origin = req.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  } else if (origin && origin !== `${req.protocol}://${req.get("host")}`) {
    return res.status(403).json({ error: "Origem não autorizada." });
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.sendStatus(204);
  }
  next();
});

function signSessionId(id) {
  return crypto.createHmac("sha256", sessionSecret).update(id).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(part => {
    const separator = part.indexOf("=");
    if (separator < 0) return ["", ""];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function currentSession(req) {
  const token = parseCookies(req.headers.cookie)[cookieName];
  if (!token) return null;
  const [id, signature] = token.split(".");
  if (!id || !signature) return null;
  const expected = signSessionId(id);
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + sessionLifetimeMs;
  return session.user;
}

function requireAuth(req, res, next) {
  const user = currentSession(req);
  if (!user) return res.status(401).json({ error: "Sessão expirada ou não iniciada." });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.perfil !== "Administrador") {
    return res.status(403).json({ error: "Esta operação requer perfil de administrador." });
  }
  next();
}

function validId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0;
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw httpError(400, `${label} é obrigatório e deve ter até ${maxLength} caracteres.`);
  }
  return value.trim();
}

function optionalText(value, label, maxLength) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw httpError(400, `${label} deve ter até ${maxLength} caracteres.`);
  }
  return value.trim();
}

function positiveInt(value, label, allowZero = false) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < (allowZero ? 0 : 1)) {
    throw httpError(400, `${label} deve ser um número inteiro${allowZero ? " não negativo" : " positivo"}.`);
  }
  return number;
}

function nonnegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw httpError(400, `${label} deve ser zero ou maior.`);
  return number;
}

function validEmail(value) {
  const email = requiredText(value, "Email", 100).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "Email inválido.");
  return email;
}

function validStatus(value) {
  const status = value ?? "ATIVO";
  if (!["ATIVO", "INATIVO"].includes(status)) throw httpError(400, "Estado inválido.");
  return status;
}

function validDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, `${label} deve ser uma data válida no formato AAAA-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw httpError(400, `${label} deve ser uma data válida no formato AAAA-MM-DD.`);
  }
  return value;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string" || !storedHash.startsWith("scrypt$")) return false;
  const [, saltValue, hashValue] = storedHash.split("$");
  if (!saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (error, key) => error ? reject(error) : resolve(key));
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function bootstrapAdmin() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!name || !email || !password || password === "DEFINIR_UMA_PASSWORD_FORTE") {
    console.warn("Conta inicial não criada: configure BOOTSTRAP_ADMIN_NAME, EMAIL e PASSWORD no admin/.env.");
    return;
  }
  if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.");
  const found = await pool.query("SELECT 1 FROM usuarios WHERE lower(email) = lower($1) LIMIT 1", [email]);
  if (found.rowCount) return;
  const passwordHash = await hashPassword(password);
  await pool.query(
    "INSERT INTO usuarios (nome, email, senha, perfil, status) VALUES ($1, $2, $3, 'Administrador', 'ATIVO')",
    [name, email, passwordHash]
  );
  console.info(`Conta administrativa inicial criada para ${email}.`);
}

async function fetchCollections(user) {
  const [
    categoriesResult,
    suppliersResult,
    medicinesResult,
    usersResult,
    lotsResult,
    salesResult
  ] = await Promise.all([
    pool.query(`SELECT idcategoria AS "idCategoria", nomedacategoria AS "nomeDaCategoria", descricao
      FROM categoria ORDER BY nomedacategoria`),
    pool.query(`SELECT idfornecedor AS "idFornecedor", nomedaempresa AS "nomeDaEmpresa", nif, telefone, email, status
      FROM fornecedor ORDER BY nomedaempresa`),
    pool.query(`SELECT p.idmedicamento AS "idMedicamento", p.nome, p.precodevenda AS "precoDeVenda",
        p.idcategoria AS "idCategoria", c.nomedacategoria AS "nomeDaCategoria",
        COALESCE(s.estoqueTotalDisponivel, 0)::int AS "estoqueTotalDisponivel",
        (SELECT min(l.datadevalidade) FROM loteemestoque l
          WHERE l.idmedicamento = p.idmedicamento AND l.qtdatual > 0 AND l.datadevalidade > CURRENT_DATE) AS "proximaValidade",
        COALESCE(s.lotesProximosVencimento, 0)::int AS "lotesProximosVencimento"
      FROM medicamento p
      JOIN categoria c ON c.idcategoria = p.idcategoria
      LEFT JOIN vw_posicao_estoque s ON s.idmedicamento = p.idmedicamento
      ORDER BY p.nome`),
    user.perfil === "Administrador"
      ? pool.query(`SELECT idusuarios AS "idUsuarios", nome, email, perfil, status, datadecriacao AS "dataDeCriacao"
          FROM usuarios ORDER BY nome`)
      : pool.query(`SELECT idusuarios AS "idUsuarios", nome, email, perfil, status, datadecriacao AS "dataDeCriacao"
          FROM usuarios WHERE idusuarios = $1`, [user.idUsuarios]),
    pool.query(`SELECT l.idloteemestoque AS "idLoteEmEstoque", l.numerodolote AS "numeroDoLote",
        l.qtdinicial AS "qtdInicial", l.qtdatual AS "qtdAtual", l.custototal AS "custoTotal",
        l.datadeentrega AS "dataDeEntrega", l.datadevalidade AS "dataDeValidade",
        l.idusuarios AS "idUsuarios", l.idfornecedor AS "idFornecedor", l.idmedicamento AS "idMedicamento"
      FROM loteemestoque l ORDER BY l.datadevalidade, l.idloteemestoque`),
    pool.query(`SELECT v.idvenda AS "idVenda", v.dataehora AS "dataEHora", v.valortotal AS "valorTotal",
        v.formadepagamento AS "formaDePagamento", v.idusuarios AS "idUsuarios",
        COALESCE(json_agg(json_build_object(
          'idMedicamento', i.idmedicamento,
          'nomeMedicamento', m.nome,
          'qtdVendida', i.qtdvendida,
          'precoUnitario', i.precounitario
        ) ORDER BY i.iditemvenda) FILTER (WHERE i.iditemvenda IS NOT NULL), '[]'::json) AS itens
      FROM venda v
      LEFT JOIN itemvenda i ON i.idvenda = v.idvenda
      LEFT JOIN medicamento m ON m.idmedicamento = i.idmedicamento
      ${user.perfil === "Administrador" ? "" : "WHERE v.idusuarios = $1"}
      GROUP BY v.idvenda ORDER BY v.dataehora DESC, v.idvenda DESC`,
    user.perfil === "Administrador" ? [] : [user.idUsuarios])
  ]);
  return {
    categorias: categoriesResult.rows,
    fornecedores: suppliersResult.rows,
    medicamentos: medicinesResult.rows.map(row => ({
      ...row,
      precoDeVenda: Number(row.precoDeVenda),
      estoqueTotalDisponivel: Number(row.estoqueTotalDisponivel)
    })),
    usuarios: usersResult.rows,
    lotes: lotsResult.rows.map(row => ({
      ...row,
      qtdInicial: Number(row.qtdInicial),
      qtdAtual: Number(row.qtdAtual),
      custoTotal: Number(row.custoTotal)
    })),
    vendas: salesResult.rows.map(row => ({
      ...row,
      valorTotal: Number(row.valorTotal),
      itens: row.itens.map(item => ({
        ...item,
        qtdVendida: Number(item.qtdVendida),
        precoUnitario: Number(item.precoUnitario)
      }))
    }))
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createSessionCookie(res, id) {
  const token = `${id}.${signSessionId(id)}`;
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure}`);
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const ip = req.ip;
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.count >= 10 && Date.now() - attempt.startedAt < 15 * 60 * 1000) {
    return res.status(429).json({ error: "Demasiadas tentativas. Aguarde 15 minutos e tente novamente." });
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.senha === "string" ? req.body.senha : "";
  if (!email || !password) return res.status(400).json({ error: "Informe email e palavra-passe." });

  const result = await pool.query(
    `SELECT idusuarios AS "idUsuarios", nome, email, senha, perfil, status
      FROM usuarios WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  const user = result.rows[0];
  const valid = user && user.status === "ATIVO" && await verifyPassword(password, user.senha);
  if (!valid) {
    const current = loginAttempts.get(ip);
    loginAttempts.set(ip, current && Date.now() - current.startedAt < 15 * 60 * 1000
      ? { ...current, count: current.count + 1 }
      : { startedAt: Date.now(), count: 1 });
    return res.status(401).json({ error: "Email ou palavra-passe inválidos." });
  }
  loginAttempts.delete(ip);
  const id = crypto.randomBytes(32).toString("base64url");
  const publicUser = {
    idUsuarios: user.idUsuarios,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil
  };
  sessions.set(id, { user: publicUser, expiresAt: Date.now() + sessionLifetimeMs });
  createSessionCookie(res, id);
  res.json({ usuario: publicUser });
}));

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = parseCookies(req.headers.cookie)[cookieName];
  if (token) sessions.delete(token.split(".")[0]);
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ ok: true });
});

app.get("/api/auth/session", requireAuth, (req, res) => res.json({ usuario: req.user }));
app.get("/api/bootstrap", requireAuth, asyncRoute(async (req, res) => res.json(await fetchCollections(req.user))));

app.get("/api/categorias", requireAuth, asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT idcategoria AS "idCategoria", nomedacategoria AS "nomeDaCategoria", descricao FROM categoria ORDER BY nomedacategoria`);
  res.json(result.rows);
}));

app.post("/api/categorias", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const nome = requiredText(req.body?.nomeDaCategoria, "Nome da categoria", 100);
  const descricao = optionalText(req.body?.descricao, "Descrição", 255);
  const result = await pool.query(
    `INSERT INTO categoria (nomedacategoria, descricao) VALUES ($1, $2)
      RETURNING idcategoria AS "idCategoria", nomedacategoria AS "nomeDaCategoria", descricao`,
    [nome, descricao]
  );
  res.status(201).json(result.rows[0]);
}));

app.put("/api/categorias/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de categoria inválido.");
  const nome = requiredText(req.body?.nomeDaCategoria, "Nome da categoria", 100);
  const descricao = optionalText(req.body?.descricao, "Descrição", 255);
  const result = await pool.query(
    `UPDATE categoria SET nomedacategoria = $1, descricao = $2 WHERE idcategoria = $3
      RETURNING idcategoria AS "idCategoria", nomedacategoria AS "nomeDaCategoria", descricao`,
    [nome, descricao, req.params.id]
  );
  if (!result.rowCount) throw httpError(404, "Categoria não encontrada.");
  res.json(result.rows[0]);
}));

app.delete("/api/categorias/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de categoria inválido.");
  const result = await pool.query("DELETE FROM categoria WHERE idcategoria = $1 RETURNING idcategoria", [req.params.id]);
  if (!result.rowCount) throw httpError(404, "Categoria não encontrada.");
  res.sendStatus(204);
}));

app.get("/api/usuarios", requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT idusuarios AS "idUsuarios", nome, email, perfil, status, datadecriacao AS "dataDeCriacao"
    FROM usuarios ORDER BY nome`);
  res.json(result.rows);
}));

app.post("/api/usuarios", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const nome = requiredText(req.body?.nome, "Nome", 100);
  const email = validEmail(req.body?.email);
  const password = requiredText(req.body?.senha, "Palavra-passe", 200);
  if (password.length < 12) throw httpError(400, "A palavra-passe deve ter pelo menos 12 caracteres.");
  const perfil = req.body?.perfil;
  if (!["Administrador", "Farmacêutico"].includes(perfil)) throw httpError(400, "Perfil inválido.");
  const senha = await hashPassword(password);
  const result = await pool.query(
    `INSERT INTO usuarios (nome, email, senha, perfil, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING idusuarios AS "idUsuarios", nome, email, perfil, status, datadecriacao AS "dataDeCriacao"`,
    [nome, email, senha, perfil, validStatus(req.body.status)]
  );
  res.status(201).json(result.rows[0]);
}));

app.put("/api/usuarios/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de utilizador inválido.");
  const nome = requiredText(req.body?.nome, "Nome", 100);
  const email = validEmail(req.body?.email);
  const perfil = req.body?.perfil;
  if (!["Administrador", "Farmacêutico"].includes(perfil)) throw httpError(400, "Perfil inválido.");
  const fields = [nome, email, perfil, validStatus(req.body.status), req.params.id];
  let passwordSql = "";
  if (req.body.senha) {
    if (typeof req.body.senha !== "string" || req.body.senha.length < 12 || req.body.senha.length > 200) {
      throw httpError(400, "A palavra-passe deve ter entre 12 e 200 caracteres.");
    }
    fields.splice(4, 0, await hashPassword(req.body.senha));
    passwordSql = ", senha = $5";
  }
  const result = await pool.query(
    `UPDATE usuarios SET nome = $1, email = $2, perfil = $3, status = $4${passwordSql}
      WHERE idusuarios = $${fields.length}
      RETURNING idusuarios AS "idUsuarios", nome, email, perfil, status, datadecriacao AS "dataDeCriacao"`,
    fields
  );
  if (!result.rowCount) throw httpError(404, "Utilizador não encontrado.");
  res.json(result.rows[0]);
}));

app.delete("/api/usuarios/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de utilizador inválido.");
  if (Number(req.params.id) === Number(req.user.idUsuarios)) throw httpError(400, "Não pode eliminar a sua própria conta.");
  const result = await pool.query("DELETE FROM usuarios WHERE idusuarios = $1 RETURNING idusuarios", [req.params.id]);
  if (!result.rowCount) throw httpError(404, "Utilizador não encontrado.");
  res.sendStatus(204);
}));

app.get("/api/fornecedores", requireAuth, asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT idfornecedor AS "idFornecedor", nomedaempresa AS "nomeDaEmpresa", nif, telefone, email, status
    FROM fornecedor ORDER BY nomedaempresa`);
  res.json(result.rows);
}));

app.post("/api/fornecedores", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const values = [
    requiredText(req.body?.nomeDaEmpresa, "Nome da empresa", 150),
    requiredText(req.body?.nif, "NIF", 20),
    optionalText(req.body?.telefone, "Telefone", 20),
    optionalText(req.body?.email, "Email", 100),
    validStatus(req.body?.status)
  ];
  const result = await pool.query(
    `INSERT INTO fornecedor (nomedaempresa, nif, telefone, email, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING idfornecedor AS "idFornecedor", nomedaempresa AS "nomeDaEmpresa", nif, telefone, email, status`,
    values
  );
  res.status(201).json(result.rows[0]);
}));

app.put("/api/fornecedores/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de fornecedor inválido.");
  const values = [
    requiredText(req.body?.nomeDaEmpresa, "Nome da empresa", 150),
    requiredText(req.body?.nif, "NIF", 20),
    optionalText(req.body?.telefone, "Telefone", 20),
    optionalText(req.body?.email, "Email", 100),
    validStatus(req.body?.status),
    req.params.id
  ];
  const result = await pool.query(
    `UPDATE fornecedor SET nomedaempresa = $1, nif = $2, telefone = $3, email = $4, status = $5
      WHERE idfornecedor = $6
      RETURNING idfornecedor AS "idFornecedor", nomedaempresa AS "nomeDaEmpresa", nif, telefone, email, status`,
    values
  );
  if (!result.rowCount) throw httpError(404, "Fornecedor não encontrado.");
  res.json(result.rows[0]);
}));

app.delete("/api/fornecedores/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de fornecedor inválido.");
  const result = await pool.query("DELETE FROM fornecedor WHERE idfornecedor = $1 RETURNING idfornecedor", [req.params.id]);
  if (!result.rowCount) throw httpError(404, "Fornecedor não encontrado.");
  res.sendStatus(204);
}));

app.get("/api/medicamentos", requireAuth, asyncRoute(async (req, res) => {
  const data = await fetchCollections(req.user);
  res.json(data.medicamentos);
}));

app.post("/api/medicamentos", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const nome = requiredText(req.body?.nome, "Nome do medicamento", 150);
  const preco = nonnegativeNumber(req.body?.precoDeVenda, "Preço");
  const categoryId = positiveInt(req.body?.idCategoria, "Categoria");
  const result = await pool.query(
    `INSERT INTO medicamento (nome, precodevenda, idcategoria) VALUES ($1, $2, $3)
      RETURNING idmedicamento AS "idMedicamento", nome, precodevenda AS "precoDeVenda", idcategoria AS "idCategoria"`,
    [nome, preco, categoryId]
  );
  res.status(201).json({ ...result.rows[0], precoDeVenda: Number(result.rows[0].precoDeVenda), estoqueTotalDisponivel: 0 });
}));

app.put("/api/medicamentos/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de medicamento inválido.");
  const values = [
    requiredText(req.body?.nome, "Nome do medicamento", 150),
    nonnegativeNumber(req.body?.precoDeVenda, "Preço"),
    positiveInt(req.body?.idCategoria, "Categoria"),
    req.params.id
  ];
  const result = await pool.query(
    `UPDATE medicamento SET nome = $1, precodevenda = $2, idcategoria = $3
      WHERE idmedicamento = $4
      RETURNING idmedicamento AS "idMedicamento", nome, precodevenda AS "precoDeVenda", idcategoria AS "idCategoria"`,
    values
  );
  if (!result.rowCount) throw httpError(404, "Medicamento não encontrado.");
  res.json({ ...result.rows[0], precoDeVenda: Number(result.rows[0].precoDeVenda) });
}));

app.delete("/api/medicamentos/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de medicamento inválido.");
  const result = await pool.query("DELETE FROM medicamento WHERE idmedicamento = $1 RETURNING idmedicamento", [req.params.id]);
  if (!result.rowCount) throw httpError(404, "Medicamento não encontrado.");
  res.sendStatus(204);
}));

app.get("/api/lotes", requireAuth, asyncRoute(async (_req, res) => {
  const result = await pool.query(`SELECT idloteemestoque AS "idLoteEmEstoque", numerodolote AS "numeroDoLote",
      qtdinicial AS "qtdInicial", qtdatual AS "qtdAtual", custototal AS "custoTotal",
      datadeentrega AS "dataDeEntrega", datadevalidade AS "dataDeValidade",
      idusuarios AS "idUsuarios", idfornecedor AS "idFornecedor", idmedicamento AS "idMedicamento"
    FROM loteemestoque ORDER BY datadevalidade, idloteemestoque`);
  res.json(result.rows.map(row => ({
    ...row,
    qtdInicial: Number(row.qtdInicial),
    qtdAtual: Number(row.qtdAtual),
    custoTotal: Number(row.custoTotal)
  })));
}));

app.post("/api/lotes", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const initial = positiveInt(req.body?.qtdInicial, "Quantidade inicial");
  const current = positiveInt(req.body?.qtdAtual, "Quantidade atual", true);
  if (current > initial) throw httpError(400, "Quantidade atual não pode exceder a quantidade inicial.");
  const deliveryDate = validDate(req.body?.dataDeEntrega, "Data de entrega");
  const expiryDate = validDate(req.body?.dataDeValidade, "Data de validade");
  if (expiryDate <= deliveryDate) throw httpError(400, "A validade deve ser posterior à data de entrega.");
  const values = [
    requiredText(req.body?.numeroDoLote, "Número do lote", 50),
    initial,
    current,
    nonnegativeNumber(req.body?.custoTotal, "Custo total"),
    deliveryDate,
    expiryDate,
    req.user.idUsuarios,
    positiveInt(req.body?.idFornecedor, "Fornecedor"),
    positiveInt(req.body?.idMedicamento, "Medicamento")
  ];
  const result = await pool.query(
    `INSERT INTO loteemestoque (numerodolote, qtdinicial, qtdatual, custototal, datadeentrega,
      datadevalidade, idusuarios, idfornecedor, idmedicamento)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING idloteemestoque AS "idLoteEmEstoque", numerodolote AS "numeroDoLote",
        qtdinicial AS "qtdInicial", qtdatual AS "qtdAtual", custototal AS "custoTotal",
        datadeentrega AS "dataDeEntrega", datadevalidade AS "dataDeValidade",
        idusuarios AS "idUsuarios", idfornecedor AS "idFornecedor", idmedicamento AS "idMedicamento"`,
    values
  );
  res.status(201).json(result.rows[0]);
}));

app.put("/api/lotes/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de lote inválido.");
  const initial = positiveInt(req.body?.qtdInicial, "Quantidade inicial");
  const current = positiveInt(req.body?.qtdAtual, "Quantidade atual", true);
  if (current > initial) throw httpError(400, "Quantidade atual não pode exceder a quantidade inicial.");
  const deliveryDate = validDate(req.body?.dataDeEntrega, "Data de entrega");
  const expiryDate = validDate(req.body?.dataDeValidade, "Data de validade");
  if (expiryDate <= deliveryDate) throw httpError(400, "A validade deve ser posterior à data de entrega.");
  const values = [
    requiredText(req.body?.numeroDoLote, "Número do lote", 50),
    initial,
    current,
    nonnegativeNumber(req.body?.custoTotal, "Custo total"),
    deliveryDate,
    expiryDate,
    positiveInt(req.body?.idFornecedor, "Fornecedor"),
    positiveInt(req.body?.idMedicamento, "Medicamento"),
    req.params.id
  ];
  const result = await pool.query(
    `UPDATE loteemestoque SET numerodolote = $1, qtdinicial = $2, qtdatual = $3, custototal = $4,
      datadeentrega = $5, datadevalidade = $6, idfornecedor = $7, idmedicamento = $8
      WHERE idloteemestoque = $9
      RETURNING idloteemestoque AS "idLoteEmEstoque", numerodolote AS "numeroDoLote",
        qtdinicial AS "qtdInicial", qtdatual AS "qtdAtual", custototal AS "custoTotal",
        datadeentrega AS "dataDeEntrega", datadevalidade AS "dataDeValidade",
        idusuarios AS "idUsuarios", idfornecedor AS "idFornecedor", idmedicamento AS "idMedicamento"`,
    values
  );
  if (!result.rowCount) throw httpError(404, "Lote não encontrado.");
  res.json(result.rows[0]);
}));

app.delete("/api/lotes/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw httpError(400, "Identificador de lote inválido.");
  const result = await pool.query("DELETE FROM loteemestoque WHERE idloteemestoque = $1 RETURNING idloteemestoque", [req.params.id]);
  if (!result.rowCount) throw httpError(404, "Lote não encontrado.");
  res.sendStatus(204);
}));

app.get("/api/vendas", requireAuth, asyncRoute(async (req, res) => {
  const result = await fetchCollections(req.user);
  res.json(result.vendas);
}));

app.post("/api/vendas", requireAuth, asyncRoute(async (req, res) => {
  const items = req.body?.itens;
  const payment = requiredText(req.body?.formaDePagamento, "Forma de pagamento", 50);
  if (!["Dinheiro / Cash", "Multicaixa", "Transferência", "Outro"].includes(payment)) {
    throw httpError(400, "Forma de pagamento inválida.");
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw httpError(400, "A venda deve incluir entre 1 e 100 produtos.");
  }
  const quantities = new Map();
  for (const item of items) {
    const medicineId = positiveInt(item.idMedicamento, "Medicamento");
    const quantity = positiveInt(item.qtdVendida, "Quantidade");
    quantities.set(medicineId, (quantities.get(medicineId) || 0) + quantity);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pricedItems = [];
    for (const [medicineId, quantity] of [...quantities].sort(([left], [right]) => left - right)) {
      const result = await client.query(
        `SELECT idmedicamento AS "idMedicamento", nome, precodevenda AS "precoDeVenda"
          FROM medicamento WHERE idmedicamento = $1`,
        [medicineId]
      );
      if (!result.rowCount) throw httpError(400, `Medicamento ${medicineId} não encontrado.`);
      pricedItems.push({
        ...result.rows[0],
        precoDeVenda: Number(result.rows[0].precoDeVenda),
        quantity
      });
    }
    const total = pricedItems.reduce((sum, item) => sum + item.quantity * item.precoDeVenda, 0);
    const saleResult = await client.query(
      `INSERT INTO venda (formadepagamento, valortotal, idusuarios)
        VALUES ($1, $2, $3)
        RETURNING idvenda AS "idVenda", dataehora AS "dataEHora", valortotal AS "valorTotal",
          formadepagamento AS "formaDePagamento", idusuarios AS "idUsuarios"`,
      [payment, total, req.user.idUsuarios]
    );
    const sale = saleResult.rows[0];
    const saleItems = [];
    for (const item of pricedItems) {
      const inserted = await client.query(
        `INSERT INTO itemvenda (qtdvendida, precounitario, idvenda, idmedicamento)
          VALUES ($1, $2, $3, $4)
          RETURNING iditemvenda AS "idItemVenda", qtdvendida AS "qtdVendida",
            precounitario AS "precoUnitario", idvenda AS "idVenda", idmedicamento AS "idMedicamento"`,
        [item.quantity, item.precoDeVenda, sale.idVenda, item.idMedicamento]
      );
      saleItems.push({ ...inserted.rows[0], nomeMedicamento: item.nome });
    }
    await client.query("COMMIT");
    res.status(201).json({
      ...sale,
      valorTotal: Number(sale.valorTotal),
      itens: saleItems.map(item => ({
        ...item,
        qtdVendida: Number(item.qtdVendida),
        precoUnitario: Number(item.precoUnitario)
      }))
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint da API não encontrado." }));
app.use(express.static(frontendDir, { extensions: ["html"] }));
app.get("/", (_req, res) => res.redirect("/login.html"));

app.use((error, _req, res, _next) => {
  if (error.code === "23505") return res.status(409).json({ error: "Já existe um registo com estes dados únicos." });
  if (error.code === "23503") return res.status(409).json({ error: "O registo está associado a outros dados e não pode ser alterado ou removido." });
  if (error.code === "23514" || error.code === "22P02") return res.status(400).json({ error: "Os dados não respeitam as regras da base de dados." });
  if (error.code === "P0001" && /stock insuficiente/i.test(error.message || "")) {
    return res.status(409).json({ error: "Stock insuficiente para concluir a venda." });
  }
  if (error.code === "42501") {
    console.error("Permissões PostgreSQL insuficientes:", error.message);
    return res.status(500).json({ error: "A conta da API não tem as permissões necessárias. Revise bd/05_seguranca.sql." });
  }
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error("Erro não tratado na API:", error);
  res.status(500).json({ error: "Ocorreu um erro interno. Consulte o log do servidor." });
});

async function start() {
  await pool.query("SELECT 1");
  await bootstrapAdmin();
  app.listen(port, host, () => {
    console.info(`farma+ API e frontend disponíveis em http://${host}:${port}`);
  });
}

start().catch(error => {
  console.error("Não foi possível iniciar a API:", error);
  process.exitCode = 1;
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});
