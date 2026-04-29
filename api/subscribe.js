import { kv } from '@vercel/kv';

const MAX_LIST_SIZE = 10000;
const MAX_EMAIL_LENGTH = 200;
const RATE_LIMIT_PER_IP_PER_HOUR = 5;
const WAITLIST_KEY = 'gotango:waitlist';
const RATE_LIMIT_KEY_PREFIX = 'gotango:ratelimit:subscribe:';

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > MAX_EMAIL_LENGTH) return false;
  if (!trimmed.includes('@')) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(trimmed);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const email = (body.email || '').toString().trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email' });
    }

    const ip = getClientIp(req);
    const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}${ip}`;
    try {
      const currentCount = await kv.incr(rateLimitKey);
      if (currentCount === 1) {
        await kv.expire(rateLimitKey, 3600);
      }
      if (currentCount > RATE_LIMIT_PER_IP_PER_HOUR) {
        return res.status(429).json({ ok: false, error: 'Too many requests. Try again in an hour.' });
      }
    } catch (rateErr) {
      console.warn('[subscribe] Rate limit check failed:', rateErr);
    }

    let listSize = 0;
    try {
      listSize = await kv.scard(WAITLIST_KEY);
    } catch {
      listSize = 0;
    }

    if (listSize >= MAX_LIST_SIZE) {
      return res.status(503).json({ ok: false, error: 'Waitlist is currently full. Try again later.' });
    }

    try {
      const wasAdded = await kv.sadd(WAITLIST_KEY, JSON.stringify({
        email,
        joined_at: new Date().toISOString(),
        ip_hash: ip ? ip.slice(0, 6) + '...' : 'unknown',
      }));
      console.log(`[subscribe] Added email to waitlist (size now ${listSize + (wasAdded ? 1 : 0)})`);
    } catch (writeErr) {
      console.error('[subscribe] KV write failed:', writeErr);
      return res.status(500).json({ ok: false, error: 'Could not save your email. Try again?' });
    }

    return res.status(200).json({ ok: true, message: 'Joined waitlist' });
  } catch (err) {
    console.error('[subscribe] unexpected error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Server error. Try again?',
    });
  }
}
