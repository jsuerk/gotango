import { DESTINATIONS } from './destinations.config.js';

export const NEWS_PRICING_VERSION = '2026-06-10';

export const NEWS_SOURCE_MAX_AGE_DAYS = 60;

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

const PILOT_NEWS_CONFIGS = [
  {
    destination_id: 'ibiza',
    country: 'Spain',
    region: 'Balearic Islands',
    search_city: 'Ibiza',
    aliases: ['Ibiza', 'Eivissa'],
    excluded_meanings: [],
    search_hints: [
      'luxury travel',
      'hotels',
      'restaurants',
      'nightlife',
      'events',
      'air access',
      'marinas',
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
      'luxury travel',
      'hotels',
      'restaurants',
      'cultural events',
      'seasonal travel',
      'Palm Beach International Airport',
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
      'luxury travel',
      'hotels',
      'restaurants',
      'yachts',
      'events',
      'Gustavia',
      'travel access',
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
      'luxury resorts',
      'private islands',
      'hotel openings',
      'air access',
      'seaplanes',
      'travel conditions',
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
      'luxury travel',
      'hotels',
      'restaurants',
      'events',
      'North Eleuthera Airport',
      'Bahamas travel',
    ],
  },
];

const seenIds = new Set();
for (const config of PILOT_NEWS_CONFIGS) {
  if (seenIds.has(config.destination_id)) {
    throw new Error(`Duplicate news pilot destination_id: ${config.destination_id}`);
  }
  seenIds.add(config.destination_id);

  const publicDest = PUBLIC_DESTINATION_BY_ID.get(config.destination_id);
  if (!publicDest) {
    throw new Error(
      `News pilot destination_id not found in public DESTINATIONS: ${config.destination_id}`,
    );
  }
}

export const PILOT_DESTINATION_IDS = PILOT_NEWS_CONFIGS.map((c) => c.destination_id);

export const PILOT_DESTINATION_COUNT = PILOT_NEWS_CONFIGS.length;

const PILOT_CONFIG_BY_ID = new Map(
  PILOT_NEWS_CONFIGS.map((config) => {
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

export function getPilotConfigById(destinationId) {
  return PILOT_CONFIG_BY_ID.get(destinationId) ?? null;
}

export function getPilotConfigsInOrder(limit = null) {
  const configs = PILOT_NEWS_CONFIGS.map((config) => PILOT_CONFIG_BY_ID.get(config.destination_id));
  if (limit == null) return configs;
  return configs.slice(0, limit);
}

export function isPilotDestinationId(destinationId) {
  return PILOT_CONFIG_BY_ID.has(destinationId);
}
