const MAX_ITEMS = 20;
const MAX_STRING = 600;

function trim(value, maxLen = MAX_STRING) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function sanitizeDays(days) {
  if (!Array.isArray(days)) return [];
  return days.slice(0, 14).map((day, index) => {
    const dayNum = Number.isFinite(Number(day?.day)) ? Number(day.day) : index + 1;
    const title = trim(day?.title, 120);
    const summary = trim(day?.summary, 500);
    if (!title || !summary) return null;
    const items = Array.isArray(day?.items)
      ? day.items.slice(0, 4).map((item) => ({
        time: trim(item?.time, 40),
        title: trim(item?.title, 120),
        note: trim(item?.note, 220),
      })).filter((item) => item.title || item.note)
      : [];
    return { day: dayNum, title, summary, items };
  }).filter(Boolean);
}

export function buildTiaWatchItineraryItem(preview, destinationId, nowIso = new Date().toISOString()) {
  if (!preview || preview.type !== 'itinerary') return null;
  const destId = trim(destinationId, 80);
  const title = trim(preview.title, 160);
  const summary = trim(preview.summary, 900);
  if (!destId || !title || !summary) return null;

  return {
    id: `tia_itinerary_${destId}_${Date.now()}`,
    type: 'itinerary',
    destinationId: destId,
    destinationName: trim(preview.destinationName, 120),
    airportCode: trim(preview.airportCode, 24),
    title,
    summary,
    bestFor: trim(preview.bestFor, 160),
    pace: trim(preview.pace, 80),
    days: sanitizeDays(preview.days),
    source: 'tia',
    status: 'saved',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function buildTiaWatchTripItem(preview, destinationId, nowIso = new Date().toISOString()) {
  if (!preview || preview.type !== 'trip') return null;
  const destId = trim(destinationId, 80);
  const title = trim(preview.title, 160);
  const overview = trim(preview.overview, 900);
  if (!destId || !title || !overview) return null;

  const dontMiss = Array.isArray(preview.dontMiss)
    ? preview.dontMiss.map((item) => trim(item, 180)).filter(Boolean).slice(0, 5)
    : [];

  return {
    id: `tia_trip_${destId}_${Date.now()}`,
    type: 'trip',
    destinationId: destId,
    destinationName: trim(preview.destinationName, 120),
    airportCode: trim(preview.airportCode, 24),
    title,
    overview,
    recommendedBase: trim(preview.recommendedBase, 220),
    vibe: trim(preview.vibe, 220),
    dontMiss,
    suggestedPlan: trim(preview.suggestedPlan, 700),
    source: 'tia',
    status: 'saved',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function validateTiaWatchItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.type !== 'itinerary' && item.type !== 'trip') return false;
  if (!trim(item.id, 120) || !trim(item.destinationId, 80) || !trim(item.title, 160)) return false;
  if (item.type === 'itinerary') return !!trim(item.summary, 900);
  return !!trim(item.overview, 900);
}

export function normalizeTiaWatchItems(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const items = [];
  for (const entry of raw) {
    if (!validateTiaWatchItem(entry)) continue;
    const id = trim(entry.id, 120);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push(entry);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export function findDuplicateTiaWatchItem(items, candidate) {
  if (!candidate || !Array.isArray(items)) return null;
  const type = candidate.type;
  const destinationId = trim(candidate.destinationId, 80);
  const title = trim(candidate.title, 160).toLowerCase();
  if (!type || !destinationId || !title) return null;
  return items.find((item) => (
    item.type === type
    && trim(item.destinationId, 80) === destinationId
    && trim(item.title, 160).toLowerCase() === title
  )) || null;
}
