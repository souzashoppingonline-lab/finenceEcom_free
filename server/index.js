import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

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
      from: `"FinanceEcom Free" <${SMTP_USER}>`,
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
const memCards = [];
const memParcelas = [];
const memFaturaPagtos = [];

function makeId() {
  return 'mem-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Middleware de autenticacao do painel admin
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Nao autorizado.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/leads  -> cadastro publico (captacao)
// ---------------------------------------------------------------------------
app.post('/api/leads', async (req, res) => {
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
async function resendSend(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM || 'FinanceEcom Free <nao-responda@financeecom.com.br>';
  if (!key) { console.warn('[AVISO] RESEND_API_KEY nao configurado — alerta de boletos nao enviado.'); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
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
  return `<div style="font-family:system-ui,Arial,sans-serif;color:#1c2434;max-width:560px">
    <h2 style="color:#1d7a5f">FinanceEcom Free — Contas do dia</h2>
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
app.post('/api/boleto-alert/test', requireUser, async (req, res) => {
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

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`FinanceEcom Free rodando em http://localhost:${PORT}`);
});
