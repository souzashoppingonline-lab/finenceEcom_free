import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

// Fallback em memoria para desenvolvimento sem Supabase
const memoryStore = [];

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
      memoryStore.push(record);
    }
    return res.status(201).json({ ok: true, message: 'Cadastro realizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao salvar lead:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar cadastro.' });
  }
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

      return res.json({ total: count || 0, last7days: last7 || 0 });
    }
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const last7 = memoryStore.filter((r) => new Date(r.created_at).getTime() >= since).length;
    return res.json({ total: memoryStore.length, last7days: last7 });
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
        .select('name, email, whatsapp, marketplace, created_at')
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

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`FinanceEcom Free rodando em http://localhost:${PORT}`);
});
