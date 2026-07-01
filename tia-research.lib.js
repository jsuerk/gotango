const RESEARCH_KEYWORDS = [
  'hotel', 'hotels', 'stay', 'staying', 'restaurant', 'restaurants', 'dining', 'eat',
  'food', 'activity', 'activities', 'things to do', 'neighborhood', 'area', 'where should',
  'best place', 'recommend', 'reservation', 'book', 'event', 'events', 'nightlife', 'beach club',
  'resort', 'lodging', 'itinerary', 'timing', 'avoid', 'first day',
];

const RECOMMENDATION_TYPES = new Set([
  'hotel_area', 'hotel', 'restaurant', 'activity', 'event', 'logistics',
]);

function trimString(value, maxLen = 600) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

export function isTiaWebSearchEnabled() {
  const flag = process.env.TIA_WEB_SEARCH_ENABLED?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

export function getTiaResearchModel(defaultModel) {
  const configured = process.env.TIA_RESEARCH_MODEL?.trim();
  return configured || defaultModel;
}

export function shouldUseTiaWebSearchForChat(message) {
  if (!isTiaWebSearchEnabled()) return false;
  const text = String(message || '').trim().toLowerCase();
  if (!text) return false;
  return RESEARCH_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function shouldUseTiaWebSearchForPreview(mode) {
  if (!isTiaWebSearchEnabled()) return false;
  return mode === 'itinerary' || mode === 'trip';
}

export function buildTiaWebSearchTools() {
  return [
    {
      type: 'web_search',
      search_context_size: 'medium',
      filters: {
        blocked_domains: [
          'wikipedia.org',
          'reddit.com',
          'quora.com',
          'facebook.com',
          'pinterest.com',
        ],
      },
    },
  ];
}

export function normalizeTiaRecommendations(raw, maxItems = 8) {
  if (!Array.isArray(raw)) return [];
  const items = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const typeRaw = trimString(entry.type, 40).toLowerCase();
    const type = RECOMMENDATION_TYPES.has(typeRaw) ? typeRaw : 'activity';
    const name = trimString(entry.name, 160);
    const why = trimString(entry.why, 320);
    const sourceUrl = trimString(entry.sourceUrl, 500);
    if (!name || !why) continue;
    items.push({ type, name, why, sourceUrl: sourceUrl || undefined });
    if (items.length >= maxItems) break;
  }
  return items;
}

export function extractSourceDomain(url) {
  const value = trimString(url, 500);
  if (!value) return '';
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '');
    return trimString(hostname, 120);
  } catch (_) {
    return trimString(value, 120);
  }
}
