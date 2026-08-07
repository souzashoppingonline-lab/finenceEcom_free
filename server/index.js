import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Configuracao Supabase
// Usamos a Service Role Key APENAS no servidor (nunca no frontend).
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'troque-este-token';

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
} else {
  console.warn('[AVISO] SUPABASE_URL / SUPABASE_SERVICE_KEY nao configurados. Rodando em modo memoria (dados nao persistem).');
}

// ---------------------------------------------------------------------------
// Notificacao por e-mail (opcional). Configurada via variaveis de ambiente:
//   SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 587),
//   SMTP_USER, SMTP_PASS, NOTIFY_EMAIL (para quem enviar o aviso)
// Se nao configurado, as notificacoes sao ignoradas silenciosamente.
// ---------------------------------------------------------------------------
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || SMTP_USER;
// Remetente valido (o SMTP do Resend usa user='resend', que NAO e um e-mail).
// Use MAIL_FROM ou ALERT_FROM com um endereco do dominio verificado.
const MAIL_FROM = process.env.MAIL_FROM || process.env.ALERT_FROM || 'FinanceEcom Free <nao-responda@financeecom.com.br>';

let mailer = null;
if (SMTP_USER && SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log('[INFO] Notificacoes por e-mail ativadas.');
} else {
  console.warn('[AVISO] SMTP nao configurado. Notificacoes por e-mail desativadas.');
}

async function notifyNewLead(lead) {
  if (!mailer || !NOTIFY_EMAIL) return;
  try {
    await mailer.sendMail({
      from: MAIL_FROM,
      to: NOTIFY_EMAIL,
      subject: `Novo cliente: ${lead.name}`,
      text:
        `Voce tem um novo cadastro no FinanceEcom Free!\n\n` +
        `Nome: ${lead.name}\n` +
        `E-mail: ${lead.email}\n` +
        `WhatsApp: ${lead.whatsapp || '-'}\n` +
        `Marketplace: ${lead.marketplace || '-'}\n` +
        `Data: ${new Date(lead.created_at).toLocaleString('pt-BR')}\n`,
    });
  } catch (err) {
    console.error('Erro ao enviar e-mail de notificacao:', err.message);
  }
}

// Fallback em memoria para desenvolvimento sem Supabase
const memoryStore = [];
let memoryVisits = 0;
const memoryVisitDates = [];
const memorySettings = {};
const memStores = [];
const memSales = [];
const memGoals = [];
const memImports = [];
const memBoletos = [];
const memCF = []; // cash_flow_entries
const memLists = []; // fornecedores, categorias, etc.
const memExpenses = [];
const memAlerts = [];
const memManual = []; // fluxo de caixa anual manual
const memCards = [];
const memParcelas = [];
const memFaturaPagtos = [];

const memAiSettings = [];       // config de IA + token da extensao por usuario
const memAnaliseProducts = [];  // produtos em analise
const memAnaliseActive = [];    // { user_id, product_id }
const memAnaliseAds = [];       // concorrentes coletados
const memAnaliseSnaps = [];     // historico de preco

function makeId() {
  return 'mem-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Criptografia dos tokens de IA do cliente (AES-256-GCM).
// A chave vem de TOKEN_ENC_KEY (32 bytes em hex/base64) ou deriva do ADMIN_TOKEN.
// Guardamos "iv:tag:ciphertext" em base64. Nunca gravamos a chave em texto puro.
// ---------------------------------------------------------------------------
const ENC_KEY = (() => {
  const raw = process.env.TOKEN_ENC_KEY || ADMIN_TOKEN || 'financeecom-default-enc-key';
  return crypto.createHash('sha256').update(String(raw)).digest(); // 32 bytes
})();

function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decryptSecret(blob) {
  if (!blob || typeof blob !== 'string' || !blob.includes(':')) return null;
  try {
    const [ivB, tagB, dataB] = blob.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
  } catch (_) { return null; }
}

// Mascara uma chave para exibir no frontend (sk-ant-...1234)
function maskKey(plain) {
  if (!plain) return null;
  const s = String(plain);
  if (s.length <= 10) return '••••';
  return s.slice(0, 6) + '••••••' + s.slice(-4);
}

app.set('trust proxy', 1); // atras do Cloudflare/Render — usa X-Forwarded-For

// Cabecalhos de seguranca (defesa em profundidade)
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');       // impede MIME sniffing
  res.set('X-Frame-Options', 'SAMEORIGIN');            // anti-clickjacking
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.set('X-DNS-Prefetch-Control', 'off');
  next();
});

app.use(express.json({ limit: '1mb' })); // limita tamanho do corpo (anti-DoS)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Rate limiting (em memoria) — protege contra brute force / spam
// ---------------------------------------------------------------------------
function makeLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, reset }
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, windowMs).unref?.();
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let e = hits.get(ip);
    if (!e || now > e.reset) { e = { count: 0, reset: now + windowMs }; hits.set(ip, e); }
    e.count++;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      return res.status(429).json({ error: message || 'Muitas requisições. Aguarde alguns instantes.' });
    }
    next();
  };
}

// Limite geral em todas as APIs (rede de seguranca)
app.use('/api/', makeLimiter({ windowMs: 5 * 60 * 1000, max: 600 }));
// Limites mais rigidos para endpoints publicos sensiveis
const limitLeads = makeLimiter({ windowMs: 60 * 1000, max: 10, message: 'Muitos cadastros. Tente novamente em 1 minuto.' });
const limitTest = makeLimiter({ windowMs: 60 * 1000, max: 5, message: 'Aguarde antes de enviar outro teste.' });

// ---------------------------------------------------------------------------
// Middleware de autenticacao do painel admin (com bloqueio anti brute force)
// 5 tentativas erradas -> bloqueia o IP por 15 minutos.
// ---------------------------------------------------------------------------
const adminFails = new Map(); // ip -> { count, reset, blockedUntil }
setInterval(() => { const now = Date.now(); for (const [k, v] of adminFails) if (!v.blockedUntil && now > v.reset) adminFails.delete(k); }, 15 * 60 * 1000).unref?.();

function requireAdmin(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = adminFails.get(ip);
  if (rec?.blockedUntil && now < rec.blockedUntil) {
    res.set('Retry-After', String(Math.ceil((rec.blockedUntil - now) / 1000)));
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
  }
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    const r = (rec && now <= rec.reset) ? rec : { count: 0, reset: now + 15 * 60 * 1000 };
    r.count++;
    if (r.count >= 5) r.blockedUntil = now + 15 * 60 * 1000;
    adminFails.set(ip, r);
    return res.status(401).json({ error: 'Nao autorizado.' });
  }
  adminFails.delete(ip); // sucesso limpa o contador
  next();
}

// ---------------------------------------------------------------------------
// POST /api/leads  -> cadastro publico (captacao)
// ---------------------------------------------------------------------------
app.post('/api/leads', limitLeads, async (req, res) => {
  const { name, email, whatsapp, marketplace, consent } = req.body || {};

  if (!name || !email || !whatsapp) {
    return res.status(400).json({ error: 'Nome, e-mail e WhatsApp sao obrigatorios.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail invalido.' });
  }
  if (consent !== true) {
    return res.status(400).json({ error: 'E necessario aceitar a Politica de Privacidade (LGPD).' });
  }

  const record = {
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    whatsapp: String(whatsapp).replace(/\D/g, ''),
    marketplace: marketplace ? String(marketplace).trim() : null,
    consent: true,
    created_at: new Date().toISOString(),
  };

  try {
    if (supabase) {
      const { error } = await supabase.from('leads').insert(record);
      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Este e-mail ja esta cadastrado.' });
        }
        throw error;
      }
    } else {
      if (memoryStore.some((r) => r.email === record.email)) {
        return res.status(409).json({ error: 'Este e-mail ja esta cadastrado.' });
      }
      memoryStore.push({ id: makeId(), ...record });
    }
    notifyNewLead(record); // nao bloqueia a resposta
    return res.status(201).json({ ok: true, message: 'Cadastro realizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao salvar lead:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar cadastro.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/visit  -> registra uma visita na pagina de cadastro (publico)
// ---------------------------------------------------------------------------
app.post('/api/visit', async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('page_visits').insert({ created_at: new Date().toISOString() });
    } else {
      memoryVisits += 1;
      memoryVisitDates.push(Date.now());
    }
  } catch (err) {
    // Nao bloqueia a pagina se a contagem falhar
    console.error('Erro ao registrar visita:', err);
  }
  return res.status(204).end();
});

