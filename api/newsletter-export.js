import { kv } from '@vercel/kv';

const EMAIL_KEY_PREFIX = 'gotango:newsletter:signup:';
const EMAILS_SET_KEY = 'gotango:newsletter:emails';

function hasKvConfig() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function signupKey(email) {
  return `${EMAIL_KEY_PREFIX}${email}`;
}

function toPublicRecord(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    email: record.email,
    source: record.source,
    created_at: record.created_at,
    updated_at: record.updated_at,
    status: record.status,
  };
}

function sortByCreatedAtDesc(signups) {
  return signups.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(signups) {
  const header = 'email,source,created_at,updated_at,status';
  const rows = signups.map((r) =>
    [r.email, r.source, r.created_at, r.updated_at, r.status]
      .map(csvEscape)
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = (req.query?.secret || '').toString();
  const expected = process.env.NEWSLETTER_EXPORT_SECRET || '';

  if (!expected || secret !== expected) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (!hasKvConfig()) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      ok: false,
      error: 'Newsletter storage is not configured.',
    });
  }

  const format = (req.query?.format || '').toString().toLowerCase();

  try {
    let emails;
    try {
      emails = await kv.smembers(EMAILS_SET_KEY);
    } catch (kvErr) {
      console.error('[newsletter-export] KV smembers failed:', kvErr);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ ok: false, error: 'Could not read signups.' });
    }

    if (!Array.isArray(emails)) emails = [];

    let signups = [];
    if (emails.length > 0) {
      const keys = emails.map(signupKey);
      try {
        const raw =
          keys.length === 1 ? [await kv.get(keys[0])] : await kv.mget(...keys);
        signups = (raw || []).map(toPublicRecord).filter(Boolean);
      } catch (kvErr) {
        console.error('[newsletter-export] KV read failed:', kvErr);
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ ok: false, error: 'Could not read signups.' });
      }
    }

    signups = sortByCreatedAtDesc(signups);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.status(200).send(toCsv(signups));
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      ok: true,
      count: signups.length,
      signups,
    });
  } catch (err) {
    console.error('[newsletter-export] unexpected error:', err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ ok: false, error: 'Server error.' });
  }
}
