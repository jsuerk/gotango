// Diagnostic endpoint for testing FlightAware AeroAPI search endpoints
// before full architecture rework. NOT FOR PRODUCTION USE.
// Tests two destinations: VTSP (Phuket — large/commercial-heavy)
// and TFFJ (St. Barts — small/private-heavy).

const AEROAPI_BASE = 'https://aeroapi.flightaware.com/aeroapi';
const AEROAPI_KEY = process.env.FLIGHTAWARE_API_KEY;

async function flightAwareGet(path, query) {
  const url = `${AEROAPI_BASE}${path}?${new URLSearchParams(query).toString()}`;
  const start = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        'x-apikey': AEROAPI_KEY,
        'Accept': 'application/json',
      },
    });
    const duration_ms = Date.now() - start;
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw_text: text, parse_error: e.message };
    }
    return {
      ok: response.ok,
      status: response.status,
      duration_ms,
      url,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      duration_ms: Date.now() - start,
      url,
      error: err.message,
    };
  }
}

async function testDestination(icao, label) {
  const result = {
    icao,
    label,
    tests: {},
  };

  // Test 1: GA flights with full detail
  // Question: Does this return arrived flights or only airborne?
  // Question: How many flights are returned per page (1 = 15 records)?
  result.tests.ga_search = await flightAwareGet('/flights/search', {
    query: `-destination ${icao} -filter ga`,
    max_pages: 2,
  });

  // Test 2: Commercial count only (no per-flight data)
  // Question: Does the count endpoint return what we expect?
  result.tests.commercial_count = await flightAwareGet('/flights/search/count', {
    query: `-destination ${icao} -filter airline`,
  });

  // Test 3: GA count only (no per-flight data) — for comparison
  result.tests.ga_count = await flightAwareGet('/flights/search/count', {
    query: `-destination ${icao} -filter ga`,
  });

  // Test 4: Original arrivals endpoint (for comparison with current production)
  // Question: How many arrivals does the current endpoint return?
  result.tests.original_arrivals = await flightAwareGet(
    `/airports/${icao}/flights/arrivals`,
    { max_pages: 1 }
  );

  // Compute summary metrics
  const gaFlights = result.tests.ga_search.data?.flights || [];
  const commercialCount = result.tests.commercial_count.data?.count;
  const gaCount = result.tests.ga_count.data?.count;
  const originalArrivals = result.tests.original_arrivals.data?.arrivals || [];

  result.summary = {
    ga_flights_in_search_response: gaFlights.length,
    ga_count_from_count_endpoint: gaCount,
    commercial_count_from_count_endpoint: commercialCount,
    original_arrivals_total: originalArrivals.length,
    // Sample first GA flight to inspect data shape
    sample_ga_flight: gaFlights[0] || null,
    // Check if actual_on is present (indicates arrived vs airborne)
    has_actual_on_timestamps: gaFlights.some(f => f.actual_on),
    actual_on_count: gaFlights.filter(f => f.actual_on).length,
    sample_actual_on_values: gaFlights.slice(0, 5).map(f => ({
      ident: f.ident,
      actual_off: f.actual_off,
      actual_on: f.actual_on,
    })),
    // Pricing transparency: how many "pages" charged?
    estimated_charges: {
      ga_search_pages: result.tests.ga_search.data?.num_pages,
      commercial_count: 1, // count endpoint = 1 charge
      ga_count: 1, // count endpoint = 1 charge
      original_arrivals_pages: result.tests.original_arrivals.data?.num_pages,
    },
  };

  return result;
}

module.exports = async (req, res) => {
  // Allow only GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Optional: simple secret check to avoid public abuse
  const secret = req.query.secret;
  if (secret !== 'test-ga-2026') {
    return res.status(403).json({
      ok: false,
      error: 'Add ?secret=test-ga-2026 to URL to run this test',
    });
  }

  const start = Date.now();
  const results = {
    ok: true,
    started_at: new Date().toISOString(),
    note: 'Diagnostic endpoint for GA-only architecture exploration. Tests two destinations to verify FlightAware /flights/search behavior before full rework.',
    test_destinations: [
      { icao: 'VTSP', label: 'Phuket (large, commercial-heavy)' },
      { icao: 'TFFJ', label: 'St. Barthélemy (small, private-heavy)' },
    ],
    results: [],
  };

  try {
    // Run both destination tests in parallel
    const [phuket, stbarts] = await Promise.all([
      testDestination('VTSP', 'Phuket (large, commercial-heavy)'),
      testDestination('TFFJ', 'St. Barthélemy (small, private-heavy)'),
    ]);

    results.results = [phuket, stbarts];
    results.duration_ms = Date.now() - start;

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      duration_ms: Date.now() - start,
    });
  }
};
