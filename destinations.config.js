export const DESTINATIONS = [
  {
    id: 'st-barts',
    name: 'St. Barthélemy',
    region: 'French Caribbean',
    icao: ['TFFJ'],
    lat: 17.9047,
    lng: -62.8442,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'turks-caicos',
    name: 'Turks & Caicos (Providenciales)',
    region: 'Caribbean',
    icao: ['MBPV'],
    lat: 21.7736,
    lng: -72.2659,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'anguilla',
    name: 'Anguilla',
    region: 'British Caribbean',
    icao: ['TQPF'],
    lat: 18.2049,
    lng: -63.0551,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'mustique',
    name: 'Mustique',
    region: 'Caribbean',
    icao: ['TVSM'],
    lat: 12.8881,
    lng: -61.1801,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'harbour-island',
    name: "Harbour Island (North Eleuthera)",
    region: 'Bahamas',
    icao: ['MYEH'],
    lat: 25.4747,
    lng: -76.6835,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'mykonos',
    name: 'Mykonos',
    region: 'Greek Islands',
    icao: ['LGMK'],
    lat: 37.4351,
    lng: 25.3481,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'ibiza',
    name: 'Ibiza',
    region: 'Balearic Islands',
    icao: ['LEIB'],
    lat: 38.8729,
    lng: 1.3731,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'st-tropez',
    name: 'St. Tropez (La Mole)',
    region: "Côte d'Azur",
    icao: ['LFTZ'],
    lat: 43.2055,
    lng: 6.482,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'sardinia-olbia',
    name: 'Sardinia / Olbia',
    region: 'Sardinia',
    icao: ['LIEO'],
    lat: 40.8987,
    lng: 9.5176,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'aspen',
    name: 'Aspen',
    region: 'Colorado Rockies',
    icao: ['KASE'],
    lat: 39.2232,
    lng: -106.8687,
    season: ['winter', 'summer'],
    priority: 'tier-1',
  },
  {
    id: 'courchevel',
    name: 'Courchevel',
    region: 'French Alps',
    icao: ['LFLJ'],
    lat: 45.3967,
    lng: 6.6347,
    season: ['winter'],
    priority: 'tier-1',
  },
  {
    id: 'st-moritz',
    name: 'St. Moritz (Samedan)',
    region: 'Swiss Alps',
    icao: ['LSZS'],
    lat: 46.534,
    lng: 9.8842,
    season: ['winter'],
    priority: 'tier-2',
  },
  {
    id: 'jackson-hole',
    name: 'Jackson Hole',
    region: 'Wyoming',
    icao: ['KJAC', 'KDIJ'],
    lat: 43.6073,
    lng: -110.7377,
    season: ['winter', 'summer'],
    priority: 'tier-1',
  },
  {
    id: 'hamptons',
    name: 'Hamptons',
    region: 'New York',
    icao: ['KJPX', 'KFOK'],
    lat: 40.954,
    lng: -72.253,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'nantucket',
    name: 'Nantucket',
    region: 'Massachusetts',
    icao: ['KACK'],
    lat: 41.2531,
    lng: -70.0601,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'marthas-vineyard',
    name: "Martha's Vineyard",
    region: 'Massachusetts',
    icao: ['KMVY'],
    lat: 41.3893,
    lng: -70.6143,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'palm-beach',
    name: 'Palm Beach',
    region: 'Florida',
    icao: ['KPBI'],
    lat: 26.6832,
    lng: -80.0956,
    season: ['winter'],
    priority: 'tier-1',
  },
  {
    id: 'tulum',
    name: 'Tulum & Cancún',
    region: 'Riviera Maya',
    icao: ['MMTO', 'MMUN'],
    lat: 20.2114,
    lng: -87.4654,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'cabo-san-lucas',
    name: 'Cabo San Lucas',
    region: 'Baja California Sur',
    icao: ['MMSD'],
    lat: 23.1518,
    lng: -109.7211,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'comporta',
    name: 'Comporta (Lisbon area)',
    region: 'Portugal',
    icao: ['LPMT'],
    lat: 38.4019,
    lng: -8.5947,
    season: ['year-round'],
    priority: 'tier-1',
  },

  // === CARIBBEAN EXPANSION ===
  {
    id: 'barbados',
    name: 'Barbados',
    region: 'Caribbean',
    icao: ['TBPB'],
    lat: 13.0746,
    lng: -59.4925,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'antigua',
    name: 'Antigua',
    region: 'Caribbean',
    icao: ['TAPA'],
    lat: 17.1367,
    lng: -61.7927,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'nassau',
    name: 'Nassau (Paradise Island)',
    region: 'Bahamas',
    icao: ['MYNN'],
    lat: 25.039,
    lng: -77.4663,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'exuma',
    name: 'Exuma',
    region: 'Bahamas',
    icao: ['MYEF'],
    lat: 23.5625,
    lng: -75.8779,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'casa-de-campo',
    name: 'Casa de Campo (La Romana)',
    region: 'Dominican Republic',
    icao: ['MDLR'],
    lat: 18.4507,
    lng: -68.9117,
    season: ['year-round'],
    priority: 'tier-2',
  },

  // === MEDITERRANEAN / EUROPE EXPANSION ===
  {
    id: 'capri-naples',
    name: 'Capri (via Naples)',
    region: 'Campania, Italy',
    icao: ['LIRN'],
    lat: 40.886,
    lng: 14.2908,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'amalfi-salerno',
    name: 'Amalfi Coast (Salerno)',
    region: 'Campania, Italy',
    icao: ['LIRI'],
    lat: 40.6203,
    lng: 14.9112,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'mallorca',
    name: 'Mallorca',
    region: 'Balearic Islands',
    icao: ['LEPA'],
    lat: 39.5517,
    lng: 2.7388,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'sicily-catania',
    name: 'Sicily (Catania)',
    region: 'Sicily, Italy',
    icao: ['LICC'],
    lat: 37.4668,
    lng: 15.0664,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'santorini',
    name: 'Santorini',
    region: 'Greek Islands',
    icao: ['LGSR'],
    lat: 36.3992,
    lng: 25.4793,
    season: ['summer'],
    priority: 'tier-1',
  },

  // === ALPINE EXPANSION ===
  {
    id: 'verbier',
    name: 'Verbier (via Sion)',
    region: 'Swiss Alps',
    icao: ['LSGS'],
    lat: 46.2196,
    lng: 7.3267,
    season: ['winter'],
    priority: 'tier-2',
  },
  {
    id: 'megeve-chamonix',
    name: 'Megève / Chamonix',
    region: 'French Alps',
    icao: ['LFLB'],
    lat: 45.6381,
    lng: 5.8800,
    season: ['winter'],
    priority: 'tier-2',
  },
  {
    id: 'whistler',
    name: 'Whistler (via Vancouver)',
    region: 'British Columbia',
    icao: ['CYVR'],
    lat: 49.1939,
    lng: -123.1844,
    season: ['winter', 'summer'],
    priority: 'tier-2',
  },

  // === US EAST / SUMMER ===
  {
    id: 'cape-cod',
    name: 'Cape Cod (Hyannis)',
    region: 'Massachusetts',
    icao: ['KHYA'],
    lat: 41.6693,
    lng: -70.2804,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'block-island',
    name: 'Block Island',
    region: 'Rhode Island',
    icao: ['KBID'],
    lat: 41.1681,
    lng: -71.5778,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'hilton-head',
    name: 'Hilton Head',
    region: 'South Carolina',
    icao: ['KHXD'],
    lat: 32.2244,
    lng: -80.6975,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'charleston',
    name: 'Charleston',
    region: 'South Carolina',
    icao: ['KCHS'],
    lat: 32.8986,
    lng: -80.0405,
    season: ['year-round'],
    priority: 'tier-1',
  },

  // === US WEST ===
  {
    id: 'sun-valley',
    name: 'Sun Valley (Hailey)',
    region: 'Idaho',
    icao: ['KSUN'],
    lat: 43.5044,
    lng: -114.2961,
    season: ['winter', 'summer'],
    priority: 'tier-2',
  },
  {
    id: 'napa',
    name: 'Napa Valley',
    region: 'California',
    icao: ['KAPC'],
    lat: 38.2132,
    lng: -122.2807,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'santa-fe',
    name: 'Santa Fe',
    region: 'New Mexico',
    icao: ['KSAF'],
    lat: 35.6171,
    lng: -106.0894,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'coronado-san-diego',
    name: 'Coronado / San Diego',
    region: 'California',
    icao: ['KSAN'],
    lat: 32.7336,
    lng: -117.1897,
    season: ['year-round'],
    priority: 'tier-2',
  },

  // === US GULF ===
  {
    id: 'destin-30a',
    name: 'Destin / 30A',
    region: 'Florida Panhandle',
    icao: ['KDTS'],
    lat: 30.4001,
    lng: -86.4715,
    season: ['summer'],
    priority: 'tier-2',
  },

  // === MEXICO ===
  {
    id: 'puerto-vallarta',
    name: 'Puerto Vallarta & Punta Mita',
    region: 'Riviera Nayarit, Mexico',
    icao: ['MMPR'],
    lat: 20.6801,
    lng: -105.2542,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'puerto-escondido',
    name: 'Puerto Escondido',
    region: 'Oaxaca, Mexico',
    icao: ['MMPS'],
    lat: 15.8769,
    lng: -97.0892,
    season: ['year-round'],
    priority: 'tier-2',
  },

  // === ASIA-PACIFIC ===
  {
    id: 'phuket',
    name: 'Phuket',
    region: 'Thailand',
    icao: ['VTSP'],
    lat: 8.1132,
    lng: 98.3169,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'maldives',
    name: 'Maldives (Malé)',
    region: 'Maldives',
    icao: ['VRMM'],
    lat: 4.1918,
    lng: 73.529,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'bali',
    name: 'Bali (Denpasar)',
    region: 'Indonesia',
    icao: ['WADD'],
    lat: -8.7482,
    lng: 115.1672,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'koh-samui',
    name: 'Koh Samui',
    region: 'Thailand',
    icao: ['VTSM'],
    lat: 9.5479,
    lng: 100.0623,
    season: ['year-round'],
    priority: 'tier-2',
  },

  // === MIDDLE EAST ===
  {
    id: 'dubai-private',
    name: 'Dubai (Al Maktoum)',
    region: 'United Arab Emirates',
    icao: ['OMDW'],
    lat: 24.8964,
    lng: 55.1614,
    season: ['year-round'],
    priority: 'tier-1',
  },

  // === SOUTH AMERICA ===
  {
    id: 'punta-del-este',
    name: 'Punta del Este',
    region: 'Uruguay',
    icao: ['SULS'],
    lat: -34.855,
    lng: -55.0942,
    season: ['summer-southern'],
    priority: 'tier-2',
  },

  // === AFRICA ===
  {
    id: 'marrakech',
    name: 'Marrakech',
    region: 'Morocco',
    icao: ['GMMX'],
    lat: 31.6069,
    lng: -8.0363,
    season: ['year-round'],
    priority: 'tier-1',
  },

  // === EXPANSION 2026: CARIBBEAN / ATLANTIC ===
  {
    id: 'grand-cayman',
    name: 'Grand Cayman',
    region: 'Cayman Islands',
    icao: ['MWCR'],
    lat: 19.2928,
    lng: -81.3577,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'st-thomas',
    name: 'St. Thomas & St. John',
    region: 'US Virgin Islands',
    icao: ['TIST'],
    lat: 18.3373,
    lng: -64.9734,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'st-kitts-nevis',
    name: 'St. Kitts & Nevis',
    region: 'St. Kitts & Nevis',
    icao: ['TKPK', 'TKPN'],
    lat: 17.3112,
    lng: -62.7187,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'canouan',
    name: 'Canouan',
    region: 'Grenadines',
    icao: ['TVSC'],
    lat: 12.699,
    lng: -61.3424,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'st-lucia',
    name: 'St. Lucia',
    region: 'St. Lucia',
    icao: ['TLPL', 'TLPC'],
    lat: 13.7332,
    lng: -60.9527,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'bvi-virgin-gorda',
    name: 'Virgin Gorda & BVI',
    region: 'British Virgin Islands',
    icao: ['TUPW', 'TUPJ'],
    lat: 18.4464,
    lng: -64.4275,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'bermuda',
    name: 'Bermuda',
    region: 'Bermuda',
    icao: ['TXKF'],
    lat: 32.364,
    lng: -64.6787,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'grenada',
    name: 'Grenada',
    region: 'Grenada',
    icao: ['TGPY'],
    lat: 12.0042,
    lng: -61.7862,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'montego-bay',
    name: 'Montego Bay',
    region: 'Jamaica',
    icao: ['MKJS'],
    lat: 18.5037,
    lng: -77.9134,
    season: ['year-round'],
    priority: 'tier-1',
  },

  // === EXPANSION 2026: EUROPE / MEDITERRANEAN ===
  {
    id: 'bodrum',
    name: 'Bodrum',
    region: 'Turkish Riviera',
    icao: ['LTFE'],
    lat: 37.2506,
    lng: 27.6643,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'dalaman-gocek',
    name: 'Dalaman & Göcek',
    region: 'Turkish Riviera',
    icao: ['LTBS'],
    lat: 36.7131,
    lng: 28.7925,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'corsica-figari',
    name: 'Corsica (Figari)',
    region: 'Corsica',
    icao: ['LFKF'],
    lat: 41.5006,
    lng: 9.0978,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'menorca',
    name: 'Menorca',
    region: 'Balearic Islands',
    icao: ['LEMH'],
    lat: 39.8626,
    lng: 4.2186,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'split-hvar',
    name: 'Split & Hvar',
    region: 'Croatia',
    icao: ['LDSP'],
    lat: 43.5389,
    lng: 16.298,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'dubrovnik',
    name: 'Dubrovnik',
    region: 'Croatia',
    icao: ['LDDU'],
    lat: 42.5614,
    lng: 18.2682,
    season: ['summer'],
    priority: 'tier-1',
  },
  {
    id: 'paros',
    name: 'Páros',
    region: 'Greek Islands',
    icao: ['LGPA'],
    lat: 37.0203,
    lng: 25.113,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'corfu',
    name: 'Corfu',
    region: 'Greek Islands',
    icao: ['LGKR'],
    lat: 39.6019,
    lng: 19.9117,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'marbella-malaga',
    name: 'Marbella (Málaga)',
    region: 'Costa del Sol',
    icao: ['LEMG'],
    lat: 36.6749,
    lng: -4.4991,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'biarritz',
    name: 'Biarritz',
    region: 'Basque Coast',
    icao: ['LFBZ'],
    lat: 43.4684,
    lng: -1.5311,
    season: ['summer'],
    priority: 'tier-2',
  },
  {
    id: 'puglia-brindisi',
    name: 'Puglia (Brindisi)',
    region: 'Puglia, Italy',
    icao: ['LIBR'],
    lat: 40.6576,
    lng: 17.947,
    season: ['summer'],
    priority: 'tier-2',
  },

  // === EXPANSION 2026: AFRICA / INDIAN OCEAN ===
  {
    id: 'seychelles',
    name: 'Seychelles',
    region: 'Seychelles',
    icao: ['FSIA'],
    lat: -4.6743,
    lng: 55.5218,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'mauritius',
    name: 'Mauritius',
    region: 'Mauritius',
    icao: ['FIMP'],
    lat: -20.4302,
    lng: 57.6836,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'zanzibar',
    name: 'Zanzibar',
    region: 'Tanzania',
    icao: ['HTZA'],
    lat: -6.222,
    lng: 39.2249,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'maun-okavango',
    name: 'Maun & Okavango Delta',
    region: 'Botswana',
    icao: ['FBMN'],
    lat: -19.9726,
    lng: 23.4311,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'victoria-falls',
    name: 'Victoria Falls & Livingstone',
    region: 'Zambezi',
    icao: ['FVFA', 'FLLI'],
    lat: -18.0959,
    lng: 25.839,
    season: ['year-round'],
    priority: 'tier-2',
  },

  // === EXPANSION 2026: HAWAII / PACIFIC ===
  {
    id: 'maui',
    name: 'Maui',
    region: 'Hawaii',
    icao: ['PHOG', 'PHJH'],
    lat: 20.8986,
    lng: -156.4305,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'kona',
    name: 'Kona & Kohala Coast',
    region: 'Hawaii',
    icao: ['PHKO'],
    lat: 19.7388,
    lng: -156.0456,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'kauai',
    name: 'Kauai',
    region: 'Hawaii',
    icao: ['PHLI'],
    lat: 21.976,
    lng: -159.339,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'oahu',
    name: 'Oahu (Honolulu)',
    region: 'Hawaii',
    icao: ['PHNL'],
    lat: 21.3187,
    lng: -157.9224,
    season: ['year-round'],
    priority: 'tier-1',
  },
  {
    id: 'lanai',
    name: 'Lanai',
    region: 'Hawaii',
    icao: ['PHNY'],
    lat: 20.7856,
    lng: -156.9514,
    season: ['year-round'],
    priority: 'tier-2',
  },
  {
    id: 'tahiti',
    name: 'Tahiti & French Polynesia',
    region: 'French Polynesia',
    icao: ['NTAA'],
    lat: -17.5537,
    lng: -149.6068,
    season: ['year-round'],
    priority: 'tier-1',
  },
];

