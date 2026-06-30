import { DESTINATIONS } from './destinations.config.js';

export const NEWS_PRICING_VERSION = '2026-06-10';

export const NEWS_SOURCE_MAX_AGE_DAYS = 30;
export const NEWS_EVENT_SOURCE_MAX_AGE_DAYS = 60;
export const NEWS_UPCOMING_EVENT_WINDOW_DAYS = 60;
export const NEWS_RECENT_OPENING_MAX_AGE_DAYS = 21;

export const PLATFORM_HOSTING_DOMAINS = [
  'wordpress.com',
  'medium.com',
  'substack.com',
  'blogspot.com',
  'tumblr.com',
  'wixsite.com',
  'weebly.com',
];

export const NEWS_MODEL_PRICING = {
  'gpt-5.4-mini': {
    input_per_1m: 0.75,
    cached_input_per_1m: 0.075,
    output_per_1m: 4.5,
  },
};

export const NEWS_WEB_SEARCH_PRICING = {
  per_1000_calls: 10.0,
};

const PUBLIC_DESTINATION_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

export const DESTINATION_TRUSTED_EDITORIAL_DOMAINS = {
  ibiza: ['periodicodeibiza.es', 'cadenaser.com', 'diariodeibiza.com'],
  'palm-beach': ['wptv.com', 'wpbf.com'],
  'st-barts': ['journaldesaintbarth.com', 'caribjournal.com'],
  maldives: ['edition.mv'],
};

export const DESTINATION_AUTHORITY_DOMAINS = {
  'st-tropez': [
    'saint-tropez.fr',
    'sainttropeztourisme.com',
    'portsainttropez.com',
    'golfe-sainttropez-tourisme.fr',
  ],
  'st-moritz': ['stmoritz.com', 'engadin.ch'],
  'jackson-hole': ['jacksonhole.com', 'jacksonholechamber.com', 'visitjacksonhole.com'],
  'cabo-san-lucas': ['visitloscabos.travel'],
  'casa-de-campo': ['casadecampo.com.do', 'cigarsinparadise.com'],
  verbier: ['verbier.ch'],
  whistler: ['whistler.com', 'content.whistler.com', 'whistlerblackcomb.com'],
  'sun-valley': ['visitsunvalley.com'],
  'destin-30a': ['seasidefl.com', '30a.com'],
  'puerto-vallarta': ['visitpuertovallarta.com'],
  'amalfi-salerno': ['comune.amalfi.sa.it'],
  'capri-naples': ['capri.it', 'capri.com'],
  'dubai-private': ['visitdubai.com'],
  bali: ['visitbali.com', 'bbtf.co.id'],
};

export const DESTINATION_SPECIALIST_EDITORIAL_DOMAINS = {
  mallorca: ['majorcadailybulletin.com'],
  bali: ['balipost.com', 'thebaliguideline.com', 'nowbali.co.id'],
  'amalfi-salerno': ['amalficoast-travel.com', 'amalfinotizie.it'],
};

export const DESTINATION_COMMERCIAL_FIRST_PARTY_DOMAINS = {
  nassau: ['atlantisbahamas.com', 'bahamar.com'],
};

export const DESTINATION_COMMERCIAL_FIRST_PARTY_ORGANIZATION_ALIASES = {
  nassau: {
    'atlantisbahamas.com': ['atlantis', 'atlantis bahamas', 'atlantis paradise island'],
    'bahamar.com': ['baha mar', 'bahamar'],
  },
};

export const ACCESS_CITY_SEARCH_ONLY_ALIASES = {
  'capri-naples': ['Naples'],
  verbier: ['Sion'],
  whistler: ['Vancouver'],
};

export const DEFAULT_EVENT_SCENE_SEARCH_HINTS = [
  'events',
  'upcoming events',
  'concerts',
  'music',
  'DJ residencies',
  'nightlife',
  'restaurant openings',
  'hotel openings',
  'beach clubs',
  'festivals',
  'food and culinary events',
  'art exhibitions',
  'cultural programming',
  'sporting events',
  'seasonal visitor experiences',
];

