import { kv } from '@vercel/kv';

const MAX_EMAIL_LENGTH = 254;
const EMAIL_KEY_PREFIX = 'gotango:newsletter:signup:';
const EMAILS_SET_KEY = 'gotango:newsletter:emails';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasKvConfig() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_RE.test(trimmed);
}

function signupKey(email) {
  return `${EMAIL_KEY_PREFIX}${email}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!hasKvConfig()) {
    return res.status(500).json({
      ok: false,
      error: 'Newsletter storage is not configured.',
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const website = (body.website || '').toString().trim();
    if (website) {
      return res.status(200).json({ ok: true });
    }

    const email = (body.email || '').toString().trim().toLowerCase();
    const source = (body.source || '').toString().trim() || undefined;

    if (!email) {
      return res.status(400).json({ ok: false, error: 'Email is required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email.' });
    }

    const now = new Date().toISOString();
    const key = signupKey(email);

    let existing;
    try {
      existing = await kv.get(key);
    } catch (kvErr) {
      console.error('[newsletter-signup] KV read failed:', kvErr);
      return res.status(500).json({
        ok: false,
        error: 'Could not save your email. Try again?',
      });
    }

    if (existing) {
      const updated = {
        ...existing,
        email,
        updated_at: now,
        status: existing.status || 'subscribed',
      };
      if (source) updated.source = source;

      try {
        await kv.set(key, updated);
      } catch (kvErr) {
        console.error('[newsletter-signup] KV update failed:', kvErr);
        return res.status(500).json({
          ok: false,
          error: 'Could not save your email. Try again?',
        });
      }

      return res.status(200).json({
        ok: true,
        duplicate: true,
        message: 'You\u2019re already on the list.',
      });
    }

    const record = {
      email,
      source,
      created_at: now,
      updated_at: now,
      status: 'subscribed',
    };

    try {
      await kv.set(key, record);
      await kv.sadd(EMAILS_SET_KEY, email);
    } catch (kvErr) {
      console.error('[newsletter-signup] KV write failed:', kvErr);
      return res.status(500).json({
        ok: false,
        error: 'Could not save your email. Try again?',
      });
    }

    return res.status(200).json({
      ok: true,
      duplicate: false,
      message: 'You\u2019re on the list.',
    });
  } catch (err) {
    console.error('[newsletter-signup] unexpected error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Server error. Try again?',
    });
  }
}
