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
  const name = (req.body?.name || '').trim();
  const color = (req.body?.color || '#1d7a5f').trim();
  if (!name) return res.status(400).json({ error: 'Nome da loja e obrigatorio.' });
  try {
    if (supabase) {
      const { data, error } = await supabase.from('stores').insert({ name, color, user_id: req.userId }).select().single();
      if (error) throw error;
      return res.status(201).json({ store: data });
    }
    const store = { id: makeId(), name, color, user_id: req.userId, created_at: new Date().toISOString() };
    memStores.push(store);
    return res.status(201).json({ store });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Erro ao criar loja.' }); }
});

app.put('/api/stores/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  const patch = {};
  if (req.body?.name != null) patch.name = String(req.body.name).trim();
  if (req.body?.color != null) patch.color = String(req.body.color).trim();
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

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`FinanceEcom Free rodando em http://localhost:${PORT}`);
});