const HAND_TUNED_NEWS_CONFIGS = [
  {
    destination_id: 'ibiza',
    country: 'Spain',
    region: 'Balearic Islands',
    search_city: 'Ibiza',
    aliases: ['Ibiza', 'Eivissa'],
    excluded_meanings: [],
    search_hints: [
      'events',
      'concerts',
      'nightlife',
      'DJ residencies',
      'restaurant openings',
      'beach clubs',
      'festivals',
      'cultural programming',
      'marina events',
    ],
  },
  {
    destination_id: 'palm-beach',
    country: 'United States',
    region: 'Florida',
    search_city: 'Palm Beach, Florida',
    aliases: ['Palm Beach Florida', 'Palm Beach FL'],
    excluded_meanings: [
      'Palm Beach Australia',
      'Palm Beach County politics',
      'West Palm Beach city government',
    ],
    search_hints: [
      'events',
      'restaurant openings',
      'cultural programming',
      'seasonal dining',
      'nightlife',
      'art exhibitions',
      'polo',
      'yachting',
    ],
  },
  {
    destination_id: 'st-barts',
    country: 'Saint Barthélemy',
    region: 'French Caribbean',
    search_city: 'Gustavia',
    aliases: [
      'St. Barts',
      'St Barts',
      'St. Barth',
      'Saint Barthélemy',
      'Saint Barthelemy',
    ],
    excluded_meanings: [],
    search_hints: [
      'events',
      'restaurant openings',
      'yachting',
      'regattas',
      'festivals',
      'nightlife',
      'Gustavia',
      'cultural programming',
    ],
  },
  {
    destination_id: 'maldives',
    country: 'Maldives',
    region: 'Indian Ocean',
    search_city: 'Malé',
    aliases: ['Maldives', 'Maldive Islands', 'Male Maldives', 'Malé Maldives'],
    excluded_meanings: [
      'Maldives politics',
      'Maldives parliament',
      'Maldives elections',
    ],
    search_hints: [
      'resort openings',
      'restaurant openings',
      'beach clubs',
      'diving events',
      'culinary events',
      'cultural programming',
      'regattas',
      'nightlife',
    ],
  },
  {
    destination_id: 'harbour-island',
    country: 'Bahamas',
    region: 'North Eleuthera',
    search_city: 'Harbour Island, Bahamas',
    aliases: [
      'Harbour Island Bahamas',
      'Harbor Island Bahamas',
      'North Eleuthera',
    ],
    excluded_meanings: [
      'Harbour Island Bermuda',
      'Harbor Island Tampa',
      'Harbor Island South Carolina',
    ],
    search_hints: [
      'events',
      'restaurant openings',
      'regattas',
      'festivals',
      'nightlife',
      'cultural programming',
      'Bahamas travel',
    ],
  },
];

const HAND_TUNED_BY_ID = new Map(
  HAND_TUNED_NEWS_CONFIGS.map((config) => [config.destination_id, config]),
);

const US_REGIONS = new Set([
  'Colorado Rockies',
  'Wyoming',
  'New York',
  'Massachusetts',
  'Florida',
  'Florida Panhandle',
  'Rhode Island',
  'South Carolina',
  'Idaho',
  'California',
  'New Mexico',
]);

const SKI_DESTINATION_IDS = new Set([
  'aspen',
  'courchevel',
  'st-moritz',
  'jackson-hole',
  'verbier',
  'megeve-chamonix',
  'whistler',
  'sun-valley',
]);

const COASTAL_YACHTING_REGIONS = new Set([
  'Caribbean',
  'British Caribbean',
  'French Caribbean',
  'Bahamas',
  'Balearic Islands',
  'Greek Islands',
  'Sardinia',
  'Campania, Italy',
  'Sicily, Italy',
  "Côte d'Azur",
  'Florida',
  'Florida Panhandle',
  'Massachusetts',
  'Rhode Island',
  'South Carolina',
  'Riviera Maya',
  'Baja California Sur',
  'Riviera Nayarit, Mexico',
  'Oaxaca, Mexico',
  'Uruguay',
  'Maldives',
  'Thailand',
  'Indonesia',
]);

