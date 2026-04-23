const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const ARRIVALS_BASE = 'https://opensky-network.org/api/flights/arrival';

function errorCauseString(error) {
  if (!(error instanceof Error) || error.cause == null) return null;
  const c = error.cause;
  if (typeof c === 'object' && c !== null) {
    if ('code' in c && c.code != null) return String(c.code);
    if ('message' in c && c.message != null) return String(c.message);
  }
  return String(c);
}

function failureBody(stage, error, raw_status) {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    airport: 'TFFJ',
    stage,
    error: msg,
    error_name: error instanceof Error ? error.name : null,
    error_cause: errorCauseString(error),
    raw_status: raw_status ?? null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      const err = new Error(
        'Missing OpenSky credentials: set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET.'
      );
      console.error('test-arrivals:', err);
      return res.status(200).json(failureBody('token', err, null));
    }

    console.log('OpenSky token endpoint:', TOKEN_URL);

    const tokenBody = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody.toString(),
    });

    console.log('Token response status:', tokenRes.status);

    if (!tokenRes.ok) {
      let detail = '';
      try {
        detail = (await tokenRes.text()).slice(0, 500);
      } catch {
        /* ignore */
      }
      const err = new Error(
        detail || `Token request failed with HTTP ${tokenRes.status}.`
      );
      console.error('test-arrivals token error:', err.message, {
        status: tokenRes.status,
      });
      return res.status(200).json(failureBody('token', err, tokenRes.status));
    }

    let tokenJson;
    try {
      tokenJson = await tokenRes.json();
    } catch (parseErr) {
      console.error('test-arrivals token JSON parse:', parseErr);
      return res
        .status(200)
        .json(failureBody('token', parseErr, tokenRes.status));
    }

    const access_token = tokenJson?.access_token;
    if (!access_token || typeof access_token !== 'string') {
      const err = new Error('Token response missing access_token.');
      console.error('test-arrivals:', err, { tokenKeys: Object.keys(tokenJson || {}) });
      return res.status(200).json(failureBody('token', err, tokenRes.status));
    }

    const end = Math.floor(Date.now() / 1000);
    const begin = end - 24 * 60 * 60;

    const arrivalsUrl = new URL(ARRIVALS_BASE);
    arrivalsUrl.searchParams.set('airport', 'TFFJ');
    arrivalsUrl.searchParams.set('begin', String(begin));
    arrivalsUrl.searchParams.set('end', String(end));

    console.log('OpenSky arrivals URL:', arrivalsUrl.toString());
    console.log('Arrivals window (unix):', { begin, end });

    const arrivalsRes = await fetch(arrivalsUrl.toString(), {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    console.log('Arrivals response status:', arrivalsRes.status);

    const raw_status = arrivalsRes.status;

    if (!arrivalsRes.ok) {
      let detail = '';
      try {
        detail = (await arrivalsRes.text()).slice(0, 500);
      } catch {
        /* ignore */
      }
      const err = new Error(
        detail || `Arrivals request failed with HTTP ${arrivalsRes.status}.`
      );
      console.error('test-arrivals arrivals error:', err.message, {
        status: arrivalsRes.status,
      });
      return res.status(200).json(failureBody('arrivals', err, raw_status));
    }

    let body;
    try {
      body = await arrivalsRes.json();
    } catch (parseErr) {
      console.error('test-arrivals arrivals JSON parse:', parseErr);
      return res.status(200).json(failureBody('arrivals', parseErr, raw_status));
    }

    if (!Array.isArray(body)) {
      const err = new Error('OpenSky response was not a JSON array of arrivals.');
      console.error('test-arrivals:', err);
      return res.status(200).json(failureBody('arrivals', err, raw_status));
    }

    return res.status(200).json({
      ok: true,
      airport: 'TFFJ',
      name: 'St. Barts',
      fetched_at: new Date().toISOString(),
      window_hours: 24,
      arrivals_count: body.length,
      sample_arrival: body.length > 0 ? body[0] : null,
      raw_status,
    });
  } catch (err) {
    console.error('test-arrivals unexpected error:', err);
    return res.status(200).json(failureBody('unknown', err, null));
  }
}