export const PEER_DESTINATIONS = {
  'st-barts': ['mustique', 'anguilla', 'harbour-island'],
  'mustique': ['st-barts', 'anguilla', 'harbour-island'],
  'anguilla': ['st-barts', 'turks-caicos', 'mustique'],
  'turks-caicos': ['anguilla', 'harbour-island', 'st-barts'],
  'harbour-island': ['turks-caicos', 'mustique', 'anguilla'],
  mykonos: ['ibiza', 'st-tropez', 'sardinia-olbia'],
  ibiza: ['mykonos', 'st-tropez', 'sardinia-olbia'],
  'st-tropez': ['sardinia-olbia', 'ibiza', 'mykonos'],
  'sardinia-olbia': ['st-tropez', 'mykonos', 'ibiza'],
  aspen: ['jackson-hole', 'courchevel', 'st-moritz'],
  courchevel: ['st-moritz', 'aspen', 'jackson-hole'],
  'st-moritz': ['courchevel', 'aspen', 'jackson-hole'],
  'jackson-hole': ['aspen', 'st-moritz', 'courchevel'],
  hamptons: ['nantucket', 'marthas-vineyard', 'palm-beach'],
  nantucket: ['marthas-vineyard', 'hamptons', 'palm-beach'],
  'marthas-vineyard': ['nantucket', 'hamptons', 'palm-beach'],
  'palm-beach': ['hamptons', 'cabo-san-lucas', 'tulum'],
  tulum: ['cabo-san-lucas', 'palm-beach', 'turks-caicos'],
  'cabo-san-lucas': ['tulum', 'palm-beach', 'st-barts'],
  comporta: ['st-tropez', 'ibiza', 'mykonos'],

  // Caribbean expansion peers
  barbados: ['antigua', 'st-barts', 'mustique'],
  antigua: ['barbados', 'st-barts', 'anguilla'],
  nassau: ['exuma', 'harbour-island', 'turks-caicos'],
  exuma: ['nassau', 'harbour-island', 'mustique'],
  'casa-de-campo': ['nassau', 'turks-caicos', 'palm-beach'],

  // Mediterranean expansion peers
  'capri-naples': ['amalfi-salerno', 'sicily-catania', 'sardinia-olbia'],
  'amalfi-salerno': ['capri-naples', 'sicily-catania', 'sardinia-olbia'],
  mallorca: ['ibiza', 'sardinia-olbia', 'st-tropez'],
  'sicily-catania': ['capri-naples', 'amalfi-salerno', 'sardinia-olbia'],
  santorini: ['mykonos', 'ibiza', 'sardinia-olbia'],

  // Alpine expansion peers
  verbier: ['st-moritz', 'courchevel', 'megeve-chamonix'],
  'megeve-chamonix': ['courchevel', 'verbier', 'st-moritz'],
  whistler: ['aspen', 'jackson-hole', 'sun-valley'],

  // US East / Summer peers
  'cape-cod': ['nantucket', 'marthas-vineyard', 'hamptons'],
  'block-island': ['nantucket', 'marthas-vineyard', 'cape-cod'],
  'hilton-head': ['charleston', 'palm-beach', 'destin-30a'],
  charleston: ['hilton-head', 'palm-beach', 'destin-30a'],

  // US West peers
  'sun-valley': ['jackson-hole', 'aspen', 'whistler'],
  napa: ['coronado-san-diego', 'santa-fe', 'cabo-san-lucas'],
  'santa-fe': ['aspen', 'sun-valley', 'napa'],
  'coronado-san-diego': ['napa', 'cabo-san-lucas', 'palm-beach'],

  // US Gulf peers
  'destin-30a': ['charleston', 'hilton-head', 'palm-beach'],

  // Mexico peers (note: cancun is merged with tulum, not its own entry)
  'puerto-vallarta': ['cabo-san-lucas', 'tulum', 'puerto-escondido'],
  'puerto-escondido': ['tulum', 'puerto-vallarta', 'cabo-san-lucas'],

  // Asia-Pacific peers
  phuket: ['koh-samui', 'bali', 'maldives'],
  maldives: ['phuket', 'bali', 'mustique'],
  bali: ['phuket', 'koh-samui', 'maldives'],
  'koh-samui': ['phuket', 'bali', 'maldives'],

  // Middle East peers
  'dubai-private': ['maldives', 'marrakech', 'phuket'],

  // South America peers
  'punta-del-este': ['cabo-san-lucas', 'tulum', 'casa-de-campo'],

  // Africa peers
  marrakech: ['comporta', 'mallorca', 'dubai-private'],

  // === EXPANSION 2026 peers ===
  // Caribbean / Atlantic
  'grand-cayman': ['montego-bay', 'turks-caicos', 'st-lucia'],
  'st-thomas': ['bvi-virgin-gorda', 'st-kitts-nevis', 'anguilla'],
  'st-kitts-nevis': ['antigua', 'st-thomas', 'grenada'],
  canouan: ['mustique', 'st-lucia', 'grenada'],
  'st-lucia': ['grenada', 'canouan', 'barbados'],
  'bvi-virgin-gorda': ['st-thomas', 'anguilla', 'st-barts'],
  bermuda: ['palm-beach', 'turks-caicos', 'nantucket'],
  grenada: ['st-lucia', 'canouan', 'barbados'],
  'montego-bay': ['grand-cayman', 'turks-caicos', 'nassau'],

  // Europe / Mediterranean
  bodrum: ['dalaman-gocek', 'mykonos', 'paros'],
  'dalaman-gocek': ['bodrum', 'mykonos', 'corfu'],
  'corsica-figari': ['sardinia-olbia', 'st-tropez', 'mallorca'],
  menorca: ['mallorca', 'ibiza', 'sardinia-olbia'],
  'split-hvar': ['dubrovnik', 'mykonos', 'corfu'],
  dubrovnik: ['split-hvar', 'corfu', 'mykonos'],
  paros: ['mykonos', 'santorini', 'bodrum'],
  corfu: ['split-hvar', 'dubrovnik', 'paros'],
  'marbella-malaga': ['mallorca', 'ibiza', 'comporta'],
  biarritz: ['comporta', 'st-tropez', 'marbella-malaga'],
  'puglia-brindisi': ['amalfi-salerno', 'capri-naples', 'sicily-catania'],

  // Africa / Indian Ocean
  seychelles: ['mauritius', 'maldives', 'zanzibar'],
  mauritius: ['seychelles', 'maldives', 'zanzibar'],
  zanzibar: ['maun-okavango', 'seychelles', 'mauritius'],
  'maun-okavango': ['victoria-falls', 'zanzibar', 'marrakech'],
  'victoria-falls': ['maun-okavango', 'zanzibar', 'marrakech'],

  // Hawaii / Pacific
  maui: ['kona', 'kauai', 'oahu'],
  kona: ['maui', 'kauai', 'oahu'],
  kauai: ['maui', 'kona', 'oahu'],
  oahu: ['maui', 'kona', 'kauai'],
  lanai: ['maui', 'kona', 'kauai'],
  tahiti: ['maldives', 'bali', 'maui'],
};

