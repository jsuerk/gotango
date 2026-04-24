const AIRPORT_CODE = 'TFFJ';
const AEROAPI_ARRIVALS = `https://aeroapi.flightaware.com/aeroapi/airports/${AIRPORT_CODE}/flights/arrivals`;

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
    airport: AIRPORT_CODE,
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
    const apiKey = process.env.FLIGHTAWARE_API_KEY;
    console.log('FlightAware API key present:', Boolean(apiKey && String(apiKey).trim()));

    if (!apiKey || !String(apiKey).trim()) {
      const err = new Error(
        'Missing FLIGHTAWARE_API_KEY: set the environment variable to your FlightAware AeroAPI key.'
      );
      console.error('test-arrivals config error:', err);
      return res.status(200).json(failureBody('config', err, null));
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const formatTime = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const start = formatTime(yesterday);
    const end = formatTime(now);

    console.log('FlightAware start/end sent:', { start, end });

    const params = new URLSearchParams({
      start: start,
      end: end,
      max_pages: '1',
    });
    const url = `${AEROAPI_ARRIVALS}?${params.toString()}`;

    console.log('FlightAware EXACT request URL:', url);

    const controller = new AbortController();
    const timeoutMs = 25_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let arrivalsRes;
    try {
      arrivalsRes = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'x-apikey': apiKey.trim(),
        },
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const isAbort =
        fetchErr instanceof Error &&
        (fetchErr.name === 'AbortError' || fetchErr.message?.includes('aborted'));
      const err =
        isAbort
          ? new Error(`FlightAware request timed out or was aborted after ${timeoutMs / 1000}s.`, {
              cause: fetchErr,
            })
          : fetchErr instanceof Error
            ? fetchErr
            : new Error(String(fetchErr));
      console.error('test-arrivals request error:', fetchErr);
      return res.status(200).json(failureBody('request', err, null));
    } finally {
      clearTimeout(timeoutId);
    }

    const raw_status = arrivalsRes.status;
    console.log('FlightAware HTTP status:', raw_status);

    if (!arrivalsRes.ok) {
      let detail = '';
      try {
        detail = (await arrivalsRes.text()).slice(0, 500);
      } catch {
        /* ignore */
      }
      const err = new Error(
        detail || `FlightAware request failed with HTTP ${arrivalsRes.status}.`
      );
      console.error('test-arrivals HTTP error:', err.message, { status: raw_status });
      return res.status(200).json(failureBody('request', err, raw_status));
    }

    let body;
    try {
      body = await arrivalsRes.json();
    } catch (parseErr) {
      console.error('test-arrivals JSON parse error:', parseErr);
      return res.status(200).json(failureBody('parse', parseErr, raw_status));
    }

    const arrivals = body?.arrivals;
    if (!Array.isArray(arrivals)) {
      const err = new Error(
        'FlightAware response missing a top-level "arrivals" array or it was not an array.'
      );
      console.error('test-arrivals parse shape error:', err);
      return res.status(200).json(failureBody('parse', err, raw_status));
    }

    const arrivals_count = arrivals.length;
    console.log('Parsed arrivals_count:', arrivals_count);

    return res.status(200).json({
      ok: true,
      airport: AIRPORT_CODE,
      name: 'St. Barts',
      fetched_at: new Date().toISOString(),
      window_hours: 24,
      arrivals_count,
      sample_arrival: arrivals_count > 0 ? arrivals[0] : null,
      raw_status,
    });
  } catch (err) {
    console.error('test-arrivals unexpected error:', err);
    return res.status(200).json(failureBody('unknown', err, null));
  }
}