function deriveCountry(dest) {
  const { region, id } = dest;

  const directCountryRegions = {
    Portugal: 'Portugal',
    Morocco: 'Morocco',
    Uruguay: 'Uruguay',
    Thailand: 'Thailand',
    Maldives: 'Maldives',
    Indonesia: 'Indonesia',
    'United Arab Emirates': 'United Arab Emirates',
    'Dominican Republic': 'Dominican Republic',
    Bahamas: 'Bahamas',
    // Expansion 2026 — region maps directly to a country/news market
    'Cayman Islands': 'Cayman Islands',
    'US Virgin Islands': 'United States Virgin Islands',
    'St. Kitts & Nevis': 'Saint Kitts and Nevis',
    Grenadines: 'Saint Vincent and the Grenadines',
    'St. Lucia': 'Saint Lucia',
    'British Virgin Islands': 'British Virgin Islands',
    Bermuda: 'Bermuda',
    Grenada: 'Grenada',
    Jamaica: 'Jamaica',
    'Turkish Riviera': 'Turkey',
    Croatia: 'Croatia',
    'Costa del Sol': 'Spain',
    'Basque Coast': 'France',
    Seychelles: 'Seychelles',
    Mauritius: 'Mauritius',
    Tanzania: 'Tanzania',
    Botswana: 'Botswana',
    Zambezi: 'Zimbabwe',
    Hawaii: 'United States',
    'French Polynesia': 'French Polynesia',
  };
  if (directCountryRegions[region]) return directCountryRegions[region];
  if (region.endsWith(', Italy')) return 'Italy';
  if (region.includes('Mexico')) return 'Mexico';
  if (US_REGIONS.has(region)) return 'United States';
  if (region === 'French Alps' || region === "Côte d'Azur") return 'France';
  if (region === 'Swiss Alps') return 'Switzerland';
  if (region === 'British Columbia') return 'Canada';
  if (region === 'Balearic Islands') return 'Spain';
  if (region === 'Greek Islands') return 'Greece';
  if (region === 'Sardinia') return 'Italy';
  if (region === 'Corsica') return 'France';
  if (region === 'Baja California Sur' || region === 'Riviera Maya') return 'Mexico';
  if (id === 'turks-caicos') return 'Turks & Caicos';
  if (id === 'mustique') return 'Saint Vincent and the Grenadines';
  if (id === 'barbados') return 'Barbados';
  if (id === 'antigua') return 'Antigua';
  if (id === 'anguilla') return 'Anguilla';

  return '';
}

const ALIAS_OVERRIDES = {
  'turks-caicos': ['Turks & Caicos', 'Turks and Caicos', 'Providenciales'],
  tulum: ['Tulum', 'Cancún', 'Cancun'],
  'puerto-vallarta': ['Puerto Vallarta', 'Punta Mita'],
};