// ---------------------------------------------------------------------------
// GET /api/stats  -> metricas do painel (protegido)
// ---------------------------------------------------------------------------
app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    if (supabase) {
      const { count, error } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;

      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: last7, error: e2 } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since);
      if (e2) throw e2;

      // Visitas (tabela page_visits); se a tabela nao existir, retorna 0
      let visits = 0;
      const { count: vCount } = await supabase
        .from('page_visits')
        .select('*', { count: 'exact', head: true });
      visits = vCount || 0;

      // Taxa de conversao (cadastros / visitas)
      const conversion = visits > 0 ? Math.round(((count || 0) / visits) * 1000) / 10 : 0;

      return res.json({ total: count || 0, last7days: last7 || 0, visits, conversion });
    }
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const last7 = memoryStore.filter((r) => new Date(r.created_at).getTime() >= since).length;
    const conversion = memoryVisits > 0 ? Math.round((memoryStore.length / memoryVisits) * 1000) / 10 : 0;
    return res.json({ total: memoryStore.length, last7days: last7, visits: memoryVisits, conversion });
  } catch (err) {
    console.error('Erro ao buscar stats:', err);
    return res.status(500).json({ error: 'Erro ao buscar metricas.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/leads  -> lista de clientes (protegido)
// ---------------------------------------------------------------------------
app.get('/api/leads', requireAdmin, async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email, whatsapp, marketplace, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return res.json({ leads: data });
    }
    const sorted = [...memoryStore].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    return res.json({ leads: sorted });
  } catch (err) {
    console.error('Erro ao listar leads:', err);
    return res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/leads  -> cria um cliente manualmente (protegido)
// ---------------------------------------------------------------------------
app.post('/api/admin/leads', requireAdmin, async (req, res) => {
  const { name, email, whatsapp, marketplace } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail sao obrigatorios.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail invalido.' });
  }

  const record = {
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    whatsapp: whatsapp ? String(whatsapp).replace(/\D/g, '') : '',
    marketplace: marketplace ? String(marketplace).trim() : null,
    consent: true,
    created_at: new Date().toISOString(),
  };

  try {
    if (supabase) {
      const { data, error } = await supabase.from('leads').insert(record).select('id').single();
      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Este e-mail ja esta cadastrado.' });
        }
        throw error;
      }
      return res.status(201).json({ ok: true, id: data.id });
    }
    if (memoryStore.some((r) => r.email === record.email)) {
      return res.status(409).json({ error: 'Este e-mail ja esta cadastrado.' });
    }
    const withId = { id: makeId(), ...record };
    memoryStore.push(withId);
    return res.status(201).json({ ok: true, id: withId.id });
  } catch (err) {
    console.error('Erro ao criar cliente:', err);
    return res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/leads/:id  -> exclui um cliente (protegido, LGPD)
// ---------------------------------------------------------------------------
app.delete('/api/leads/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
    } else {
      const idx = memoryStore.findIndex((r) => r.id === id);
      if (idx >= 0) memoryStore.splice(idx, 1);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir cliente:', err);
    return res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/timeseries?days=14  -> cadastros e visitas por dia (protegido)
// ---------------------------------------------------------------------------
app.get('/api/timeseries', requireAdmin, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const startIso = start.toISOString();

  // Monta os buckets vazios (um por dia)
  const buckets = {};
  const labels = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, signups: 0, visits: 0 };
    labels.push(key);
  }

  const bump = (rows, field) => {
    for (const r of rows || []) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      if (buckets[key]) buckets[key][field] += 1;
    }
  };

  try {
    if (supabase) {
      const { data: leads } = await supabase
        .from('leads').select('created_at').gte('created_at', startIso).limit(10000);
      bump(leads, 'signups');
      const { data: visits } = await supabase
        .from('page_visits').select('created_at').gte('created_at', startIso).limit(50000);
      bump(visits, 'visits');
    } else {
      bump(memoryStore, 'signups');
      bump(memoryVisitDates.map((t) => ({ created_at: new Date(t).toISOString() })), 'visits');
    }
    return res.json({ series: labels.map((k) => buckets[k]) });
  } catch (err) {
    console.error('Erro na timeseries:', err);
    return res.status(500).json({ error: 'Erro ao gerar grafico.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/public-settings  -> configuracoes publicas (ex.: whatsapp suporte)
// ---------------------------------------------------------------------------
app.get('/api/public-settings', async (req, res) => {
  try {
    let support = '';
    if (supabase) {
      const { data } = await supabase.from('settings').select('value').eq('key', 'support_whatsapp').maybeSingle();
      support = data?.value || '';
    } else {
      support = memorySettings.support_whatsapp || '';
    }
    return res.json({ support_whatsapp: support });
  } catch (err) {
    return res.json({ support_whatsapp: '' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/settings  -> le configuracoes (protegido)
// PUT /api/settings  -> salva o whatsapp de suporte (protegido)
// ---------------------------------------------------------------------------
app.get('/api/settings', requireAdmin, async (req, res) => {
  try {
    let support = '';
    if (supabase) {
      const { data } = await supabase.from('settings').select('value').eq('key', 'support_whatsapp').maybeSingle();
      support = data?.value || '';
    } else {
      support = memorySettings.support_whatsapp || '';
    }
    return res.json({ support_whatsapp: support });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao ler configuracoes.' });
  }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  const raw = (req.body?.support_whatsapp ?? '').toString();
  const value = raw.replace(/\D/g, ''); // so digitos
  try {
    if (supabase) {
      const { error } = await supabase.from('settings').upsert({ key: 'support_whatsapp', value });
      if (error) throw error;
    } else {
      memorySettings.support_whatsapp = value;
    }
    return res.json({ ok: true, support_whatsapp: value });
  } catch (err) {
    console.error('Erro ao salvar configuracoes:', err);
    return res.status(500).json({ error: 'Erro ao salvar configuracoes.' });
  }
});

// ===========================================================================
// FASE 2 - VENDAS & CUSTOS (multi-tenant: autenticado por login do Supabase)
// Cada usuario ve apenas os proprios dados (escopo por user_id).
// ===========================================================================

// Middleware: exige um JWT de usuario do Supabase (Authorization: Bearer <token>)
async function requireUser(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!supabase) { req.userId = 'dev-user'; return next(); } // modo memoria (dev)
  if (!token) return res.status(401).json({ error: 'Nao autenticado.' });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Sessao invalida.' });
    req.userId = data.user.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessao invalida.' });
  }
}

// ---------- LOJAS ----------
app.get('/api/stores', requireUser, async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('stores').select('*').eq('user_id', req.userId).order('created_at');
      if (error) throw error;
      return res.json({ stores: data });
    }
    return res.json({ stores: memStores.filter((s) => s.user_id === req.userId) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar lojas.' }); }
});

app.post('/api/stores', requireUser, async (req, res) => {
  const b = req.body || {};
  const rec = {
    name: (b.name || '').trim(),
    color: (b.color || '#1d7a5f').trim(),
    cnpj: (b.cnpj || '').trim() || null,
    address: (b.address || '').trim() || null,
    marketplace: (b.marketplace || '').trim() || null,
  };
  if (!rec.name) return res.status(400).json({ error: 'Nome da empresa e obrigatorio.' });
  if (!rec.cnpj) return res.status(400).json({ error: 'CNPJ e obrigatorio.' });
  try {
    if (supabase) {
      const { data, error } = await supabase.from('stores').insert({ ...rec, user_id: req.userId }).select().single();
      if (error) throw error;
      return res.status(201).json({ store: data });
    }
    const store = { id: makeId(), ...rec, user_id: req.userId, created_at: new Date().toISOString() };
    memStores.push(store);
    return res.status(201).json({ store });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao criar empresa.' }); }
});

app.put('/api/stores/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  const patch = {};
  ['name', 'color', 'cnpj', 'address', 'marketplace'].forEach((k) => {
    if (req.body?.[k] != null) patch[k] = String(req.body[k]).trim() || null;
  });
  try {
    if (supabase) {
      const { error } = await supabase.from('stores').update(patch).eq('id', id).eq('user_id', req.userId);
      if (error) throw error;
    } else {
      const s = memStores.find((x) => x.id === id && x.user_id === req.userId);
      if (s) Object.assign(s, patch);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao atualizar loja.' }); }
});

app.delete('/api/stores/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      const { error } = await supabase.from('stores').delete().eq('id', id).eq('user_id', req.userId);
      if (error) throw error;
    } else {
      const i = memStores.findIndex((x) => x.id === id && x.user_id === req.userId);
      if (i >= 0) memStores.splice(i, 1);
      for (let j = memSales.length - 1; j >= 0; j--) if (memSales[j].store_id === id) memSales.splice(j, 1);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir loja.' }); }
});

// ---------- VENDAS ----------
const SALE_FIELDS = ['qty', 'revenue', 'fee_mp', 'freight', 'cmv', 'ads_ml', 'ads_ext', 'tax'];

function normalizeSale(body) {
  const rec = { date: body.date, store_id: body.store_id };
  for (const f of SALE_FIELDS) rec[f] = Number(body[f]) || 0;
  return rec;
}

app.get('/api/sales', requireUser, async (req, res) => {
  const month = req.query.month; // 'YYYY-MM'
  const store = req.query.store;  // opcional
  try {
    if (supabase) {
      let q = supabase.from('sales').select('*').eq('user_id', req.userId).order('date', { ascending: true });
      if (month) q = q.gte('date', `${month}-01`).lte('date', `${month}-31`);
      if (store) q = q.eq('store_id', store);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ sales: data });
    }
    let list = memSales.filter((s) => s.user_id === req.userId);
    if (month) list = list.filter((s) => s.date.startsWith(month));
    if (store) list = list.filter((s) => s.store_id === store);
    list.sort((a, b) => a.date.localeCompare(b.date));
    return res.json({ sales: list });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar vendas.' }); }
});

app.post('/api/sales', requireUser, async (req, res) => {
  const rec = normalizeSale(req.body || {});
  if (!rec.date || !rec.store_id) return res.status(400).json({ error: 'Data e loja sao obrigatorias.' });
  try {
    if (supabase) {
      const { data, error } = await supabase.from('sales').insert({ ...rec, user_id: req.userId }).select().single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Ja existe um lancamento para esta data e loja. Edite o registro existente ou escolha outra data.' });
        throw error;
      }
      return res.status(201).json({ sale: data });
    }
    if (memSales.some((s) => s.user_id === req.userId && s.date === rec.date && s.store_id === rec.store_id))
      return res.status(409).json({ error: 'Ja existe um lancamento para esta data e loja.' });
    const sale = { id: makeId(), ...rec, user_id: req.userId, created_at: new Date().toISOString() };
    memSales.push(sale);
    return res.status(201).json({ sale });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar venda.' }); }
});

app.put('/api/sales/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  const rec = normalizeSale(req.body || {});
  try {
    if (supabase) {
      const { error } = await supabase.from('sales').update(rec).eq('id', id).eq('user_id', req.userId);
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Ja existe um lancamento para esta data e loja.' });
        throw error;
      }
    } else {
      const s = memSales.find((x) => x.id === id && x.user_id === req.userId);
      if (s) Object.assign(s, rec);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao atualizar venda.' }); }
});

app.delete('/api/sales/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      const { error } = await supabase.from('sales').delete().eq('id', id).eq('user_id', req.userId);
      if (error) throw error;
    } else {
      const i = memSales.findIndex((x) => x.id === id && x.user_id === req.userId);
      if (i >= 0) memSales.splice(i, 1);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir venda.' }); }
});

// ---------- METAS ----------
app.get('/api/goals', requireUser, async (req, res) => {
  const month = req.query.month;
  try {
    if (supabase) {
      let q = supabase.from('goals').select('*').eq('user_id', req.userId);
      if (month) q = q.eq('month', month);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ goals: data });
    }
    return res.json({ goals: memGoals.filter((g) => g.user_id === req.userId && (!month || g.month === month)) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar metas.' }); }
});

app.put('/api/goals', requireUser, async (req, res) => {
  const month = (req.body?.month || '').trim();
  const store_id = req.body?.store_id || null;
  const amount = Number(req.body?.amount) || 0;
  if (!month) return res.status(400).json({ error: 'Mes e obrigatorio.' });
  try {
    if (supabase) {
      // upsert manual (delete + insert) respeitando o indice (user_id, month, store)
      let del = supabase.from('goals').delete().eq('user_id', req.userId).eq('month', month);
      del = store_id ? del.eq('store_id', store_id) : del.is('store_id', null);
      await del;
      if (amount > 0) {
        const { error } = await supabase.from('goals').insert({ month, store_id, amount, user_id: req.userId });
        if (error) throw error;
      }
    } else {
      const i = memGoals.findIndex((g) => g.user_id === req.userId && g.month === month && (g.store_id || null) === store_id);
      if (i >= 0) memGoals.splice(i, 1);
      if (amount > 0) memGoals.push({ id: makeId(), month, store_id, amount, user_id: req.userId });
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar meta.' }); }
});

// ---------- HISTORICO DE IMPORTACOES (Mercado Turbo) ----------
app.get('/api/imports', requireUser, async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('imports').select('*').eq('user_id', req.userId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return res.json({ imports: data });
    }
    return res.json({ imports: memImports.filter((i) => i.user_id === req.userId).slice().reverse() });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar importacoes.' }); }
});

app.post('/api/imports', requireUser, async (req, res) => {
  const rec = {
    store_id: req.body?.store_id || null,
    date: req.body?.date || new Date().toISOString().slice(0, 10),
    orders: Number(req.body?.orders) || 0,
    revenue: Number(req.body?.revenue) || 0,
  };
  try {
    if (supabase) {
      const { error } = await supabase.from('imports').insert({ ...rec, user_id: req.userId });
      if (error) throw error;
    } else {
      memImports.push({ id: makeId(), ...rec, user_id: req.userId, created_at: new Date().toISOString() });
    }
    return res.status(201).json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao registrar importacao.' }); }
});

// ---------- SAUDE DO SERVIDOR (painel admin) ----------
app.get('/api/health-status', requireAdmin, async (req, res) => {
  const services = [];

  // 1. Servidor (aplicacao)
  const up = process.uptime();
  services.push({
    name: 'Aplicação (API)', ok: true, status: 'Online',
    detail: `no ar há ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}min`,
  });

  // 2. Banco de dados (Supabase)
  if (supabase) {
    const t0 = Date.now();
    try {
      const { error } = await supabase.from('leads').select('id', { count: 'exact', head: true });
      if (error) throw error;
      services.push({ name: 'Banco de dados (Supabase)', ok: true, status: 'Conectado', detail: `resposta em ${Date.now() - t0}ms` });
    } catch (err) {
      services.push({ name: 'Banco de dados (Supabase)', ok: false, status: 'Falha', detail: 'sem resposta do banco' });
    }
  } else {
    services.push({ name: 'Banco de dados (Supabase)', ok: false, status: 'Não configurado', detail: 'rodando em modo memória' });
  }

  // 3. E-mail de notificacao (SMTP)
  services.push(mailer
    ? { name: 'E-mail de notificação (SMTP)', ok: true, status: 'Ativo', detail: 'notificações habilitadas' }
    : { name: 'E-mail de notificação (SMTP)', ok: false, status: 'Desativado', detail: 'SMTP não configurado' });

  // 4. Memoria
  const totalMem = os.totalmem(), freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = Math.round((usedMem / totalMem) * 100);
  const mb = (b) => Math.round(b / 1048576);
  services.push({
    name: 'Memória', ok: memPct < 90, status: memPct + '%',
    detail: `${mb(usedMem)} MB de ${mb(totalMem)} MB em uso`,
  });

  // 5. CPU (load average de 1 min / nucleos)
  const cores = os.cpus().length || 1;
  const load1 = os.loadavg()[0];
  const cpuPct = Math.min(Math.round((load1 / cores) * 100), 100);
  services.push({
    name: 'CPU', ok: cpuPct < 90, status: cpuPct + '%',
    detail: `carga ${load1.toFixed(2)} · ${cores} núcleo(s)`,
  });

  // 6. Espaco em disco
  try {
    const fsStat = await statfs('/');
    const totalDisk = fsStat.blocks * fsStat.bsize;
    const freeDisk = fsStat.bavail * fsStat.bsize;
    const usedDisk = totalDisk - freeDisk;
    const diskPct = Math.round((usedDisk / totalDisk) * 100);
    const gb = (b) => (b / 1073741824).toFixed(1);
    services.push({
      name: 'Espaço em disco', ok: diskPct < 90, status: diskPct + '%',
      detail: `${gb(usedDisk)} GB de ${gb(totalDisk)} GB em uso`,
    });
  } catch (err) {
    services.push({ name: 'Espaço em disco', ok: true, status: 'N/D', detail: 'não disponível' });
  }

  const allOk = services.every((s) => s.ok);
  res.json({ overall: allOk ? 'ok' : 'degraded', checkedAt: new Date().toISOString(), services });
});

// ===========================================================================
// FLUXO DE CAIXA + BOLETOS & DIVIDAS (integrados, por usuario)
// ===========================================================================

// Sincroniza um boleto com o Fluxo de Caixa (Conexao #1):
// remove lancamentos vinculados e, se estiver pago, cria a entrada correspondente.
async function syncBoletoToFC(userId, boleto) {
  const entry = () => ({
    user_id: userId,
    type: boleto.direction === 'receber' ? 'income' : 'expense',
    date: boleto.due_date,
    value: Number(boleto.value) || 0,
    category: boleto.category || (boleto.direction === 'receber' ? 'Recebíveis' : 'Boletos'),
    reason: `${boleto.name}${boleto.supplier ? ' — ' + boleto.supplier : ''}`,
    boleto_id: boleto.id,
    empresa: boleto.empresa || null,
    nota_fiscal: boleto.numero_nf || null,
  });
  if (supabase) {
    await supabase.from('cash_flow_entries').delete().eq('user_id', userId).eq('boleto_id', boleto.id);
    if (boleto.status === 'pago') await supabase.from('cash_flow_entries').insert(entry());
  } else {
    for (let i = memCF.length - 1; i >= 0; i--) if (memCF[i].boleto_id === boleto.id) memCF.splice(i, 1);
    if (boleto.status === 'pago') memCF.push({ id: makeId(), ...entry(), created_at: new Date().toISOString() });
  }
}

// ---------- FLUXO DE CAIXA ----------
app.get('/api/cashflow', requireUser, async (req, res) => {
  const month = req.query.month;
  try {
    if (supabase) {
      let q = supabase.from('cash_flow_entries').select('*').eq('user_id', req.userId).order('date', { ascending: true });
      if (month) q = q.gte('date', `${month}-01`).lte('date', `${month}-31`);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ entries: data });
    }
    let list = memCF.filter((e) => e.user_id === req.userId);
    if (month) list = list.filter((e) => (e.date || '').startsWith(month));
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return res.json({ entries: list });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar fluxo de caixa.' }); }
});

app.post('/api/cashflow', requireUser, async (req, res) => {
  const b = req.body || {};
  const rec = {
    type: b.type === 'income' ? 'income' : 'expense',
    date: b.date, value: Number(b.value) || 0,
    category: (b.category || '').trim() || null,
    reason: (b.reason || '').trim() || null,
    empresa: b.empresa || null, boleto_id: null, nota_fiscal: b.nota_fiscal || null,
  };
  if (!rec.date) return res.status(400).json({ error: 'Data e obrigatoria.' });
  try {
    if (supabase) {
      const { data, error } = await supabase.from('cash_flow_entries').insert({ ...rec, user_id: req.userId }).select().single();
      if (error) throw error;
      return res.status(201).json({ entry: data });
    }
    const entry = { id: makeId(), ...rec, user_id: req.userId, created_at: new Date().toISOString() };
    memCF.push(entry);
    return res.status(201).json({ entry });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar lancamento.' }); }
});

app.delete('/api/cashflow/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      // nao permite excluir lancamento vinculado a boleto (desincronizaria)
      const { data } = await supabase.from('cash_flow_entries').select('boleto_id').eq('id', id).eq('user_id', req.userId).maybeSingle();
      if (data?.boleto_id) return res.status(409).json({ error: 'Este lancamento veio de um boleto. Altere pela pagina de Boletos.' });
      const { error } = await supabase.from('cash_flow_entries').delete().eq('id', id).eq('user_id', req.userId);
      if (error) throw error;
    } else {
      const e = memCF.find((x) => x.id === id && x.user_id === req.userId);
      if (e?.boleto_id) return res.status(409).json({ error: 'Este lancamento veio de um boleto.' });
      const i = memCF.findIndex((x) => x.id === id && x.user_id === req.userId);
      if (i >= 0) memCF.splice(i, 1);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ---------- BOLETOS & DIVIDAS ----------
function normBoleto(b) {
  return {
    name: (b.name || '').trim(),
    supplier: (b.supplier || '').trim() || null,
    value: Number(b.value) || 0,
    due_date: b.due_date,
    category: (b.category || '').trim() || null,
    kind: (b.kind || 'boleto').trim() || 'boleto',
    bank: (b.bank || '').trim() || null,
    marketplace: (b.marketplace || '').trim() || null,
    direction: b.direction === 'receber' ? 'receber' : 'pagar',
    status: b.status === 'pago' ? 'pago' : 'pendente',
    empresa: b.empresa || null,
    cnpj: (b.cnpj || '').trim() || null,
    numero_nf: (b.numero_nf || '').trim() || null,
  };
}

app.get('/api/boletos', requireUser, async (req, res) => {
  const { month, direction, status } = req.query;
  try {
    if (supabase) {
      let q = supabase.from('boletos').select('*').eq('user_id', req.userId).order('due_date', { ascending: true });
      if (month) q = q.gte('due_date', `${month}-01`).lte('due_date', `${month}-31`);
      if (direction) q = q.eq('direction', direction);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ boletos: data });
    }
    let list = memBoletos.filter((x) => x.user_id === req.userId);
    if (month) list = list.filter((x) => (x.due_date || '').startsWith(month));
    if (direction) list = list.filter((x) => x.direction === direction);
    if (status) list = list.filter((x) => x.status === status);
    list.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    return res.json({ boletos: list });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar boletos.' }); }
});

app.post('/api/boletos', requireUser, async (req, res) => {
  const rec = normBoleto(req.body || {});
  if (!rec.name || !rec.due_date) return res.status(400).json({ error: 'Nome e vencimento sao obrigatorios.' });
  try {
    let saved;
    if (supabase) {
      const { data, error } = await supabase.from('boletos').insert({ ...rec, user_id: req.userId }).select().single();
      if (error) throw error;
      saved = data;
    } else {
      saved = { id: makeId(), ...rec, user_id: req.userId, created_at: new Date().toISOString() };
      memBoletos.push(saved);
    }
    if (saved.status === 'pago') await syncBoletoToFC(req.userId, saved);
    return res.status(201).json({ boleto: saved });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar boleto.' }); }
});

app.put('/api/boletos/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  const rec = normBoleto(req.body || {});
  try {
    let saved;
    if (supabase) {
      const { data, error } = await supabase.from('boletos').update(rec).eq('id', id).eq('user_id', req.userId).select().single();
      if (error) throw error;
      saved = data;
    } else {
      const b = memBoletos.find((x) => x.id === id && x.user_id === req.userId);
      if (b) Object.assign(b, rec);
      saved = b;
    }
    if (saved) await syncBoletoToFC(req.userId, saved); // ressincroniza (cria/remove no FC)
    return res.json({ ok: true, boleto: saved });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao atualizar boleto.' }); }
});

app.delete('/api/boletos/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) {
      await supabase.from('cash_flow_entries').delete().eq('user_id', req.userId).eq('boleto_id', id);
      const { error } = await supabase.from('boletos').delete().eq('id', id).eq('user_id', req.userId);
      if (error) throw error;
    } else {
      for (let i = memCF.length - 1; i >= 0; i--) if (memCF[i].boleto_id === id) memCF.splice(i, 1);
      const i = memBoletos.findIndex((x) => x.id === id && x.user_id === req.userId);
      if (i >= 0) memBoletos.splice(i, 1);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir boleto.' }); }
});

// ---------- LISTAS (fornecedores, categorias) ----------
app.get('/api/lists', requireUser, async (req, res) => {
  const type = req.query.type;
  try {
    if (supabase) {
      let q = supabase.from('lists').select('*').eq('user_id', req.userId).order('name');
      if (type) q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ items: data });
    }
    return res.json({ items: memLists.filter((l) => l.user_id === req.userId && (!type || l.type === type)) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar.' }); }
});

app.post('/api/lists', requireUser, async (req, res) => {
  const type = (req.body?.type || '').trim();
  const name = (req.body?.name || '').trim();
  if (!type || !name) return res.status(400).json({ error: 'Tipo e nome sao obrigatorios.' });
  try {
    if (supabase) {
      const { data, error } = await supabase.from('lists').insert({ type, name, user_id: req.userId }).select().single();
      if (error) throw error;
      return res.status(201).json({ item: data });
    }
    const item = { id: makeId(), type, name, user_id: req.userId };
    memLists.push(item);
    return res.status(201).json({ item });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao cadastrar.' }); }
});

app.delete('/api/lists/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) { const { error } = await supabase.from('lists').delete().eq('id', id).eq('user_id', req.userId); if (error) throw error; }
    else { const i = memLists.findIndex((l) => l.id === id && l.user_id === req.userId); if (i >= 0) memLists.splice(i, 1); }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir.' }); }
});

// ===========================================================================
// DESPESAS (custos fixos e operacionais) -> alimenta DRE e Ponto de Equilibrio
// ===========================================================================
function normExpense(b) {
  return {
    date: b.date || new Date().toISOString().slice(0, 10),
    description: (b.description || '').trim(),
    category: (b.category || '').trim() || null,
    type: b.type === 'operational' ? 'operational' : 'fixed',
    value: Number(b.value) || 0,
    recurring: !!b.recurring,
  };
}

app.get('/api/expenses', requireUser, async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('expenses').select('*').eq('user_id', req.userId).order('date', { ascending: false });
      if (error) throw error;
      return res.json({ expenses: data });
    }
    return res.json({ expenses: memExpenses.filter((e) => e.user_id === req.userId) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar despesas.' }); }
});

app.post('/api/expenses', requireUser, async (req, res) => {
  const rec = normExpense(req.body || {});
  if (!rec.description || rec.value <= 0) return res.status(400).json({ error: 'Descricao e valor sao obrigatorios.' });
  try {
    if (supabase) { const { data, error } = await supabase.from('expenses').insert({ ...rec, user_id: req.userId }).select().single(); if (error) throw error; return res.status(201).json({ expense: data }); }
    const exp = { id: makeId(), ...rec, user_id: req.userId, created_at: new Date().toISOString() }; memExpenses.push(exp); return res.status(201).json({ expense: exp });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar despesa.' }); }
});

app.put('/api/expenses/:id', requireUser, async (req, res) => {
  const { id } = req.params; const rec = normExpense(req.body || {});
  try {
    if (supabase) { const { error } = await supabase.from('expenses').update(rec).eq('id', id).eq('user_id', req.userId); if (error) throw error; }
    else { const e = memExpenses.find((x) => x.id === id && x.user_id === req.userId); if (e) Object.assign(e, rec); }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao atualizar despesa.' }); }
});

app.delete('/api/expenses/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) { const { error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', req.userId); if (error) throw error; }
    else { const i = memExpenses.findIndex((x) => x.id === id && x.user_id === req.userId); if (i >= 0) memExpenses.splice(i, 1); }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir despesa.' }); }
});

// ===========================================================================
// CARTAO DE CREDITO (cartoes, parcelas, pagar fatura -> agrupa por empresa)
// ===========================================================================
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---------- CARTOES ----------
app.get('/api/cards', requireUser, async (req, res) => {
  try {
    if (supabase) { const { data, error } = await supabase.from('cartoes').select('*').eq('user_id', req.userId).order('name'); if (error) throw error; return res.json({ cards: data }); }
    return res.json({ cards: memCards.filter((c) => c.user_id === req.userId) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar cartoes.' }); }
});

app.post('/api/cards', requireUser, async (req, res) => {
  const b = req.body || {};
  const rec = { name: (b.name || '').trim(), closing_day: Number(b.closing_day) || 1, due_day: Number(b.due_day) || 10, card_limit: Number(b.card_limit) || 0, color: (b.color || '#6b46c1').trim() };
  if (!rec.name) return res.status(400).json({ error: 'Nome do cartao e obrigatorio.' });
  try {
    if (supabase) { const { data, error } = await supabase.from('cartoes').insert({ ...rec, user_id: req.userId }).select().single(); if (error) throw error; return res.status(201).json({ card: data }); }
    const card = { id: makeId(), ...rec, user_id: req.userId }; memCards.push(card); return res.status(201).json({ card });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao criar cartao.' }); }
});

app.put('/api/cards/:id', requireUser, async (req, res) => {
  const { id } = req.params; const patch = {};
  ['name', 'color'].forEach((k) => { if (req.body?.[k] != null) patch[k] = String(req.body[k]).trim(); });
  ['closing_day', 'due_day', 'card_limit'].forEach((k) => { if (req.body?.[k] != null) patch[k] = Number(req.body[k]) || 0; });
  try {
    if (supabase) { const { error } = await supabase.from('cartoes').update(patch).eq('id', id).eq('user_id', req.userId); if (error) throw error; }
    else { const c = memCards.find((x) => x.id === id && x.user_id === req.userId); if (c) Object.assign(c, patch); }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao atualizar cartao.' }); }
});

app.delete('/api/cards/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) { await supabase.from('parcelas_cartao').delete().eq('user_id', req.userId).eq('cartao_id', id); const { error } = await supabase.from('cartoes').delete().eq('id', id).eq('user_id', req.userId); if (error) throw error; }
    else { for (let i = memParcelas.length - 1; i >= 0; i--) if (memParcelas[i].cartao_id === id) memParcelas.splice(i, 1); const i = memCards.findIndex((x) => x.id === id && x.user_id === req.userId); if (i >= 0) memCards.splice(i, 1); }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir cartao.' }); }
});

// ---------- PARCELAS ----------
app.get('/api/parcelas', requireUser, async (req, res) => {
  const { cartao, fatura_mes, status } = req.query;
  try {
    if (supabase) {
      let q = supabase.from('parcelas_cartao').select('*').eq('user_id', req.userId).order('fatura_mes');
      if (cartao) q = q.eq('cartao_id', cartao);
      if (fatura_mes) q = q.eq('fatura_mes', fatura_mes);
      if (status) q = q.eq('status', status);
      const { data, error } = await q; if (error) throw error; return res.json({ parcelas: data });
    }
    let list = memParcelas.filter((p) => p.user_id === req.userId);
    if (cartao) list = list.filter((p) => p.cartao_id === cartao);
    if (fatura_mes) list = list.filter((p) => p.fatura_mes === fatura_mes);
    if (status) list = list.filter((p) => p.status === status);
    return res.json({ parcelas: list });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar parcelas.' }); }
});

// Cria uma compra parcelada -> gera N parcelas em faturas consecutivas
app.post('/api/parcelas/purchase', requireUser, async (req, res) => {
  const b = req.body || {};
  const cartao_id = b.cartao_id;
  const description = (b.description || '').trim();
  const empresa = (b.empresa || '').trim() || null;
  const total = Number(b.value) || 0;
  const n = Math.max(1, Number(b.installments) || 1);
  const purchase_date = b.purchase_date || new Date().toISOString().slice(0, 10);
  if (!cartao_id || !description || total <= 0) return res.status(400).json({ error: 'Cartao, descricao e valor sao obrigatorios.' });
  try {
    // busca o cartao para o dia de fechamento
    let closing = 1;
    if (supabase) { const { data } = await supabase.from('cartoes').select('closing_day').eq('id', cartao_id).eq('user_id', req.userId).maybeSingle(); closing = data?.closing_day || 1; }
    else { closing = (memCards.find((c) => c.id === cartao_id) || {}).closing_day || 1; }
    const pDay = Number(purchase_date.slice(8, 10));
    const pMonth = purchase_date.slice(0, 7);
    const firstFatura = pDay <= closing ? pMonth : addMonths(pMonth, 1);
    const valor = Math.round((total / n) * 100) / 100;
    const parcelas = [];
    for (let i = 0; i < n; i++) {
      parcelas.push({
        cartao_id, description, empresa, value: valor,
        installment_no: i + 1, installments_total: n, purchase_date,
        fatura_mes: addMonths(firstFatura, i), status: 'pendente', user_id: req.userId,
      });
    }
    if (supabase) { const { error } = await supabase.from('parcelas_cartao').insert(parcelas); if (error) throw error; }
    else { parcelas.forEach((p) => memParcelas.push({ id: makeId(), ...p, created_at: new Date().toISOString() })); }
    return res.status(201).json({ ok: true, count: n });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao lancar compra.' }); }
});

app.delete('/api/parcelas/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  try {
    if (supabase) { const { error } = await supabase.from('parcelas_cartao').delete().eq('id', id).eq('user_id', req.userId); if (error) throw error; }
    else { const i = memParcelas.findIndex((p) => p.id === id && p.user_id === req.userId); if (i >= 0) memParcelas.splice(i, 1); }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir parcela.' }); }
});

// ---------- FATURAS (computadas) ----------
app.get('/api/faturas', requireUser, async (req, res) => {
  try {
    let parcelas, cards;
    if (supabase) {
      const [p, c] = await Promise.all([
        supabase.from('parcelas_cartao').select('*').eq('user_id', req.userId).eq('status', 'pendente'),
        supabase.from('cartoes').select('*').eq('user_id', req.userId),
      ]);
      parcelas = p.data || []; cards = c.data || [];
    } else {
      parcelas = memParcelas.filter((x) => x.user_id === req.userId && x.status === 'pendente');
      cards = memCards.filter((x) => x.user_id === req.userId);
    }
    const cardOf = (id) => cards.find((c) => c.id === id) || {};
    const groups = {};
    for (const p of parcelas) {
      const key = `${p.cartao_id}|${p.fatura_mes}`;
      if (!groups[key]) {
        const card = cardOf(p.cartao_id);
        const dueDay = Math.min(card.due_day || 10, 28);
        groups[key] = {
          cartao_id: p.cartao_id, cartao: card.name || 'Cartão', fatura_mes: p.fatura_mes,
          due_day: card.due_day || 10, due_date: `${p.fatura_mes}-${String(dueDay).padStart(2, '0')}`,
          total: 0, count: 0,
        };
      }
      groups[key].total += Number(p.value); groups[key].count += 1;
    }
    const faturas = Object.values(groups).sort((a, b) => a.due_date.localeCompare(b.due_date));
    return res.json({ faturas });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao gerar faturas.' }); }
});

// PAGAR FATURA: marca parcelas pagas, registra pagamento e agrupa por empresa no FC
app.post('/api/faturas/pay', requireUser, async (req, res) => {
  const cartao_id = req.body?.cartao_id;
  const fatura_mes = req.body?.fatura_mes;
  const data_pagamento = req.body?.data_pagamento || new Date().toISOString().slice(0, 10);
  if (!cartao_id || !fatura_mes) return res.status(400).json({ error: 'Cartao e mes da fatura sao obrigatorios.' });
  try {
    // busca parcelas pendentes da fatura
    let parcelas, cardName = 'Cartão';
    if (supabase) {
      const { data } = await supabase.from('parcelas_cartao').select('*').eq('user_id', req.userId).eq('cartao_id', cartao_id).eq('fatura_mes', fatura_mes).eq('status', 'pendente');
      parcelas = data || [];
      const { data: c } = await supabase.from('cartoes').select('name').eq('id', cartao_id).maybeSingle();
      cardName = c?.name || 'Cartão';
    } else {
      parcelas = memParcelas.filter((p) => p.user_id === req.userId && p.cartao_id === cartao_id && p.fatura_mes === fatura_mes && p.status === 'pendente');
      cardName = (memCards.find((c) => c.id === cartao_id) || {}).name || 'Cartão';
    }
    if (parcelas.length === 0) return res.status(404).json({ error: 'Nenhuma parcela pendente nesta fatura.' });

    // 1. marca pagas
    if (supabase) await supabase.from('parcelas_cartao').update({ status: 'pago' }).eq('user_id', req.userId).eq('cartao_id', cartao_id).eq('fatura_mes', fatura_mes).eq('status', 'pendente');
    else parcelas.forEach((p) => { p.status = 'pago'; });

    const total = parcelas.reduce((a, p) => a + Number(p.value), 0);

    // 2. registra pagamento
    const pagto = { user_id: req.userId, cartao_id, fatura_mes, data_pagamento, valor_pago: total, parcelas_count: parcelas.length };
    if (supabase) await supabase.from('fatura_pagamentos').insert(pagto);
    else memFaturaPagtos.push({ id: makeId(), ...pagto, created_at: new Date().toISOString() });

    // 3. agrupa por empresa -> 1 lancamento por empresa no FC
    const empGroups = {};
    for (const p of parcelas) { const emp = (p.empresa || '').trim(); (empGroups[emp] = empGroups[emp] || { valor: 0, count: 0 }); empGroups[emp].valor += Number(p.value); empGroups[emp].count += 1; }
    const [y, m] = fatura_mes.split('-'); const mesLabel = `${m}/${y}`;
    const entries = Object.entries(empGroups).map(([emp, g]) => ({
      user_id: req.userId, type: 'expense', date: data_pagamento, value: g.valor,
      category: 'Cartão de Crédito',
      reason: emp ? `Fatura ${cardName} — ${emp} — ${mesLabel}` : `Fatura ${cardName} — ${mesLabel}`,
      empresa: emp || null, boleto_id: null, nota_fiscal: null,
    }));
    if (supabase) await supabase.from('cash_flow_entries').insert(entries);
    else entries.forEach((e) => memCF.push({ id: makeId(), ...e, created_at: new Date().toISOString() }));

    return res.json({ ok: true, total, parcelas: parcelas.length, lancamentos: entries.length });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao pagar fatura.' }); }
});

app.get('/api/fatura-pagamentos', requireUser, async (req, res) => {
  try {
    if (supabase) { const { data, error } = await supabase.from('fatura_pagamentos').select('*').eq('user_id', req.userId).order('data_pagamento', { ascending: false }).limit(100); if (error) throw error; return res.json({ pagamentos: data }); }
    return res.json({ pagamentos: memFaturaPagtos.filter((p) => p.user_id === req.userId).slice().reverse() });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar pagamentos.' }); }
});

// ===========================================================================
// ALERTA DIARIO DE BOLETOS POR E-MAIL (Resend)
// ===========================================================================
// Envia e-mail: usa o SMTP ja configurado (Gmail/nodemailer) e, se nao houver,
// cai para a API do Resend (RESEND_API_KEY). Assim reaproveita o que ja existe.
async function resendSend(to, subject, html) {
  // 1) SMTP existente (mesmo usado nas notificacoes de lead)
  const key = process.env.RESEND_API_KEY;
  // Prefere a API do Resend quando a chave existe (remetente do dominio verificado)
  if (mailer && !key) {
    try {
      await mailer.sendMail({ from: MAIL_FROM, to, subject, html });
      return true;
    } catch (err) { console.error('SMTP erro (alerta boletos):', err.message); }
  }
  if (!key) { console.warn('[AVISO] Sem SMTP e sem RESEND_API_KEY — alerta de boletos nao enviado.'); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
    });
    if (!res.ok) { console.error('Resend erro:', await res.text()); return false; }
    return true;
  } catch (err) { console.error('Resend fetch erro:', err.message); return false; }
}

// Faturas de cartao pendentes (para incluir no alerta)
async function getFaturas(userId) {
  let parcelas, cards;
  if (supabase) {
    const [p, c] = await Promise.all([
      supabase.from('parcelas_cartao').select('*').eq('user_id', userId).eq('status', 'pendente'),
      supabase.from('cartoes').select('*').eq('user_id', userId),
    ]);
    parcelas = p.data || []; cards = c.data || [];
  } else {
    parcelas = memParcelas.filter((x) => x.user_id === userId && x.status === 'pendente');
    cards = memCards.filter((x) => x.user_id === userId);
  }
  const cardOf = (id) => cards.find((c) => c.id === id) || {};
  const groups = {};
  for (const p of parcelas) {
    const key = `${p.cartao_id}|${p.fatura_mes}`;
    if (!groups[key]) { const card = cardOf(p.cartao_id); const dd = Math.min(card.due_day || 10, 28); groups[key] = { name: `Fatura ${card.name || 'Cartão'}`, kind: 'cartao', value: 0, due_date: `${p.fatura_mes}-${String(dd).padStart(2, '0')}` }; }
    groups[key].value += Number(p.value);
  }
  return Object.values(groups);
}

function digestHtml(nomeHoje, hoje, amanha, prox7) {
  const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmt = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}`; };
  const list = (arr) => arr.length
    ? '<ul style="margin:6px 0 14px;padding-left:18px">' + arr.map((b) => `<li>${fmt(b.due_date)} — <b>${b.name}</b>${b.empresa ? ' (' + b.empresa + ')' : ''}: ${money(b.value)}</li>`).join('') + '</ul>'
    : '<p style="color:#6b7686;margin:6px 0 14px">Nada.</p>';
  const totHoje = hoje.reduce((a, b) => a + (+b.value), 0);
  const totAmanha = amanha.reduce((a, b) => a + (+b.value), 0);
  const tot7 = prox7.reduce((a, b) => a + (+b.value), 0);
  const logoUrl = (process.env.PUBLIC_URL || 'https://app.financeecom.com.br') + '/img/email-logo.png';
  return `<div style="font-family:system-ui,Arial,sans-serif;color:#1c2434;max-width:560px">
    <div style="background:#0a1428;border-radius:12px;padding:14px;text-align:center;margin-bottom:18px">
      <img src="${logoUrl}" alt="FinanceEcom Free" width="280" style="max-width:280px;height:auto;display:inline-block" />
    </div>
    <h2 style="color:#1e6fff">Contas do dia</h2>
    <p>Olá! Aqui está o resumo das suas contas a pagar.</p>
    <h3>📌 Vencem HOJE (${fmt(nomeHoje)}) — ${money(totHoje)}</h3>${list(hoje)}
    <h3>⏭️ Vencem AMANHÃ — ${money(totAmanha)}</h3>${list(amanha)}
    <h3>📅 Próximos 7 dias — total ${money(tot7)}</h3>${list(prox7)}
    <hr style="border:none;border-top:1px solid #e2e6ee;margin:18px 0">
    <p style="color:#6b7686;font-size:13px">Inclui boletos, faturas de cartão e todas as categorias. Enviado automaticamente pelo FinanceEcom Free.</p>
  </div>`;
}

async function sendBoletoDigest(userId, email) {
  const today = new Date().toLocaleDateString('en-CA');
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
  const in7 = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA');
  let boletos;
  if (supabase) { const { data } = await supabase.from('boletos').select('*').eq('user_id', userId).eq('direction', 'pagar').eq('status', 'pendente'); boletos = data || []; }
  else boletos = memBoletos.filter((b) => b.user_id === userId && b.direction === 'pagar' && b.status === 'pendente');
  const faturas = await getFaturas(userId);
  const all = [...boletos.map((b) => ({ name: b.name, empresa: b.empresa, value: b.value, due_date: b.due_date })), ...faturas];
  const hoje = all.filter((b) => b.due_date === today);
  const amanha = all.filter((b) => b.due_date === tomorrow);
  const prox7 = all.filter((b) => b.due_date >= today && b.due_date <= in7).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return resendSend(email, 'FinanceEcom Free — Contas do dia', digestHtml(today, hoje, amanha, prox7));
}

app.get('/api/boleto-alert', requireUser, async (req, res) => {
  try {
    let a;
    if (supabase) { const { data } = await supabase.from('boleto_alerts').select('*').eq('user_id', req.userId).maybeSingle(); a = data; }
    else a = memAlerts.find((x) => x.user_id === req.userId);
    return res.json({ alert: a || { email: '', hour: 8, enabled: false } });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao ler alerta.' }); }
});

app.put('/api/boleto-alert', requireUser, async (req, res) => {
  const email = (req.body?.email || '').trim();
  const hour = Math.min(Math.max(Number(req.body?.hour) || 8, 0), 23);
  const enabled = !!req.body?.enabled;
  if (enabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail invalido.' });
  try {
    if (supabase) {
      await supabase.from('boleto_alerts').delete().eq('user_id', req.userId);
      await supabase.from('boleto_alerts').insert({ user_id: req.userId, email, hour, enabled });
    } else {
      const i = memAlerts.findIndex((x) => x.user_id === req.userId);
      if (i >= 0) memAlerts.splice(i, 1);
      memAlerts.push({ user_id: req.userId, email, hour, enabled });
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar alerta.' }); }
});

// Enviar teste agora
app.post('/api/boleto-alert/test', limitTest, requireUser, async (req, res) => {
  const email = (req.body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail invalido.' });
  const ok = await sendBoletoDigest(req.userId, email);
  return ok ? res.json({ ok: true }) : res.status(500).json({ error: 'Falha ao enviar (verifique RESEND_API_KEY no servidor).' });
});

// Agendador: a cada 10 min verifica se e a hora configurada (horario de Brasilia)
const alertsSentKey = new Set();
async function runAlertScheduler() {
  try {
    const nowBR = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
    // nowBR ex.: "08/03/2026, 14" -> extrai hora e data
    const hourBR = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).replace(/\D/g, ''));
    const dateBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let alerts;
    if (supabase) { const { data } = await supabase.from('boleto_alerts').select('*').eq('enabled', true); alerts = data || []; }
    else alerts = memAlerts.filter((a) => a.enabled);
    for (const a of alerts) {
      if (Number(a.hour) !== hourBR) continue;
      const key = `${a.user_id}|${dateBR}|${hourBR}`;
      if (alertsSentKey.has(key)) continue;
      alertsSentKey.add(key);
      await sendBoletoDigest(a.user_id, a.email);
      console.log(`[ALERTA] Boletos enviados para ${a.email}`);
    }
  } catch (err) { console.error('Scheduler erro:', err.message); }
}
setInterval(runAlertScheduler, 10 * 60 * 1000);

// ---------- FLUXO DE CAIXA ANUAL (manual / extrato bancario) ----------
app.get('/api/manual-cashflow', requireUser, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  try {
    if (supabase) {
      const { data, error } = await supabase.from('manual_cashflow').select('*').eq('user_id', req.userId).eq('year', year);
      if (error) throw error;
      return res.json({ rows: data });
    }
    return res.json({ rows: memManual.filter((m) => m.user_id === req.userId && m.year === year) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar.' }); }
});

app.put('/api/manual-cashflow', requireUser, async (req, res) => {
  const year = Number(req.body?.year); const month = Number(req.body?.month);
  if (!year || !month) return res.status(400).json({ error: 'Ano e mes sao obrigatorios.' });
  const rec = { year, month, day1: Number(req.body?.day1) || 0, bank_in: Number(req.body?.bank_in) || 0, bank_out: Number(req.body?.bank_out) || 0 };
  try {
    if (supabase) {
      await supabase.from('manual_cashflow').delete().eq('user_id', req.userId).eq('year', year).eq('month', month);
      const { error } = await supabase.from('manual_cashflow').insert({ ...rec, user_id: req.userId });
      if (error) throw error;
    } else {
      const i = memManual.findIndex((m) => m.user_id === req.userId && m.year === year && m.month === month);
      if (i >= 0) memManual.splice(i, 1);
      memManual.push({ id: makeId(), ...rec, user_id: req.userId });
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar.' }); }
});

// ===========================================================================
// CONFIG DE IA + TOKEN DA EXTENSAO (por cliente) — Fase 1
// ===========================================================================
async function getAiSettings(userId) {
  if (supabase) {
    const { data } = await supabase.from('user_ai_settings').select('*').eq('user_id', userId).maybeSingle();
    return data || null;
  }
  return memAiSettings.find((s) => s.user_id === userId) || null;
}

async function saveAiSettings(userId, patch) {
  if (supabase) {
    await supabase.from('user_ai_settings').delete().eq('user_id', userId);
    const { data, error } = await supabase.from('user_ai_settings').insert({ user_id: userId, ...patch }).select().single();
    if (error) throw error;
    return data;
  }
  const i = memAiSettings.findIndex((s) => s.user_id === userId);
  const rec = { user_id: userId, ...(i >= 0 ? memAiSettings[i] : {}), ...patch, updated_at: new Date().toISOString() };
  if (i >= 0) memAiSettings[i] = rec; else memAiSettings.push(rec);
  return rec;
}

// Retorna as chaves da IA em texto puro (uso interno na Fase 2). Nunca expor via HTTP.
async function getDecryptedKeys(userId) {
  const s = await getAiSettings(userId);
  if (!s) return { provider: 'anthropic', anthropic: null, openai: null };
  return {
    provider: s.ai_provider || 'anthropic',
    anthropic: decryptSecret(s.anthropic_key),
    openai: decryptSecret(s.openai_key),
  };
}

// GET: estado das configuracoes (mascarado — nunca devolve a chave real)
app.get('/api/ai-settings', requireUser, async (req, res) => {
  try {
    const s = await getAiSettings(req.userId);
    let ext = s?.ext_token;
    if (!ext) { // gera token da extensao na primeira visita
      ext = 'fec_' + crypto.randomBytes(20).toString('hex');
      await saveAiSettings(req.userId, { ...(s || {}), ext_token: ext, ai_provider: s?.ai_provider || 'anthropic' });
    }
    return res.json({
      provider: s?.ai_provider || 'anthropic',
      anthropic_mask: maskKey(decryptSecret(s?.anthropic_key)),
      openai_mask: maskKey(decryptSecret(s?.openai_key)),
      has_anthropic: !!decryptSecret(s?.anthropic_key),
      has_openai: !!decryptSecret(s?.openai_key),
      ext_token: ext,
    });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao carregar configuracoes.' }); }
});

// PUT: salva provider e/ou chaves. String vazia limpa a chave; ausente mantem.
app.put('/api/ai-settings', requireUser, async (req, res) => {
  const b = req.body || {};
  try {
    const cur = await getAiSettings(req.userId) || {};
    const patch = {
      ai_provider: (b.provider === 'openai' ? 'openai' : 'anthropic'),
      ext_token: cur.ext_token || ('fec_' + crypto.randomBytes(20).toString('hex')),
      anthropic_key: cur.anthropic_key || null,
      openai_key: cur.openai_key || null,
    };
    if (b.anthropic_key !== undefined) patch.anthropic_key = b.anthropic_key ? encryptSecret(String(b.anthropic_key).trim()) : null;
    if (b.openai_key !== undefined) patch.openai_key = b.openai_key ? encryptSecret(String(b.openai_key).trim()) : null;
    await saveAiSettings(req.userId, patch);
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar configuracoes.' }); }
});

// Regenera o token da extensao (invalida o antigo)
app.post('/api/ai-settings/regen-token', requireUser, async (req, res) => {
  try {
    const cur = await getAiSettings(req.userId) || {};
    const ext = 'fec_' + crypto.randomBytes(20).toString('hex');
    await saveAiSettings(req.userId, { ...cur, ext_token: ext, ai_provider: cur.ai_provider || 'anthropic' });
    return res.json({ ext_token: ext });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao regenerar token.' }); }
});

// ===========================================================================
// ANALISE DE PRODUTOS — CRUD (Fase 1). Coleta/extensao vem nas Fases 3-4.
// ===========================================================================
const ANALISE_MAX_PRODUCTS = 10;
const ANALISE_MAX_ADS = 10;

async function activeProductId(userId) {
  if (supabase) {
    const { data } = await supabase.from('analise_active_collection').select('product_id').eq('user_id', userId).maybeSingle();
    return data?.product_id || null;
  }
  return (memAnaliseActive.find((a) => a.user_id === userId) || {}).product_id || null;
}

async function setActiveProduct(userId, productId) {
  if (supabase) {
    await supabase.from('analise_active_collection').delete().eq('user_id', userId);
    if (productId != null) await supabase.from('analise_active_collection').insert({ user_id: userId, product_id: productId });
  } else {
    const i = memAnaliseActive.findIndex((a) => a.user_id === userId);
    if (i >= 0) memAnaliseActive.splice(i, 1);
    if (productId != null) memAnaliseActive.push({ user_id: userId, product_id: productId });
  }
}

// Lista produtos + qual esta ativo
app.get('/api/analise/products', requireUser, async (req, res) => {
  try {
    let products;
    if (supabase) {
      const { data, error } = await supabase.from('analise_products').select('*').eq('user_id', req.userId).order('created_at', { ascending: false });
      if (error) throw error;
      products = data;
    } else {
      products = memAnaliseProducts.filter((p) => p.user_id === req.userId);
    }
    return res.json({ products, active_id: await activeProductId(req.userId) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao listar produtos.' }); }
});

// Detalhe do produto + concorrentes
app.get('/api/analise/products/:id', requireUser, async (req, res) => {
  const id = req.params.id;
  try {
    let product, ads;
    if (supabase) {
      const { data: p } = await supabase.from('analise_products').select('*').eq('id', id).eq('user_id', req.userId).maybeSingle();
      if (!p) return res.status(404).json({ error: 'Produto nao encontrado.' });
      const { data: a } = await supabase.from('analise_product_ads').select('*').eq('product_id', id).eq('user_id', req.userId).order('created_at');
      product = p; ads = a || [];
    } else {
      product = memAnaliseProducts.find((p) => String(p.id) === String(id) && p.user_id === req.userId);
      if (!product) return res.status(404).json({ error: 'Produto nao encontrado.' });
      ads = memAnaliseAds.filter((a) => String(a.product_id) === String(id) && a.user_id === req.userId);
    }
    return res.json({ product, ads, active_id: await activeProductId(req.userId) });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao carregar produto.' }); }
});

const PROD_FIELDS = ['produto', 'fornecedor', 'preco_compra', 'taxa_mp', 'imposto', 'frete_entrada', 'embalagem', 'observacoes'];
function cleanProduct(b) {
  const r = {};
  PROD_FIELDS.forEach((k) => {
    if (b[k] === undefined) return;
    if (['produto', 'fornecedor', 'observacoes'].includes(k)) r[k] = String(b[k] || '').trim() || null;
    else r[k] = Number(b[k]) || 0;
  });
  return r;
}

app.post('/api/analise/products', requireUser, async (req, res) => {
  const rec = cleanProduct(req.body || {});
  if (!rec.produto) return res.status(400).json({ error: 'Nome do produto e obrigatorio.' });
  try {
    let count;
    if (supabase) {
      const { count: c } = await supabase.from('analise_products').select('id', { count: 'exact', head: true }).eq('user_id', req.userId);
      count = c || 0;
    } else count = memAnaliseProducts.filter((p) => p.user_id === req.userId).length;
    if (count >= ANALISE_MAX_PRODUCTS) return res.status(409).json({ error: `Limite de ${ANALISE_MAX_PRODUCTS} produtos atingido.` });
    if (supabase) {
      const { data, error } = await supabase.from('analise_products').insert({ ...rec, user_id: req.userId }).select().single();
      if (error) throw error;
      return res.status(201).json({ product: data });
    }
    const product = { id: makeId(), ...rec, user_id: req.userId, status: 'ativo', created_at: new Date().toISOString() };
    memAnaliseProducts.push(product);
    return res.status(201).json({ product });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao criar produto.' }); }
});

app.put('/api/analise/products/:id', requireUser, async (req, res) => {
  const id = req.params.id;
  const patch = cleanProduct(req.body || {});
  patch.updated_at = new Date().toISOString();
  try {
    if (supabase) {
      const { error } = await supabase.from('analise_products').update(patch).eq('id', id).eq('user_id', req.userId);
      if (error) throw error;
    } else {
      const p = memAnaliseProducts.find((x) => String(x.id) === String(id) && x.user_id === req.userId);
      if (p) Object.assign(p, patch);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao editar produto.' }); }
});

app.delete('/api/analise/products/:id', requireUser, async (req, res) => {
  const id = req.params.id;
  try {
    if (supabase) {
      await supabase.from('analise_products').delete().eq('id', id).eq('user_id', req.userId);
    } else {
      for (let i = memAnaliseAds.length - 1; i >= 0; i--) if (String(memAnaliseAds[i].product_id) === String(id)) memAnaliseAds.splice(i, 1);
      const i = memAnaliseProducts.findIndex((x) => String(x.id) === String(id) && x.user_id === req.userId);
      if (i >= 0) memAnaliseProducts.splice(i, 1);
    }
    if (String(await activeProductId(req.userId)) === String(id)) await setActiveProduct(req.userId, null);
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir produto.' }); }
});

// Marca como produto ativo de coleta (e religa monitorar dos concorrentes dele)
app.post('/api/analise/products/:id/activate', requireUser, async (req, res) => {
  const id = req.params.id;
  try {
    await setActiveProduct(req.userId, id);
    if (supabase) await supabase.from('analise_product_ads').update({ monitorar: true }).eq('product_id', id).eq('user_id', req.userId);
    else memAnaliseAds.forEach((a) => { if (String(a.product_id) === String(id)) a.monitorar = true; });
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao ativar coleta.' }); }
});

// Finaliza a coleta (desliga monitorar dos concorrentes)
app.post('/api/analise/products/:id/finalize', requireUser, async (req, res) => {
  const id = req.params.id;
  try {
    if (String(await activeProductId(req.userId)) === String(id)) await setActiveProduct(req.userId, null);
    if (supabase) await supabase.from('analise_product_ads').update({ monitorar: false }).eq('product_id', id).eq('user_id', req.userId);
    else memAnaliseAds.forEach((a) => { if (String(a.product_id) === String(id)) a.monitorar = false; });
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao finalizar coleta.' }); }
});

// Concorrente manual (add). Fase 3-4 fara via extensao.
const AD_FIELDS = ['ml_id', 'link', 'titulo', 'preco', 'preco_original', 'nota', 'vendas', 'vendedor', 'cidade', 'estado', 'reputacao', 'observacoes', 'descricao', 'comentarios_texto', 'data_criacao'];
app.post('/api/analise/products/:id/ads', requireUser, async (req, res) => {
  const id = req.params.id; const b = req.body || {};
  const rec = {};
  AD_FIELDS.forEach((k) => {
    if (b[k] === undefined) return;
    if (['preco', 'preco_original', 'nota'].includes(k)) rec[k] = Number(b[k]) || 0;
    else rec[k] = String(b[k] || '').trim() || null;
  });
  // campos ricos: imagens, ficha tecnica, Full/Flex
  if (b.is_full !== undefined) rec.is_full = !!b.is_full;
  if (b.is_flex !== undefined) rec.is_flex = !!b.is_flex;
  if (b.foto) rec.fotos = [String(b.foto).trim()];
  else if (Array.isArray(b.fotos)) rec.fotos = b.fotos;
  if (b.ficha) rec.highlights = String(b.ficha).split('\n').map((s) => s.trim()).filter(Boolean);
  else if (Array.isArray(b.highlights)) rec.highlights = b.highlights;
  if (!rec.titulo && !rec.ml_id) return res.status(400).json({ error: 'Informe ao menos o titulo ou o MLB do concorrente.' });
  try {
    let count;
    if (supabase) {
      const { count: c } = await supabase.from('analise_product_ads').select('id', { count: 'exact', head: true }).eq('product_id', id).eq('user_id', req.userId);
      count = c || 0;
    } else count = memAnaliseAds.filter((a) => String(a.product_id) === String(id) && a.user_id === req.userId).length;
    if (count >= ANALISE_MAX_ADS) return res.status(409).json({ error: `Limite de ${ANALISE_MAX_ADS} concorrentes por produto.` });
    if (supabase) {
      const { data, error } = await supabase.from('analise_product_ads').insert({ ...rec, product_id: id, user_id: req.userId }).select().single();
      if (error) throw error;
      return res.status(201).json({ ad: data });
    }
    const ad = { id: makeId(), ...rec, product_id: id, user_id: req.userId, monitorar: true, created_at: new Date().toISOString() };
    memAnaliseAds.push(ad);
    return res.status(201).json({ ad });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao adicionar concorrente.' }); }
});

// Edita campos do concorrente à mão (ex.: colar avaliações, corrigir dados)
app.put('/api/analise/ads/:adId', requireUser, async (req, res) => {
  const adId = req.params.adId; const b = req.body || {};
  const patch = {};
  ['titulo', 'link', 'vendedor', 'cidade', 'estado', 'reputacao', 'vendas', 'descricao', 'comentarios_texto', 'observacoes', 'aval_dist', 'data_criacao'].forEach((k) => {
    if (b[k] !== undefined) patch[k] = String(b[k] || '').trim() || null;
  });
  ['preco', 'preco_original', 'nota', 'comentarios'].forEach((k) => { if (b[k] !== undefined) patch[k] = Number(b[k]) || 0; });
  if (b.is_full !== undefined) patch.is_full = !!b.is_full;
  if (b.is_flex !== undefined) patch.is_flex = !!b.is_flex;
  try {
    if (supabase) {
      const { error } = await supabase.from('analise_product_ads').update(patch).eq('id', adId).eq('user_id', req.userId);
      if (error) throw error;
    } else {
      const a = memAnaliseAds.find((x) => String(x.id) === String(adId) && x.user_id === req.userId);
      if (a) Object.assign(a, patch);
    }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao editar concorrente.' }); }
});

app.post('/api/analise/ads/:adId/monitorar', requireUser, async (req, res) => {
  const adId = req.params.adId; const monitorar = !!req.body?.monitorar;
  try {
    if (supabase) await supabase.from('analise_product_ads').update({ monitorar }).eq('id', adId).eq('user_id', req.userId);
    else { const a = memAnaliseAds.find((x) => String(x.id) === String(adId) && x.user_id === req.userId); if (a) a.monitorar = monitorar; }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao alterar monitoramento.' }); }
});

app.delete('/api/analise/ads/:adId', requireUser, async (req, res) => {
  const adId = req.params.adId;
  try {
    if (supabase) await supabase.from('analise_product_ads').delete().eq('id', adId).eq('user_id', req.userId);
    else { const i = memAnaliseAds.findIndex((x) => String(x.id) === String(adId) && x.user_id === req.userId); if (i >= 0) memAnaliseAds.splice(i, 1); }
    return res.json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao excluir concorrente.' }); }
});

// ===========================================================================
// ANALISE POR IA (Fase 2) — usa o token do proprio cliente (Claude/OpenAI)
// ===========================================================================
// Lista de modelos tentados em ordem (o 1o que a conta aceitar e usado).
// Pode forcar um unico via env ANTHROPIC_MODEL / OPENAI_MODEL.
const ANTHROPIC_MODELS = process.env.ANTHROPIC_MODEL
  ? [process.env.ANTHROPIC_MODEL]
  : ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-haiku-20240307'];
const OPENAI_MODELS = process.env.OPENAI_MODEL
  ? [process.env.OPENAI_MODEL]
  : ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];

// Decide se vale tentar o proximo modelo (modelo indisponivel) ou parar
// (credito/chave). Usa status HTTP + tipo/mensagem do erro.
function retryNextModel(status, err) {
  const type = (err?.type || err?.code || '').toLowerCase();
  const msg = (err?.message || '').toLowerCase();
  if (status === 404) return true;                              // Anthropic modelo inexistente
  if (/not_found|model_not_found|does not exist|unavailable|deprecat/.test(type + ' ' + msg)) return true;
  if (/^\s*model\s*:/.test(msg)) return true;                   // Anthropic: "model: <id>"
  if (status === 400 && /model/.test(msg)) return true;         // OpenAI modelo invalido
  return false; // 401 (chave), 429/insufficient (credito), etc -> propaga
}

async function anthropicTry(key, model, prompt, maxTokens = 1500) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

// Descobre modelos reais da conta (GET /v1/models)
async function anthropicListModels(key) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=20', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return [];
    return (data.data || []).map((m) => m.id).filter(Boolean);
  } catch (_) { return []; }
}

async function callAnthropic(key, prompt, maxTokens = 1500) {
  let lastErr = 'sem modelo disponivel';
  for (const model of ANTHROPIC_MODELS) {
    const { r, data } = await anthropicTry(key, model, prompt, maxTokens);
    if (r.ok) return (data.content || []).map((c) => c.text || '').join('\n').trim();
    lastErr = data?.error?.message || `Anthropic HTTP ${r.status}`;
    if (!retryNextModel(r.status, data?.error)) throw new Error(lastErr);
  }
  // fallback: pergunta a propria conta quais modelos existem e tenta o 1o
  const models = await anthropicListModels(key);
  for (const model of models.slice(0, 4)) {
    const { r, data } = await anthropicTry(key, model, prompt);
    if (r.ok) return (data.content || []).map((c) => c.text || '').join('\n').trim();
    lastErr = data?.error?.message || lastErr;
  }
  if (models.length === 0) throw new Error('a chave nao lista nenhum modelo. Verifique se e uma API Key do console.anthropic.com (nao o token do Claude Code) e se ha creditos em Billing.');
  throw new Error(`nenhum modelo Claude respondeu (${lastErr})`);
}

async function callOpenAI(key, prompt, maxTokens = 1500) {
  let lastErr = 'sem modelo disponivel';
  for (const model of OPENAI_MODELS) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return (data.choices?.[0]?.message?.content || '').trim();
    lastErr = data?.error?.message || `OpenAI HTTP ${r.status}`;
    if (!retryNextModel(r.status, data?.error)) throw new Error(lastErr);
  }
  throw new Error(`nenhum modelo OpenAI disponivel na sua conta (${lastErr})`);
}

function buildAnalysisPrompt(product, ads) {
  const p = product;
  const custoBase = (Number(p.preco_compra) || 0) + (Number(p.frete_entrada) || 0) + (Number(p.embalagem) || 0);
  const linhasConc = (ads || []).length
    ? ads.map((a, i) => `  ${i + 1}. "${a.titulo || a.ml_id || 'sem titulo'}" — preco ${a.preco != null ? 'R$ ' + Number(a.preco).toFixed(2) : 'n/d'}` +
        `${a.nota ? `, nota ${a.nota}` : ''}${a.vendedor ? `, vendedor ${a.vendedor}` : ''}` +
        `${a.vendas ? `, ${a.vendas}` : ''}${a.reputacao ? `, reputacao ${a.reputacao}` : ''}` +
        `${a.is_full ? ', FULL' : ''}${a.is_flex ? ', FLEX' : ''}` +
        `${a.data_criacao ? `, anuncio criado em ${a.data_criacao}` : ''}` +
        `${a.comentarios ? `, ${a.comentarios} avaliacoes` : ''}${a.aval_dist ? ` (${a.aval_dist})` : ''}` +
        `${a.comentarios_texto ? `\n     avaliacoes (texto): ${String(a.comentarios_texto).slice(0, 800).replace(/\n/g, ' | ')}` : ''}`).join('\n')
    : '  (nenhum concorrente cadastrado ainda)';

  return `Voce e um especialista em Mercado Livre (Brasil) que faz o "Raio-X" de anuncios, no nivel de ferramentas como Nubimetrics e Joopulse. Sua missao e diagnosticar o anuncio e dar uma NOTA DE 0 A 100, com problemas e acoes priorizadas por impacto. Responda em portugues do Brasil, com markdown.

Analise o funil COMPLETO do anuncio, considerando os 12 pilares abaixo. Para cada pilar, use os dados fornecidos; quando um dado nao existir (muitos so aparecem no painel do DONO do anuncio, nao do concorrente), diga explicitamente "dado nao coletado" e o que seria util medir — NAO invente numeros.

OS 12 PILARES:
1. Conversao (o mais importante): taxa de conversao, visitas, pedidos, receita, conversao 7d e 30d. Referencia: <1% grave, 1-2% ruim, 2-4% aceitavel, 4-8% muito bom, >8% excelente.
2. CTR: quantos clicam ao ver. CTR baixo = problema em foto principal, preco, frete, parcelamento ou titulo.
3. Foto principal: chama atencao? produto ocupa quase toda a imagem? fundo branco? contraste? melhor que concorrentes?
4. Titulo: responde o que e, marca, modelo, quantidade, medidas e a palavra mais buscada? Tem palavras-chave que os lideres usam?
5. Preco: vs os primeiros colocados, desconto, parcelamento, elegivel a campanhas.
6. Frete: Full, Flex, Entrega Hoje/Amanha, frete gratis, subsidio, prazo. Mais rapido = mais conversao.
7. Estoque: quantidade, dias de cobertura, rupturas, historico sem estoque.
8. Reputacao: cancelamentos, reclamacoes, devolucoes, atrasos, mensagens nao respondidas.
9. Conteudo: descricao boa? beneficios, especificacoes, medidas, garantia, FAQ, videos.
10. Competitividade vs TOP 10: preco, fotos, titulo, qtd vendida, avaliacoes, parcelamento, entrega, garantia, brindes.
11. Avaliacoes: ler principalmente 1-3 estrelas — o que reclamam, o que falta, oportunidades de melhoria.
12. Publicidade: ACOS, TACOS, ROAS, CTR, CPC, impressoes, conversao patrocinada.

ALEM DISSO, comente os "dados ocultos" quando houver base: evolucao (conversao caiu? apos qual mudanca?), sazonalidade (7/30/90 dias, ano anterior), share da categoria, elasticidade de preco, palavras-chave (aparece nas buscas certas?), e movimentos da concorrencia (quem entrou, baixou preco, virou Full, ganhou Mercado Lider).

===== DADOS DO PRODUTO DO VENDEDOR =====
- Nome: ${p.produto}
- Fornecedor: ${p.fornecedor || 'n/d'}
- Preco de compra: R$ ${(Number(p.preco_compra) || 0).toFixed(2)}
- Frete de entrada: R$ ${(Number(p.frete_entrada) || 0).toFixed(2)}
- Embalagem: R$ ${(Number(p.embalagem) || 0).toFixed(2)}
- Custo direto total (compra+frete+embalagem): R$ ${custoBase.toFixed(2)}
- Taxa Mercado Pago: ${(Number(p.taxa_mp) || 0)}% sobre o preco de venda
- Imposto: ${(Number(p.imposto) || 0)}% sobre o preco de venda
- Observacoes: ${p.observacoes || 'nenhuma'}

===== CONCORRENTES MONITORADOS =====
${linhasConc}

REGRA DE CUSTO: taxa MP e imposto sao PERCENTUAIS sobre o preco de venda P. Lucro liquido = P - custo_direto - (P * taxaMP%) - (P * imposto%). Use isso para calcular margem e preco ideal.

SCORE (0-100) ponderado: Conversao 25%, CTR 15%, SEO 15%, Conteudo 10%, Oferta 10%, Logistica 10%, Publicidade 5%, Estoque 5%, Reputacao 5%. Sem dados de um pilar, estime conservador.

Responda APENAS com JSON valido (sem markdown, sem texto fora do JSON), neste schema exato:
{
  "veredito": "vale_a_pena" | "avaliar" | "evitar",
  "score": <inteiro 0-100>,
  "resumo": "<1-2 frases diretas>",
  "detalhe": "<paragrafo com pontos positivos e negativos>",
  "financeiro": {
    "custo": <numero>, "preco_sugerido": <numero>, "margem_pct": <numero>, "lucro_un": <numero>,
    "explicacao": "<como chegou no preco/margem, comparando com a faixa dos concorrentes>"
  },
  "comentarios": "<resumo do que os clientes acham, baseado nas avaliacoes>",
  "elogios": ["<ponto positivo>", "..."],
  "reclamacoes": ["<reclamacao recorrente>", "..."],
  "oportunidades": ["<oportunidade concreta>", "..."],
  "riscos": ["<risco>", "..."],
  "proximos_passos": ["<acao pratica e priorizada>", "..."]
}

Regras: use os custos para calcular financeiro (margem_pct e lucro_un liquidos, ja descontando taxa MP% e imposto%); preco_sugerido competitivo vs concorrentes. elogios/reclamacoes vem das avaliacoes fornecidas (se nao houver, deixe [] e cite em reclamacoes que faltam avaliacoes). 3 a 6 itens por lista. Numeros sem "R$" (apenas o valor). Nunca invente metricas nao fornecidas.`;
}

app.post('/api/analise/products/:id/analyze', requireUser, async (req, res) => {
  const id = req.params.id;
  try {
    // carrega produto + concorrentes (com escopo do usuario)
    let product, ads;
    if (supabase) {
      const { data: p } = await supabase.from('analise_products').select('*').eq('id', id).eq('user_id', req.userId).maybeSingle();
      if (!p) return res.status(404).json({ error: 'Produto nao encontrado.' });
      const { data: a } = await supabase.from('analise_product_ads').select('*').eq('product_id', id).eq('user_id', req.userId);
      product = p; ads = a || [];
    } else {
      product = memAnaliseProducts.find((x) => String(x.id) === String(id) && x.user_id === req.userId);
      if (!product) return res.status(404).json({ error: 'Produto nao encontrado.' });
      ads = memAnaliseAds.filter((x) => String(x.product_id) === String(id) && x.user_id === req.userId);
    }

    const keys = await getDecryptedKeys(req.userId);
    const key = keys.provider === 'openai' ? keys.openai : keys.anthropic;
    if (!key) return res.status(400).json({ error: 'Configure seu token de IA nas Configuracoes para usar a analise.' });

    const prompt = buildAnalysisPrompt(product, ads);
    let text;
    try {
      text = keys.provider === 'openai' ? await callOpenAI(key, prompt) : await callAnthropic(key, prompt);
    } catch (e) {
      return res.status(502).json({ error: `A IA retornou erro: ${e.message}. Verifique se o token esta correto e com creditos.` });
    }
    if (!text) return res.status(502).json({ error: 'A IA nao retornou conteudo.' });

    // espera JSON estruturado; se vier texto solto, guarda como fallback
    const parsed = extractJson(text);
    const toStore = parsed ? JSON.stringify(parsed) : text;

    const stamp = new Date().toISOString();
    try {
      if (supabase) await supabase.from('analise_products').update({ analise_ia: toStore, analise_ia_at: stamp }).eq('id', id).eq('user_id', req.userId);
      else Object.assign(product, { analise_ia: toStore, analise_ia_at: stamp });
    } catch (_) { /* coluna pode nao existir ainda; ignora */ }

    return res.json({ analysis: toStore, structured: !!parsed, provider: keys.provider, at: stamp });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao analisar produto.' }); }
});

// ===========================================================================
// API PÚBLICA DA EXTENSÃO (Fase 3-4) — autenticada pelo token do cliente
// A extensão é externa: usa header x-ext-token (nao o JWT do Supabase).
// ===========================================================================
const extLimiter = makeLimiter({ windowMs: 60 * 1000, max: 120, message: 'Muitas requisicoes da extensao.' });

// CORS liberado apenas para as rotas /extension (a extensao roda em outra origem)
app.use('/extension', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-ext-token');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/extension', extLimiter);

async function requireExtToken(req, res, next) {
  const token = req.headers['x-ext-token'] || '';
  if (!token) return res.status(401).json({ error: 'Token da extensao ausente. Cole seu token nas Configuracoes.' });
  try {
    let userId = null;
    if (supabase) {
      const { data } = await supabase.from('user_ai_settings').select('user_id').eq('ext_token', token).maybeSingle();
      userId = data?.user_id || null;
    } else {
      userId = (memAiSettings.find((s) => s.ext_token === token) || {}).user_id || null;
    }
    if (!userId) return res.status(401).json({ error: 'Token invalido. Gere um novo na pagina de Analise.' });
    req.userId = userId;
    next();
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro de autenticacao.' }); }
}

// Extrai o MLB de uma URL/pagina do Mercado Livre
function extractMlId(rawData) {
  const src = `${rawData?.url || ''} ${rawData?.extracted?.ml_id || ''} ${rawData?.extracted?.link || ''}`;
  const m = src.match(/MLB-?(\d{6,})/i);
  return m ? 'MLB' + m[1] : (rawData?.extracted?.ml_id || null);
}

// Monta o registro do concorrente a partir do rawData enviado pela extensao
function resolveAdPayload(rawData) {
  const e = rawData?.extracted || {};
  const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); return isNaN(n) ? null : n; };
  const ml_id = extractMlId(rawData);
  return {
    ml_id,
    link: e.link || rawData?.url || (ml_id ? `https://produto.mercadolivre.com.br/${ml_id.replace('MLB', 'MLB-')}` : null),
    titulo: e.titulo || rawData?.title || null,
    preco: num(e.preco),
    preco_original: num(e.preco_original),
    nota: num(e.nota),
    vendas: e.vendas || null,
    perguntas: e.perguntas != null ? Number(e.perguntas) || 0 : null,
    comentarios: e.comentarios != null ? Number(e.comentarios) || 0 : null,
    aval_dist: e.aval_dist || null,
    data_criacao: e.data_criacao || null,
    vendedor: e.vendedor || null,
    cidade: e.cidade || null,
    estado: e.estado || null,
    reputacao: e.reputacao || null,
    is_full: e.is_full != null ? !!e.is_full : null,
    is_flex: e.is_flex != null ? !!e.is_flex : null,
    fotos: Array.isArray(e.fotos) ? e.fotos.slice(0, 8) : null,
    descricao: e.descricao || null,
    highlights: Array.isArray(e.highlights) ? e.highlights.slice(0, 40) : null,
  };
}

// Grava snapshot de preco (1 por dia por MLB) — historico
async function recordSnapshot(userId, ml_id, preco, preco_original) {
  if (!ml_id || preco == null) return;
  const snap_date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  try {
    if (supabase) {
      await supabase.from('analise_monitor_snapshots').delete().eq('ml_id', ml_id).eq('snap_date', snap_date);
      await supabase.from('analise_monitor_snapshots').insert({ user_id: userId, ml_id, snap_date, preco, preco_original });
    } else {
      const i = memAnaliseSnaps.findIndex((s) => s.ml_id === ml_id && s.snap_date === snap_date);
      if (i >= 0) memAnaliseSnaps.splice(i, 1);
      memAnaliseSnaps.push({ id: makeId(), user_id: userId, ml_id, snap_date, preco, preco_original });
    }
  } catch (err) { console.error('snapshot:', err.message); }
}

// Upsert do concorrente em UM produto (nao apaga foto/descricao quando vem vazio)
async function upsertCompetitor(userId, productId, payload) {
  const coalesce = (nv, ov) => (nv == null || nv === '' ? ov : nv);
  if (supabase) {
    const { data: existing } = await supabase.from('analise_product_ads').select('*')
      .eq('product_id', productId).eq('ml_id', payload.ml_id).eq('user_id', userId).maybeSingle();
    if (existing) {
      const merged = {};
      for (const k of Object.keys(payload)) merged[k] = coalesce(payload[k], existing[k]);
      merged.last_checked_at = new Date().toISOString();
      await supabase.from('analise_product_ads').update(merged).eq('id', existing.id);
      return existing.id;
    }
    const { data, error } = await supabase.from('analise_product_ads')
      .insert({ ...payload, product_id: productId, user_id: userId, monitorar: true, last_checked_at: new Date().toISOString() })
      .select('id').single();
    if (error) throw error;
    return data.id;
  }
  const existing = memAnaliseAds.find((a) => String(a.product_id) === String(productId) && a.ml_id === payload.ml_id && a.user_id === userId);
  if (existing) {
    for (const k of Object.keys(payload)) existing[k] = coalesce(payload[k], existing[k]);
    existing.last_checked_at = new Date().toISOString();
    return existing.id;
  }
  const ad = { id: makeId(), ...payload, product_id: productId, user_id: userId, monitorar: true, last_checked_at: new Date().toISOString(), created_at: new Date().toISOString() };
  memAnaliseAds.push(ad);
  return ad.id;
}

// GET produto ativo — a extensao nunca pergunta o alvo
app.get('/extension/produto-ativo', requireExtToken, async (req, res) => {
  try {
    const pid = await activeProductId(req.userId);
    if (!pid) return res.json({ produto: null });
    let prod;
    if (supabase) { const { data } = await supabase.from('analise_products').select('id, produto').eq('id', pid).maybeSingle(); prod = data; }
    else prod = memAnaliseProducts.find((p) => String(p.id) === String(pid));
    return res.json({ produto: prod ? { id: prod.id, nome: prod.produto } : null });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro.' }); }
});

// POST coleta manual ("Salvar na analise") — grava no produto ativo
app.post('/extension/anuncio', requireExtToken, async (req, res) => {
  try {
    const pid = await activeProductId(req.userId);
    if (!pid) return res.status(400).json({ error: 'Nenhum produto marcado como "Coleta ativa". Ative um produto na pagina de Analise.' });
    const payload = resolveAdPayload(req.body?.rawData || {});
    if (!payload.ml_id && !payload.titulo) return res.status(400).json({ error: 'Nao consegui ler o anuncio. Abra a pagina do produto no Mercado Livre.' });

    // limite de 10 concorrentes (a menos que ja exista este MLB)
    let count, exists = false;
    if (supabase) {
      const { data } = await supabase.from('analise_product_ads').select('id, ml_id').eq('product_id', pid).eq('user_id', req.userId);
      count = (data || []).length; exists = (data || []).some((a) => a.ml_id === payload.ml_id);
    } else {
      const list = memAnaliseAds.filter((a) => String(a.product_id) === String(pid) && a.user_id === req.userId);
      count = list.length; exists = list.some((a) => a.ml_id === payload.ml_id);
    }
    if (!exists && count >= ANALISE_MAX_ADS) return res.status(409).json({ error: `Limite de ${ANALISE_MAX_ADS} concorrentes por produto.` });

    const adId = await upsertCompetitor(req.userId, pid, payload);
    await recordSnapshot(req.userId, payload.ml_id, payload.preco, payload.preco_original);
    return res.json({ ok: true, ad_id: adId, ml_id: payload.ml_id, titulo: payload.titulo });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao salvar anuncio.' }); }
});

// GET fila da recoleta automatica (Fase 4) — MLBs monitorados desatualizados (>24h)
app.get('/extension/monitoramento/proximos', requireExtToken, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const force = req.query.force === '1';
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let list;
    if (supabase) {
      let q = supabase.from('analise_product_ads').select('ml_id, link, last_checked_at')
        .eq('user_id', req.userId).eq('monitorar', true).not('ml_id', 'is', null);
      const { data } = await q;
      list = data || [];
    } else {
      list = memAnaliseAds.filter((a) => a.user_id === req.userId && a.monitorar && a.ml_id);
    }
    if (!force) list = list.filter((a) => !a.last_checked_at || a.last_checked_at < cutoff);
    list.sort((a, b) => (a.last_checked_at || '') < (b.last_checked_at || '') ? -1 : 1);
    const seen = new Set(); const itens = [];
    for (const a of list) {
      if (seen.has(a.ml_id)) continue; seen.add(a.ml_id);
      itens.push({ ml_id: a.ml_id, url: a.link || `https://produto.mercadolivre.com.br/${a.ml_id.replace('MLB', 'MLB-')}` });
      if (itens.length >= limit) break;
    }
    return res.json({ itens });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro.' }); }
});

// POST recoleta em background (Fase 4) — atualiza o MLB em todos os produtos do usuario
app.post('/extension/monitoramento', requireExtToken, async (req, res) => {
  try {
    const payload = resolveAdPayload(req.body?.rawData || {});
    if (!payload.ml_id) return res.status(400).json({ error: 'MLB nao identificado.' });
    let prods;
    if (supabase) {
      const { data } = await supabase.from('analise_product_ads').select('product_id').eq('user_id', req.userId).eq('ml_id', payload.ml_id);
      prods = [...new Set((data || []).map((x) => x.product_id))];
    } else {
      prods = [...new Set(memAnaliseAds.filter((a) => a.user_id === req.userId && a.ml_id === payload.ml_id).map((a) => a.product_id))];
    }
    for (const pid of prods) await upsertCompetitor(req.userId, pid, payload);
    await recordSnapshot(req.userId, payload.ml_id, payload.preco, payload.preco_original);
    return res.json({ ok: true, updated: prods.length });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao recoletar.' }); }
});

// GET historico de preco de um MLB (mini-grafico no card)
app.get('/extension/monitor/:mlb', requireExtToken, async (req, res) => {
  try {
    const ml_id = req.params.mlb;
    let hist;
    if (supabase) {
      const { data } = await supabase.from('analise_monitor_snapshots').select('snap_date, preco')
        .eq('user_id', req.userId).eq('ml_id', ml_id).order('snap_date');
      hist = data || [];
    } else {
      hist = memAnaliseSnaps.filter((s) => s.user_id === req.userId && s.ml_id === ml_id).sort((a, b) => a.snap_date < b.snap_date ? -1 : 1);
    }
    return res.json({ historico: hist, count: hist.length });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro.' }); }
});

// Historico de preco tambem para o dashboard (via JWT do usuario)
app.get('/api/analise/monitor/:mlb', requireUser, async (req, res) => {
  try {
    const ml_id = req.params.mlb;
    let hist;
    if (supabase) {
      const { data } = await supabase.from('analise_monitor_snapshots').select('snap_date, preco')
        .eq('user_id', req.userId).eq('ml_id', ml_id).order('snap_date');
      hist = data || [];
    } else hist = memAnaliseSnaps.filter((s) => s.user_id === req.userId && s.ml_id === ml_id).sort((a, b) => a.snap_date < b.snap_date ? -1 : 1);
    return res.json({ historico: hist, count: hist.length });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro.' }); }
});

// ===========================================================================
// CRIAR CRIATIVOS (opcional) — gera JSON de brief de imagem (texto, barato)
// ===========================================================================
function buildCreativesPrompt(product, ads) {
  const insumos = (ads || []).slice(0, 6).map((a) => {
    const parts = [];
    if (a.titulo) parts.push(`titulo: ${a.titulo}`);
    if (a.preco) parts.push(`preco: R$ ${Number(a.preco).toFixed(2)}`);
    if (a.highlights) parts.push(`ficha: ${(Array.isArray(a.highlights) ? a.highlights.join('; ') : a.highlights)}`.slice(0, 300));
    if (a.descricao) parts.push(`descricao: ${String(a.descricao).slice(0, 300)}`);
    if (a.comentarios_texto) parts.push(`avaliacoes: ${String(a.comentarios_texto).slice(0, 300)}`);
    return '- ' + parts.join(' | ');
  }).join('\n');

  return `Voce e diretor de arte de e-commerce. Gere BRIEFS DE IMAGEM (criativos) para anunciar o produto abaixo no Mercado Livre, usando TUDO que sabemos dele e dos concorrentes (descricoes, ficha tecnica e o que os clientes elogiam/reclamam nas avaliacoes) para destacar os beneficios certos no texto.

PRODUTO: ${product.produto}
${product.analise_ia ? `RESUMO DA ANALISE: ${String(product.analise_ia).slice(0, 800)}` : ''}
DADOS DOS CONCORRENTES (use como referencia de mercado e do que valorizar):
${insumos || '- (sem concorrentes cadastrados)'}

Responda APENAS com JSON valido (sem texto fora do JSON, sem markdown), no formato:
{"criativos":[ CRIATIVO x7 ]}
Gere 7 criativos. IMPORTANTE: cada criativo deve QUEBRAR UMA OBJECAO diferente que aparece (ou apareceria) nos comentarios/avaliacoes dos clientes — ex.: "sera que dura?", "e dificil de usar?", "vale o preco?", "chega rapido?", "e original?", "serve pro meu caso?", "faz sujeira?". Use as reclamacoes reais das avaliacoes quando existirem; se faltarem, use as objecoes de compra mais comuns da categoria. Cada CRIATIVO segue EXATAMENTE este schema:
{
  "objecao": "<a objecao/duvida do cliente que este criativo resolve>",
  "composicao": {"cenario":"","sujeito":"","detalhe_produto":"","camera":""},
  "direcao_de_arte": {"iluminacao":"","paleta_cores":"","estilo_visual":""},
  "elementos_visual_copy": {"texto_principal":"","texto_secundario":"","posicao_texto":"","estilo_texto":"","grafismo":"","selo":""},
  "formato": "1:1"
}
Regras: textos de copy curtos e persuasivos em pt-BR, cada um focado em vencer a objecao daquele criativo; "detalhe_produto" deve pedir para preservar a identidade visual do produto conforme fotos de referencia; estilo_visual fotorealista premium para e-commerce (8k, sharp focus, depth of field). Nao invente selos falsos de certificacao.`;
}

function extractJson(text) {
  if (!text) return null;
  let t = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) t = t.slice(i, j + 1);
  try { return JSON.parse(t); } catch (_) { return null; }
}

app.post('/api/analise/products/:id/creatives', requireUser, async (req, res) => {
  const id = req.params.id;
  try {
    let product, ads;
    if (supabase) {
      const { data: p } = await supabase.from('analise_products').select('*').eq('id', id).eq('user_id', req.userId).maybeSingle();
      if (!p) return res.status(404).json({ error: 'Produto nao encontrado.' });
      const { data: a } = await supabase.from('analise_product_ads').select('*').eq('product_id', id).eq('user_id', req.userId);
      product = p; ads = a || [];
    } else {
      product = memAnaliseProducts.find((x) => String(x.id) === String(id) && x.user_id === req.userId);
      if (!product) return res.status(404).json({ error: 'Produto nao encontrado.' });
      ads = memAnaliseAds.filter((x) => String(x.product_id) === String(id) && x.user_id === req.userId);
    }
    const keys = await getDecryptedKeys(req.userId);
    const key = keys.provider === 'openai' ? keys.openai : keys.anthropic;
    if (!key) return res.status(400).json({ error: 'Configure seu token de IA para gerar criativos.' });

    const prompt = buildCreativesPrompt(product, ads);
    let text;
    try {
      text = keys.provider === 'openai' ? await callOpenAI(key, prompt, 3000) : await callAnthropic(key, prompt, 3000);
    } catch (e) { return res.status(502).json({ error: `A IA retornou erro: ${e.message}` }); }

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.criativos)) return res.status(502).json({ error: 'A IA nao retornou um JSON valido de criativos. Tente novamente.' });

    const stamp = new Date().toISOString();
    const jsonStr = JSON.stringify(parsed);
    try {
      if (supabase) await supabase.from('analise_products').update({ creativos_json: jsonStr, creativos_at: stamp }).eq('id', id).eq('user_id', req.userId);
      else Object.assign(product, { creativos_json: jsonStr, creativos_at: stamp });
    } catch (_) {}
    return res.json({ criativos: parsed.criativos, at: stamp });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao gerar criativos.' }); }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`FinanceEcom Free rodando em http://localhost:${PORT}`);
});
