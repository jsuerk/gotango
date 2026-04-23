export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const username = process.env.OPENSKY_USERNAME;
    const password = process.env.OPENSKY_PASSWORD;

    if (!username || !password) {
      return res.status(200).json({
        ok: false,
        airport: 'TFFJ',
        error:
          'Missing OpenSky credentials: set OPENSKY_USERNAME and OPENSKY_PASSWORD.',
        raw_status: null,
      });
    }

    const end = Math.floor(Date.now() / 1000);
    const begin = end - 24 * 60 * 60;

    const url = new URL('https://opensky-network.org/api/flights/arrival');
    url.searchParams.set('airport', 'TFFJ');
    url.searchParams.set('begin', String(begin));
    url.searchParams.set('end', String(end));

    const basic = Buffer.from(`${username}:${password}`).toString('base64');

    const openskyRes = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${basic}`,
      },
    });

    const raw_status = openskyRes.status;

    if (!openskyRes.ok) {
      let detail = '';
      try {
        const text = await openskyRes.text();
        if (text) detail = text.slice(0, 300);
      } catch {
        /* ignore */
      }
      const error =
        detail ||
        (openskyRes.status === 401 || openskyRes.status === 403
          ? 'OpenSky rejected credentials or access denied.'
          : `OpenSky request failed with HTTP ${openskyRes.status}.`);

      return res.status(200).json({
        ok: false,
        airport: 'TFFJ',
        error,
        raw_status,
      });
    }

    let body;
    try {
      body = await openskyRes.json();
    } catch {
      return res.status(200).json({
        ok: false,
        airport: 'TFFJ',
        error: 'OpenSky returned a response that is not valid JSON.',
        raw_status,
      });
    }

    if (!Array.isArray(body)) {
      return res.status(200).json({
        ok: false,
        airport: 'TFFJ',
        error: 'OpenSky response was not a JSON array of arrivals.',
        raw_status,
      });
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
    const message =
      err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      ok: false,
      airport: 'TFFJ',
      error: message || 'Unknown error while fetching OpenSky arrivals.',
      raw_status: null,
    });
  }
}