export const EDITORIAL_BLURBS = {
  'cabo-san-lucas':
    "Cabo is Baja's primary luxury gateway, serving both the classic Cabo resort corridor and the quieter East Cape. Its private-aviation signal is useful because the market is broad: resort travelers, villa owners, golf groups, fishing trips, and long-weekend escapes all show up in the data.\n\nFor Go Tango, Cabo is a benchmark destination. When its score rises, it often suggests more than a single event - it can point to a wider luxury-travel appetite across Southern California, Texas, the Mountain West, and Mexico's high-end leisure circuit.",
  'st-tropez':
    "St. Tropez is one of Europe's most recognizable summer status markets, but La Mole's runway keeps the aviation picture unusually selective. The airport favors smaller aircraft and more intentional arrivals, which makes the signal feel more curated than mass-market.\n\nFor Go Tango users, St. Tropez is a place where volume alone can miss the story. A move here is often about quality of traffic, origin mix, and whether the Riviera's private-travel crowd is arriving early, staying late, or shifting from neighboring Mediterranean markets.",
  'sardinia-olbia':
    "Olbia is the aviation gateway to Costa Smeralda, one of the Mediterranean's most established luxury coastlines. The signal is often shaped by Italian, German, Swiss, British, and broader European charter activity layered over yacht and villa demand.\n\nFor Go Tango, Sardinia is useful because it sits between pure resort traffic and broader Mediterranean movement. When the Index strengthens, it can suggest that the high-end summer circuit is spreading beyond the obvious party islands into more discreet coastal luxury.",
  ibiza:
    "Ibiza has two identities: the global club circuit and a quieter northern villa-and-wellness scene. That split makes it especially interesting for Go Tango because a strong signal can mean either obvious nightlife demand or a more discreet private-travel pattern beneath the surface.\n\nThe Index helps separate hype from momentum. If Ibiza is rising while other Balearic or Mediterranean markets are flat, it may suggest concentrated demand; if it cools while still showing high volume, the destination may remain busy but past peak intensity.",
  mallorca:
    "Mallorca is larger, more residential, and more commercially developed than Ibiza, which gives its private-aviation signal a different character. It tends to reflect second-home patterns, family travel, sailing, golf, and European long-stay demand rather than a single party calendar.\n\nFor Go Tango users, Mallorca can act as a stabilizer in the Balearics. A strong read here may suggest durable regional momentum, while a softer read can show when attention is shifting back toward more event-driven or scene-heavy Mediterranean destinations.",
  'marthas-vineyard':
    "Martha's Vineyard is a politically and culturally networked New England island with a summer rhythm distinct from Nantucket and the Hamptons. Private and semi-private service from Northeast origins reinforces its role as a high-touch seasonal market.\n\nFor Go Tango, the Vineyard is useful because it can reveal the movement of a quieter but influential crowd. A rising Index may suggest Washington, Boston, New York, and family-compound traffic building before it becomes obvious on the ground.",
  'sun-valley':
    "Sun Valley is Idaho's quiet-luxury anchor: less visible than Aspen or Jackson Hole, but with a serious private-travel clientele. Its signal is shaped by second homes, outdoor culture, finance and media circles, and a year-round preference for discretion.\n\nFor Go Tango users, Sun Valley is a destination where modest volume can still matter. A rising score may indicate that a highly selective audience is moving, even if raw arrivals look smaller than larger resort markets.",
  'harbour-island':
    "Harbour Island is small, polished, and highly social, with North Eleuthera serving as the practical aviation gateway. The appeal is not mass luxury; it is beach-house intimacy, pink-sand aesthetics, and a crowd that often overlaps with Palm Beach, New York, and the Bahamas villa circuit.\n\nFor Go Tango, Harbour Island is a classic 'small signal, high meaning' market. A move here may not produce massive volume, but it can reveal when a discreet island crowd is shifting toward the Bahamas' more boutique end.",
  antigua:
    "Antigua has a broader private-aviation footprint than many Caribbean islands, supported by resorts, yachting, sailing culture, and regional island-hopping. Its signal can capture both traditional Caribbean leisure and more mobile luxury travelers moving between islands.\n\nFor Go Tango users, Antigua is useful because it often behaves like a connector market. A stronger read may indicate not just local demand, but broader Caribbean momentum across villas, yachts, and multi-stop winter travel.",
  'jackson-hole':
    "Jackson Hole is one of the most important mountain luxury markets in North America. Its signal blends ski demand, summer national-park travel, ranch estates, finance-family traffic, and a private-aviation culture that extends well beyond peak winter.\n\nFor Go Tango, Jackson Hole is a clean read on high-end mountain demand. A rising score can suggest the Rockies are pulling attention, while a cooling score may show when the luxury traveler is rotating back toward coast, island, or international destinations.",
  'casa-de-campo':
    "Casa de Campo is the Dominican Republic's primary luxury anchor, with a resort ecosystem built around villas, golf, marina life, and private compounds. La Romana gives the market a more direct private-travel read than broader Punta Cana-style resort volume.\n\nFor Go Tango users, Casa de Campo is about concentrated wealth rather than broad tourism. A stronger signal here may indicate villa owners, family groups, and Caribbean regulars choosing a more self-contained luxury environment.",
  hamptons:
    "The Hamptons remain one of the densest private-aviation patterns in the world, shaped by short-hop aircraft, helicopter connections, summer-house rhythms, and New York wealth moving east. The signal is less about discovery and more about timing.\n\nFor Go Tango, the Hamptons are a control market. When the score shifts, it can reveal whether the core Northeast luxury crowd is staying local, moving offshore to Nantucket or the Vineyard, or rotating into longer-haul summer destinations.",
  'st-barts':
    "St. Barth is one of the purest private-travel status markets in the Caribbean, but its airport constraints make the signal unusually nuanced. Because larger jets cannot land directly and many travelers connect through nearby islands, the arrivals pattern reflects intent, planning, and aircraft suitability as much as raw demand.\n\nFor Go Tango users, St. Barth is a place where the Index matters more than simple volume. A strong read can suggest that the island's villa, yacht, and restaurant scene is drawing real movement, even when the aircraft mix looks different from larger jet airports.",
  nantucket:
    "Nantucket is a highly concentrated summer market with a distinct private-aviation rhythm from New York, Boston, and the broader Northeast. Its demand is seasonal, social, and deeply tied to family compounds, clubs, and repeat visitors.\n\nFor Go Tango, Nantucket is a useful lens on old-line summer luxury. When the Index rises, it may show the island pulling early or unusually broad traffic; when it cools, the Northeast crowd may be spreading toward the Vineyard, Cape, Hamptons, or farther afield.",
  'destin-30a':
    "Destin and 30A represent a Gulf Coast luxury market that has matured beyond traditional beach tourism. Seaside, Alys Beach, Rosemary Beach, and the surrounding corridor attract second-home owners, family groups, and high-end regional travelers.\n\nFor Go Tango users, 30A is valuable because it can show movement from Southern, Texas, and Midwest origin markets that may not register in the same way as coastal resort hubs. A rising score can point to a regional luxury wave building before it becomes visible on the ground.",
  'turks-caicos':
    "Providenciales is one of the Caribbean's most convenient private-aviation gateways, with full-service FBO access and a resort market built around villas, beaches, and controlled ease. It offers a cleaner aviation signal than many island chains because the luxury traffic concentrates around Provo.\n\nFor Go Tango, Turks & Caicos is a core Caribbean momentum read. If the score strengthens, it often suggests broad villa-and-resort demand rather than a single event; if it fades, the market may still be active but losing intensity against other islands.",
  marrakech:
    "Marrakech is North Africa's strongest luxury leisure signal, blending riads, design hotels, golf, desert excursions, and a European long-weekend pattern. It attracts a sophisticated traveler who may be choosing culture and atmosphere over beach repetition.\n\nFor Go Tango users, Marrakech is useful because it can show when luxury demand is rotating toward experiential travel. A rising Index may suggest a broader appetite for design, food, and cultural depth rather than only sand-and-sea destinations.",
  'hilton-head':
    "Hilton Head is a steady Southern luxury market built around golf, beach houses, family travel, and a relaxed resort rhythm. It does not need to behave like Palm Beach or the Hamptons to matter; its strength is consistency.\n\nFor Go Tango, Hilton Head is a useful 'quiet strength' destination. A rising score can show regional wealth moving into familiar, comfortable places - the kind of travel pattern that may not be flashy, but is highly durable.",
  'capri-naples':
    "Capri is one of the Mediterranean's iconic luxury islands, but Naples is the practical aviation gateway. That makes the signal broader than Capri alone: it can include Amalfi, Ischia, yacht traffic, coastal villas, and high-end Italian itineraries.\n\nFor Go Tango users, Capri is a proxy for Southern Italy's luxury pull. A stronger Index may suggest travelers are choosing classic Mediterranean glamour and boat-based itineraries, while a softer read can show attention shifting toward Sardinia, Greece, or the Balearics.",
  anguilla:
    "Anguilla is smaller, quieter, and more villa-driven than many Caribbean peers. It attracts travelers who want beach luxury without the crowd density or spectacle of more social islands.\n\nFor Go Tango, Anguilla is a subtle but useful signal. When the Index strengthens, it may indicate that high-end Caribbean demand is moving toward privacy, long stays, and lower-friction resort environments rather than scene-heavy destinations.",
  'amalfi-salerno':
    "The Amalfi Coast has always had luxury demand, but access has historically shaped how that demand appeared. Salerno gives the region a more direct aviation signal than relying only on Naples, making it easier to watch Southern Italy's coastal momentum.\n\nFor Go Tango users, Amalfi is a classic 'access changes the signal' destination. A stronger read may suggest that travelers are leaning into Italy's coastline and yacht-adjacent itineraries, while a softer read may show when the Mediterranean crowd is moving elsewhere.",
  'dubai-private':
    "Dubai's private-travel signal is different from a pure resort market because it blends business, luxury retail, events, family travel, and long-haul connectivity. Al Maktoum is especially useful for reading private aviation because it captures a segment of traffic that may not fit neatly into commercial airport patterns.\n\nFor Go Tango, Dubai is a global connector signal. A rising Index can suggest movement across the Middle East, Europe, India, and Africa - less 'vacation spike' and more high-end mobility across business and leisure.",
  'koh-samui':
    "Koh Samui is Thailand's more selective island signal, shaped by runway constraints, villas, wellness travel, and a quieter luxury profile than Phuket. Its appeal is less about scale and more about controlled access and resort intimacy.\n\nFor Go Tango users, Koh Samui is useful when the Index moves despite modest raw volume. A stronger read may suggest a higher-quality island signal, while cooling can show when Thailand demand is consolidating around larger gateways.",
  nassau:
    "Nassau is the Bahamas' most accessible luxury gateway, with Paradise Island, resorts, marinas, and nearby island connections all feeding into its traffic. Its signal is broader and more commercial than Harbour Island or Exuma, but still highly useful.\n\nFor Go Tango, Nassau helps distinguish baseline Bahamas demand from true movement into smaller islands. If Nassau rises while boutique islands also rise, the Bahamas may be broadly heating; if Nassau rises alone, the signal may be more access-driven than exclusive.",
  verbier:
    "Verbier's aviation signal is filtered through Sion, one of the key Swiss gateways for Valais ski resorts. That makes the read less about the airport alone and more about who is moving into the Alpine network.\n\nFor Go Tango users, Verbier is a refined winter and shoulder-season signal. A rising score may suggest demand for Swiss mountain privacy, serious skiing, and chalet-based travel rather than larger, more visible resort scenes.",
  courchevel:
    "Courchevel is one of the most constrained and distinctive aviation markets in the world. The altiport's short, steep runway and special operating requirements make arrivals highly selective, which gives the signal a different meaning than a standard airport count.\n\nFor Go Tango, Courchevel is a quality-over-volume destination. A move here can suggest very intentional luxury travel - the kind of signal that matters precisely because not every aircraft, pilot, or traveler can access it easily.",
  mustique:
    "Mustique operates closer to a private club than a conventional destination, with a fixed villa culture and controlled island rhythm. Its aviation signal is naturally small, but the audience behind it is highly concentrated.\n\nFor Go Tango users, Mustique is important because low volume can still be meaningful. A stronger read may indicate movement among a discreet Caribbean owner-and-villa crowd rather than broad tourism demand.",
  'st-moritz':
    "St. Moritz is served by Engadin Airport at Samedan, one of Europe's most distinctive alpine aviation gateways. The airport's location and operating environment make it a strong signal for high-end winter movement into the Engadin.\n\nFor Go Tango, St. Moritz is useful because the market is both seasonal and elite. A rising Index can show when the classic alpine luxury circuit is drawing traffic, while a softer read may suggest rotation toward France, Switzerland's Valais, or non-ski winter destinations.",
  comporta:
    "Comporta is Portugal's quiet Atlantic luxury play: design-forward, understated, and close enough to Lisbon to use broader airport infrastructure. The signal is less about one airfield and more about who is choosing Portugal's slower, coastal version of high-end travel.\n\nFor Go Tango users, Comporta is a useful emerging-luxury read. A strengthening Index may suggest that travelers are looking beyond the usual Mediterranean circuit toward privacy, architecture, food, and longer, quieter stays.",
  'puerto-escondido':
    "Puerto Escondido sits at the intersection of surf culture, design travel, and Mexico's growing boutique-luxury scene. It is not a traditional private-aviation powerhouse, which makes movement there more interesting when it appears.\n\nFor Go Tango, Puerto Escondido is a sleeper market. A rising score may signal early adoption by a creative, villa-oriented, or hospitality-curious crowd before the destination becomes fully mainstream.",
  bali:
    "Bali's aviation signal is broad because Denpasar serves everything from backpacker traffic to ultra-luxury villas, wellness resorts, surf trips, and long-stay digital nomads. The challenge is separating mass tourism from meaningful high-end movement.\n\nFor Go Tango users, the Index is valuable here because raw volume alone is noisy. A stronger score can suggest broader private-travel quality, origin diversity, or luxury demand beyond Bali's baseline popularity.",
  'coronado-san-diego':
    "Coronado and the broader San Diego luxury market are different from a remote resort island: they blend beach, military, biotech, family wealth, golf, and Southern California lifestyle travel. The aviation signal is steady, regional, and quietly affluent.\n\nFor Go Tango, Coronado is useful because it can show movement in a mature coastal market that rarely screams for attention. A rising Index may suggest stronger Southern California leisure demand without the volatility of more seasonal resort towns.",
  'cape-cod':
    "Hyannis serves as a practical aviation gateway for Cape Cod, Nantucket overflow, island connections, and traditional New England summer travel. Its signal can catch both destination traffic and movement through the Cape into nearby coastal markets.\n\nFor Go Tango users, Cape Cod is valuable as a regional pressure gauge. A rising score may suggest the Northeast summer circuit is broadening beyond the headline islands, while a softer read can show consolidation back into the Hamptons, Nantucket, or the Vineyard.",
  'block-island':
    "Block Island is a small, highly seasonal market with a single-airport footprint and a yachting-and-summer-house crowd. It is not built for scale, which makes any meaningful movement in the signal worth watching.\n\nFor Go Tango, Block Island is a micro-market. A stronger read may indicate that the Northeast summer crowd is spreading into more casual, understated coastal escapes rather than only the marquee destinations.",
  'megeve-chamonix':
    "Megève and Chamonix represent two different sides of the French Alps: old-money village luxury and serious mountain culture. Chambéry and nearby alpine gateways help capture movement into this wider Mont Blanc and Haute-Savoie corridor.\n\nFor Go Tango users, this is a useful read on Alpine demand beyond Courchevel. A strengthening signal may suggest broader interest in classic ski villages, mountaineering culture, and chalet-based travel rather than only the most famous luxury resorts.",
  phuket:
    "Phuket is Southeast Asia's broadest luxury island gateway, with private villas, five-star resorts, marina access, wellness, and regional connectivity. Its signal is bigger and noisier than Koh Samui, but that scale makes it important.\n\nFor Go Tango, Phuket helps show whether Southeast Asian beach luxury is heating broadly. If the Index rises with stronger origin diversity, it may point to real momentum rather than simple baseline tourism volume.",
  'palm-beach':
    "Palm Beach is one of the strongest private-aviation markets in the United States, supported by wealth migration, seasonal residences, finance, golf, family offices, and a year-round luxury infrastructure. PBI is a major business-aviation gateway with multiple FBO options.\n\nFor Go Tango users, Palm Beach is a core signal market. A move here can indicate whether the high-net-worth Florida circuit is intensifying, cooling, or simply holding steady as a baseline luxury hub.",
  whistler:
    "Whistler's signal is filtered through Vancouver, which means the read combines mountain travel, international access, Pacific Northwest wealth, and Canadian resort demand. It is less direct than Aspen or Jackson Hole, but still valuable.\n\nFor Go Tango, Whistler is useful because it shows movement into a globally known mountain destination through a major city gateway. A rising Index may suggest renewed attention to ski, outdoor, and summer alpine travel in Western Canada.",
  charleston:
    "Charleston has evolved from a historic Southern city into a broader luxury destination, with food, design, islands, golf, and second-home demand all contributing to its draw. Its signal is less seasonal than many beach markets and more lifestyle-driven.\n\nFor Go Tango users, Charleston is a refined domestic read. A stronger score may suggest travelers are choosing culture, restaurants, and coastal Southern ease over more obvious resort destinations.",
  napa:
    "Napa is wine country's primary private-aviation signal, with KAPC capturing traffic that bypasses San Francisco and Oakland for faster access to vineyards, estates, and resort properties. The market is intimate, premium, and highly intentional.\n\nFor Go Tango, Napa is a destination where modest arrivals can be meaningful. A rising Index may suggest stronger luxury leisure demand from the Bay Area, Southern California, Texas, or national wine-travel circles.",
  tulum:
    "The Riviera Maya is a layered market: Cancún brings broad access, while Tulum adds design, wellness, villas, and a more image-driven travel culture. The result is a signal that can show both mainstream resort volume and higher-end movement.\n\nFor Go Tango users, this market matters because it can reveal whether demand is spreading beyond Cancún into more boutique Riviera Maya patterns. A stronger Index may suggest villa, wellness, and lifestyle travel gaining traction.",
  'santa-fe':
    "Santa Fe is a small but distinct private-travel market built around art, design, landscape, food, and quiet second-home wealth. It does not need large volume to produce a meaningful signal.\n\nFor Go Tango, Santa Fe is a 'taste market.' A rising score may suggest movement from travelers choosing culture and atmosphere over traditional resort infrastructure - the kind of destination that often heats up quietly.",
  mykonos:
    "Mykonos is Greece's most visible summer luxury island, known for beach clubs, villas, nightlife, and a highly international crowd. Its airport can become a pressure point during peak season, which makes the timing of arrivals especially important.\n\nFor Go Tango users, Mykonos is a pure momentum destination. A rising Index can show when the Aegean party-and-villa circuit is accelerating; a cooling Index may suggest travelers are rotating toward quieter Greek islands or other Mediterranean markets.",
  maldives:
    "Malé is the gateway to a fragmented luxury archipelago where the final destination is often a resort island reached by seaplane or boat. That makes the aviation signal broader than any one property or atoll.\n\nFor Go Tango, the Maldives are useful because they reflect long-haul luxury intent. A stronger read may suggest travelers are willing to commit to distance, privacy, and high-end resort isolation rather than shorter-haul beach alternatives.",
  'punta-del-este':
    "Punta del Este is South America's signature summer resort market, with a sharp seasonal profile tied to Uruguay, Argentina, Brazil, and international second-home culture. Its signal often compresses into a shorter window than Northern Hemisphere resort markets.\n\nFor Go Tango users, Punta del Este is valuable because it reveals Southern Hemisphere luxury timing. A rising Index may show the region's social season forming; a cooling score can signal that the market is moving past its peak.",
  santorini:
    "Santorini is the Aegean's quieter, more romantic counterpart to Mykonos, with a stronger pull for couples, villas, views, and slower luxury. Its aviation signal can be more measured, but still meaningful during the Mediterranean season.\n\nFor Go Tango, Santorini helps separate Greece's scene-driven demand from its softer luxury demand. A rising score may suggest travelers are favoring atmosphere, privacy, and iconic scenery over nightlife intensity.",
  aspen:
    "Aspen is one of the clearest private-aviation signals in North America, with winter ski weeks, summer culture, real estate, finance, and family-office traffic all layered into one market. It is both a resort town and a social graph.\n\nFor Go Tango users, Aspen is a headline luxury indicator. A rising Index can suggest mountain demand is strengthening across a serious high-net-worth crowd; cooling can show when the same crowd rotates to coast, island, or international destinations.",
  barbados:
    "Barbados is one of the Caribbean's most established luxury markets, with British colonial bones, strong resort infrastructure, villas, golf, and increasing private-aviation support. Its signal is steadier and broader than smaller boutique islands.\n\nFor Go Tango, Barbados is a durable Caribbean read. A strengthening Index can suggest more than a short spike - it may point to sustained winter-sun demand across families, villa travelers, and repeat Caribbean regulars.",
  exuma:
    "Exuma is one of the Bahamas' most distinctive luxury signals, built around turquoise water, boating, villas, private islands, and a UHNW yachting crowd. It is less about scale and more about exclusivity and movement between islands.\n\nFor Go Tango users, Exuma is a sleeper-market favorite. A rising Index may suggest the Bahamas luxury crowd is shifting from accessible gateways toward more secluded, water-led itineraries.",
  'puerto-vallarta':
    "Puerto Vallarta provides the access, while Punta Mita supplies much of the high-end resort and villa pull. Together they form one of Mexico's most important Pacific luxury corridors, with golf, surf, beach clubs, and second-home demand.\n\nFor Go Tango, this market is useful because it captures both established resort travel and quieter Punta Mita-style wealth. A stronger signal can show Mexico's west coast gaining attention against Cabo, Tulum, and Caribbean alternatives.",
  'sicily-catania':
    "Catania is the gateway to eastern Sicily, including Taormina, Etna, coastal villas, and a growing luxury-hospitality profile. Sicily's appeal is different from Capri or Sardinia: more cultural, volcanic, culinary, and layered.\n\nFor Go Tango users, Sicily is a Mediterranean depth signal. A rising Index may suggest travelers are moving beyond the obvious island circuit toward places with more texture, food, history, and long-stay potential.",

  // === EXPANSION 2026 ===
  'grand-cayman':
    "Grand Cayman is the Caribbean's finance-and-beach hybrid: Seven Mile Beach resorts, villa compounds, diving, and one of the region's strongest FBO infrastructures. The signal blends offshore wealth, repeat winter-sun travelers, and a Cayman Islands circuit that often feels more operational than scene-driven.\n\nFor Go Tango, Grand Cayman is a core Caribbean benchmark. A rising Index may suggest broad villa-and-resort demand across the western Caribbean, while a softer read can show when attention is shifting toward smaller islands or eastern markets.",
  'st-thomas':
    "St. Thomas is the practical aviation gateway to the U.S. Virgin Islands, with St. John and the broader yachting corridor feeding off its access. The market mixes resort beaches, villa rentals, cruise spillover, and Northeast winter-sun traffic in a pattern that is more connected than boutique.\n\nFor Go Tango users, St. Thomas helps read the U.S. Caribbean gateway layer. A stronger signal may indicate that East Coast travelers are choosing convenient American-flag islands, while cooling can suggest rotation into the BVI, Puerto Rico alternatives, or farther-flung winter markets.",
  'st-kitts-nevis':
    "St. Kitts and Nevis pair a larger gateway island with Nevis's quieter villa-and-resort culture, including one of the Caribbean's most established luxury properties. The aviation signal is naturally smaller than Jamaica or Grand Cayman, but the audience behind it is often repeat and high-intent.\n\nFor Go Tango, this is a selective Caribbean read. A rising Index may suggest movement into the eastern island chain and Nevis-style long-stay luxury, even when raw arrivals look modest compared with larger hubs.",
  canouan:
    "Canouan is one of the Grenadines' most concentrated luxury plays: a small island built around a major resort, marina life, and golf rather than broad tourism volume. Its airport signal is tiny by design, which makes any meaningful movement worth watching closely.\n\nFor Go Tango users, Canouan is a micro-market with outsized meaning. A stronger read may indicate that the ultra-discreet Caribbean crowd is choosing the Grenadines over better-known islands, while low volume alone should not be mistaken for irrelevance.",
  'st-lucia':
    "St. Lucia combines dramatic resort geography, villa markets, and a dual-airport footprint that captures both long-haul leisure and regional island-hopping. The Pitons coastline gives the destination a distinct luxury identity beyond generic Caribbean beach demand.\n\nFor Go Tango, St. Lucia is a useful eastern-Caribbean momentum gauge. A rising Index may suggest broader winter-sun appetite across honeymoons, villas, and resort travel, while cooling can show when travelers are consolidating around easier gateways.",
  'bvi-virgin-gorda':
    "The British Virgin Islands are built around sailing, yacht charters, and villa compounds, with Virgin Gorda and nearby strips serving a highly mobile water-based crowd. The aviation signal is fragmented across small airfields rather than one large jet gateway.\n\nFor Go Tango users, the BVI are a yacht-circuit read. A stronger Index may suggest that Caribbean luxury is moving through boating itineraries and multi-island hops, while a softer signal can indicate consolidation back toward larger resort gateways.",
  bermuda:
    "Bermuda sits closer to the U.S. East Coast than most Caribbean markets, with pink-sand resorts, sailing culture, finance ties, and a summer rhythm that feels more Atlantic than tropical. Its private-aviation pattern often reflects convenience and repeat visitation rather than discovery travel.\n\nFor Go Tango, Bermuda is a Northeast shortcut market. A rising score may suggest regional wealth choosing a familiar offshore escape, while cooling can show when the same crowd is rotating farther south into the Caribbean proper.",
  grenada:
    "Grenada is a quieter southern-Caribbean signal shaped by spice-island culture, yachting, eco-resorts, and a smaller but loyal repeat audience. It does not need to compete on volume with Jamaica or Barbados to matter.\n\nFor Go Tango users, Grenada is a boutique Caribbean depth read. A stronger Index may suggest travelers are moving toward lower-density islands and longer, slower itineraries rather than headline resort hubs.",
  'montego-bay':
    "Montego Bay is Jamaica's primary private-aviation gateway, anchoring Rose Hall, villa corridors, golf, and the island's broader resort ecosystem. The signal is broader and more commercial than smaller Caribbean peers, but still highly useful for regional reads.\n\nFor Go Tango, Montego Bay helps track western-Caribbean momentum. A rising Index may suggest strong winter-sun demand across Jamaica and neighboring gateways, while cooling can show when travelers are choosing smaller islands or eastern alternatives.",
  bodrum:
    "Bodrum is the Turkish Riviera's yacht-and-villa capital, with a summer social circuit that blends gulet culture, beach clubs, and Aegean access. Milas-Bodrum captures intentional Mediterranean traffic rather than mass charter noise alone.\n\nFor Go Tango users, Bodrum is a key eastern-Mediterranean signal. A rising Index may suggest the summer circuit is strengthening beyond Greece and Croatia, while a softer read can show when Turkish Riviera demand is peaking or rotating west.",
  'dalaman-gocek':
    "Dalaman and Göcek serve a quieter Turkish Riviera corridor built around marinas, bays, and villa charters rather than Bodrum's scene intensity. The signal often reflects yacht itineraries, family groups, and European long-stay patterns.\n\nFor Go Tango, this market is useful as a softer Turkish Riviera counterpart. A stronger read may suggest travelers are choosing marina-led privacy over party coastlines, even when total arrivals look smaller than Bodrum.",
  'corsica-figari':
    "Figari opens southern Corsica: a coastline of coves, villas, and yacht traffic with a more discreet Mediterranean character than Sardinia's Costa Smeralda or the Balearic party circuit. The signal is seasonal and selective.\n\nFor Go Tango users, Corsica is a French-Mediterranean depth read. A rising Index may suggest the summer circuit is spreading into quieter coastal luxury, while cooling can show consolidation back toward Sardinia, the Riviera, or Greece.",
  menorca:
    "Menorca is the Balearics' understated sibling: lower density, stronger second-home and sailing culture, and a summer rhythm closer to family compounds than nightclub calendars. Its aviation signal is smaller than Mallorca or Ibiza, but often more residential.\n\nFor Go Tango, Menorca helps separate Balearic scene demand from durable island living. A stronger read may suggest European travelers want Mediterranean ease without Ibiza-scale intensity.",
  'split-hvar':
    "Split is the aviation gateway to Croatia's Dalmatian coast, with Hvar, yacht weeks, and villa demand feeding off its access. The signal blends Adriatic sailing culture, UNESCO old towns, and a fast-growing luxury-hospitality corridor.\n\nFor Go Tango users, Split-Hvar is a central Adriatic momentum read. A rising Index may suggest the eastern Mediterranean yacht circuit is heating beyond Greece, while cooling can show when attention shifts back toward Italian or western Med markets.",
  dubrovnik:
    "Dubrovnik combines walled-city glamour, yacht access, and a runway that can feel pressured during peak summer weeks. The market has matured beyond a single tourism boom into villas, cruises, and repeat European visitation.\n\nFor Go Tango, Dubrovnik is a high-visibility Adriatic signal. A stronger read may suggest concentrated summer demand along Croatia's coast, while a softer Index can indicate travelers are spreading to quieter Dalmatian islands.",
  paros:
    "Páros sits in the Cyclades between Mykonos intensity and slower island life, with villas, beaches, and yacht connections that attract a more measured Greek summer crowd. Its airport signal is modest but meaningful during the Aegean season.\n\nFor Go Tango users, Páros helps read Greece beyond the headline party islands. A rising Index may suggest travelers are choosing quieter Cycladic luxury, while cooling can show rotation back toward Mykonos, Santorini, or non-Greek Mediterranean markets.",
  corfu:
    "Corfu anchors the Ionian Islands with yacht harbors, villa estates, and a British-and-European second-home culture that predates much of Greece's recent resort boom. The signal blends sailing, family travel, and coastal compound demand.\n\nFor Go Tango, Corfu is a western-Greece counterweight to the Cyclades. A stronger read may suggest Ionian yacht-and-villa traffic is building, while a softer signal can show when Greek demand is consolidating farther east.",
  'marbella-malaga':
    "Málaga is the aviation gateway to Marbella, Puerto Banús, golf coasts, and one of Europe's most durable year-round sun markets. The signal mixes Spanish domestic wealth, British and Northern European second homes, and Middle Eastern seasonal traffic.\n\nFor Go Tango users, Marbella is a steady Mediterranean benchmark. A rising Index may suggest broad Costa del Sol momentum rather than a single-event spike, while cooling can show when European luxury is rotating toward Italy, Greece, or Atlantic alternatives.",
  biarritz:
    "Biarritz blends Basque surf culture, Belle Époque hotels, and a French Atlantic summer crowd that is more regional and gastronomic than Riviera scene-driven. The aviation signal is seasonal and smaller than Mediterranean giants, but highly distinctive.\n\nFor Go Tango, Biarritz is a useful Atlantic-luxury read. A stronger Index may suggest travelers are choosing France's western coast over the Med, while a softer score can show when the summer circuit is consolidating farther south.",
  'puglia-brindisi':
    "Brindisi opens Puglia: masseria hotels, whitewashed towns, food travel, and a slower Italian luxury corridor that feels more emerging than Amalfi or Capri. The aviation signal is still developing, which makes movement here especially interesting.\n\nFor Go Tango users, Puglia is a Mediterranean discovery signal. A rising Index may suggest travelers are moving beyond the obvious Italian coast toward longer, culinary, villa-based stays.",
  seychelles:
    "Mahé is the gateway to the Seychelles archipelago, where resort islands, beach privacy, and long-haul honeymoon traffic compress into a single aviation read. The final destination is often reached by helicopter or boat after arrival.\n\nFor Go Tango, the Seychelles reflect committed long-haul luxury intent. A stronger Index may suggest travelers are choosing Indian Ocean isolation over shorter Caribbean or Mediterranean alternatives, while low volume can still carry high meaning.",
  mauritius:
    "Mauritius combines resort beaches, golf estates, and a well-established Indian Ocean luxury circuit with strong European and Gulf connectivity. The signal is steadier and more resort-driven than many African leisure markets.\n\nFor Go Tango users, Mauritius is a core Indian Ocean benchmark. A rising Index may suggest broad long-haul beach demand, while cooling can show when travelers are rotating toward the Seychelles, Maldives, or safari-linked itineraries.",
  zanzibar:
    "Zanzibar layers spice-island culture, boutique beach lodges, and East African safari combinations into a signal that is more experiential than pure resort volume. Its airport read often reflects high-end safari-and-beach itineraries rather than mass tourism alone.\n\nFor Go Tango, Zanzibar is an Indian Ocean crossover market. A stronger read may suggest luxury travelers are pairing wildlife and beach in one trip, while a softer Index can show consolidation around more established resort hubs.",
  'maun-okavango':
    "Maun is the aviation gateway to Botswana's Okavango Delta, where safari camps, charter hops, and lodge logistics shape a signal very different from beach resort markets. Arrivals often reflect safari intent rather than destination tourism volume alone.\n\nFor Go Tango users, Maun is a thin but high-quality safari read. A rising Index may suggest strong high-end wildlife demand, even when raw GA counts look small compared with island gateways.",
  'victoria-falls':
    "Victoria Falls and Livingstone sit on the Zambezi corridor, combining waterfall tourism, safari access, and adventure travel across two countries' airfields. The private-aviation signal is naturally thin and itinerary-driven.\n\nFor Go Tango, Victoria Falls is a safari-and-adventure micro-signal. Movement here may indicate luxury travelers building southern-Africa circuits rather than broad regional tourism demand.",
  maui:
    "Maui is Hawaii's flagship resort island, with Wailea, Kapalua, and Kapalua-adjacent traffic spread across Kahului and West Maui airfields. The signal blends mainland leisure, inter-island hops, villa culture, and repeat West Coast visitation.\n\nFor Go Tango users, Maui is the clearest Hawaiian luxury read after Oahu's hub noise. A rising Index may suggest strong Pacific leisure demand, while cooling can show when travelers are spreading across the other islands.",
  kona:
    "Kona and the Kohala Coast anchor the Big Island's luxury corridor: golf resorts, volcanic landscapes, and a quieter Hawaii rhythm than Maui or Oahu. The aviation signal is concentrated along the west coast's resort strip.\n\nFor Go Tango, Kona helps read Hawaii beyond the obvious hubs. A stronger Index may suggest travelers are choosing Big Island privacy and outdoor luxury over more social Hawaiian markets.",
  kauai:
    "Kauai is the Garden Isle: lower density, dramatic coastline, and a private-travel pattern shaped by Princeville, villa rentals, and visitors who want Hawaii without Honolulu-scale traffic. The signal is smaller but often highly intentional.\n\nFor Go Tango users, Kauai is a quieter Hawaiian counterweight. A rising score may suggest demand for nature-led, slower island stays, while low volume should be read in context rather than dismissed.",
  oahu:
    "Oahu is Hawaii's aviation hub, with Honolulu absorbing a wide mix of commercial spillover, military traffic, inter-island connections, and resort demand from Waikiki to Ko Olina. The signal is broader and noisier than neighboring islands.\n\nFor Go Tango, Oahu is useful because it shows Hawaiian gateway pressure. A rising Index may suggest broad Pacific travel appetite, but pairing it with Maui, Kauai, or Kona helps separate hub noise from resort-specific momentum.",
  lanai:
    "Lanai operates almost like a single-resort island, with a tiny airfield serving one of Hawaii's most controlled luxury environments. The aviation signal is among the smallest in the state, which makes any movement especially deliberate.\n\nFor Go Tango users, Lanai is a quality-over-volume Hawaiian read. A stronger Index may suggest ultra-selective travelers are choosing island privacy over Maui or Oahu access, even when counts remain minimal.",
  tahiti:
    "Tahiti is the gateway to French Polynesia, where Bora Bora, Taha'a, and resort atolls are reached by inter-island hops after arrival. The signal reflects long-haul Pacific intent, honeymoon traffic, and repeat luxury-island circuits.\n\nFor Go Tango, Tahiti is a Pacific long-haul benchmark. A rising Index may suggest travelers are committing to distance and resort isolation over Caribbean or Mediterranean alternatives, while cooling can show when Pacific demand is softening against other warm-weather markets.",
};