function deriveAliasesFromName(dest) {
  const { id, name } = dest;
  const aliases = [];

  const overrideAliases = ALIAS_OVERRIDES[id];
  if (overrideAliases) {
    aliases.push(...overrideAliases);
  }

  const parenthetical = name.match(/\(([^)]+)\)/g);
  if (parenthetical) {
    for (const match of parenthetical) {
      let value = match.slice(1, -1).trim();
      if (!value) continue;
      if (/^via\s+/i.test(value)) {
        value = value.replace(/^via\s+/i, '').trim();
      }
      if (/ area$/i.test(value)) continue;
      if (value) aliases.push(value);
    }
  }

  const slashParts = name.split('/').map((part) => part.replace(/\([^)]*\)/g, '').trim());
  if (slashParts.length > 1) {
    for (const part of slashParts) {
      if (part) aliases.push(part);
    }
  }

  const displayNormalized = name.toLowerCase().trim();
  const normalized = new Set();
  const out = [];
  for (const alias of aliases) {
    const trimmed = String(alias).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (key === displayNormalized) continue;
    if (!normalized.has(key)) {
      normalized.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

function buildSupplementalSearchHints(dest) {
  const hints = [];
  if (SKI_DESTINATION_IDS.has(dest.id)) {
    hints.push('ski events');
  }
  if (COASTAL_YACHTING_REGIONS.has(dest.region)) {
    hints.push('yachting', 'regattas');
  }
  return hints;
}

function mergeSearchHints(baseHints, supplementalHints) {
  const seen = new Set();
  const merged = [];
  for (const hint of [...baseHints, ...supplementalHints]) {
    const normalized = String(hint).trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(String(hint).trim());
  }
  return merged;
}

function buildDefaultNewsConfig(dest) {
  const supplementalHints = buildSupplementalSearchHints(dest);
  return {
    destination_id: dest.id,
    country: deriveCountry(dest),
    region: dest.region,
    search_city: dest.name,
    aliases: deriveAliasesFromName(dest),
    excluded_meanings: [],
    search_hints: mergeSearchHints(DEFAULT_EVENT_SCENE_SEARCH_HINTS, supplementalHints),
  };
}

export const DESTINATION_NEWS_CONFIGS = DESTINATIONS.map((dest) => {
  const handTuned = HAND_TUNED_BY_ID.get(dest.id);
  if (handTuned) {
    return { ...handTuned };
  }
  return buildDefaultNewsConfig(dest);
});

const seenIds = new Set();
for (const config of DESTINATION_NEWS_CONFIGS) {
  if (!config.destination_id || String(config.destination_id).trim() === '') {
    throw new Error('Blank news destination_id in configuration.');
  }
  if (seenIds.has(config.destination_id)) {
    throw new Error(`Duplicate news destination_id: ${config.destination_id}`);
  }
  seenIds.add(config.destination_id);

  const publicDest = PUBLIC_DESTINATION_BY_ID.get(config.destination_id);
  if (!publicDest) {
    throw new Error(
      `News destination_id not found in public DESTINATIONS: ${config.destination_id}`,
    );
  }
  if (!publicDest.name || String(publicDest.name).trim() === '') {
    throw new Error(`Blank destination name for id: ${config.destination_id}`);
  }
  if (!config.search_city || String(config.search_city).trim() === '') {
    throw new Error(`Blank search_city for id: ${config.destination_id}`);
  }
  if (!config.country || String(config.country).trim() === '') {
    throw new Error(`Blank country for id: ${config.destination_id}`);
  }
  if (!config.region || String(config.region).trim() === '') {
    throw new Error(`Blank region for id: ${config.destination_id}`);
  }
}

export const DESTINATION_NEWS_DESTINATION_IDS = DESTINATION_NEWS_CONFIGS.map(
  (c) => c.destination_id,
);

export const DESTINATION_NEWS_DESTINATION_COUNT = DESTINATION_NEWS_CONFIGS.length;

export const PILOT_DESTINATION_IDS = DESTINATION_NEWS_DESTINATION_IDS;
export const PILOT_DESTINATION_COUNT = DESTINATION_NEWS_DESTINATION_COUNT;

const DESTINATION_NEWS_CONFIG_BY_ID = new Map(
  DESTINATION_NEWS_CONFIGS.map((config) => {
    const publicDest = PUBLIC_DESTINATION_BY_ID.get(config.destination_id);
    return [
      config.destination_id,
      {
        ...config,
        destination_name: publicDest.name,
      },
    ];
  }),
);

export function getDestinationNewsConfigById(destinationId) {
  return DESTINATION_NEWS_CONFIG_BY_ID.get(destinationId) ?? null;
}

export function getDestinationNewsConfigsInOrder(limit = null) {
  const configs = DESTINATION_NEWS_CONFIGS.map((config) =>
    DESTINATION_NEWS_CONFIG_BY_ID.get(config.destination_id),
  );
  if (limit == null) return configs;
  return configs.slice(0, limit);
}

export function isDestinationNewsId(destinationId) {
  return DESTINATION_NEWS_CONFIG_BY_ID.has(destinationId);
}

export function getPilotConfigById(destinationId) {
  return getDestinationNewsConfigById(destinationId);
}

export function getPilotConfigsInOrder(limit = null) {
  return getDestinationNewsConfigsInOrder(limit);
}

export function isPilotDestinationId(destinationId) {
  return isDestinationNewsId(destinationId);
}
