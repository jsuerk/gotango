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
};

export const EDITORIAL_BLURBS = {
  'st-barts':
    "The Caribbean's most enduring private-aviation destination, where the runway approach itself is the entrance fee. Year-round demand spikes around New Year's, Easter, and the Bucket Regatta in March.",
  'turks-caicos':
    "Providenciales has quietly become the Caribbean's largest private-aviation hub by volume, balancing Aman-grade resorts with a still-functional commercial gateway. The market has matured from emerging to established over the past decade.",
  anguilla:
    'Smaller and quieter than its St. Barts neighbor, Anguilla draws repeat visitors who prize empty beaches over scene. Activity clusters tightly around late December and February school breaks.',
  mustique:
    "A Grenadines private island operating closer to a members' club than a destination, with a fixed villa inventory and decades-long family tenancies. Aviation traffic is small but unusually consistent.",
  'harbour-island':
    'Pink-sand and clapboard New England aesthetic an hour from Nassau, increasingly favored by Hamptons and Palm Beach families seeking a lower-key Bahamian alternative. North Eleuthera handles the inbound traffic.',
  mykonos:
    "The Aegean's loudest summer destination, where July-August arrivals routinely overwhelm the airport's nominal capacity. Activity peaks late June through early September, then collapses.",
  ibiza:
    'A Balearic island with two distinct economies -- the club circuit and the discreet northern villa scene -- converging on the same airport. Late June through September drives nearly all annual volume.',
  'st-tropez':
    "La Mole's short runway forces a tight aircraft mix, but the Cote d'Azur's enduring appeal keeps the airfield among Europe's busiest summer private-aviation strips. Cannes Film Festival in May is the unofficial season opener.",
  'sardinia-olbia':
    "Costa Smeralda's gateway, dominated by Italian and German charter activity through August. Less Anglo-American than the French Riviera but increasingly on the radar of US ultra-high-net-worth families.",
  aspen:
    "The Rockies' definitive private-aviation hub, with a winter ski-week peak and a quieter but rising summer Music Festival and Ideas Festival season. Shoulder seasons are genuinely quiet -- April and October show the lowest activity.",
  courchevel:
    'An altiport requiring specialized pilot certification, which functions as a soft barrier to entry and concentrates traffic among repeat visitors. December-February is essentially the entire commercial year.',
  'st-moritz':
    "Samedan handles the inbound for the Engadin valley's winter season, with a tightly defined Christmas-February peak. Polo on the frozen lake in late January is the calendar's commercial high-water mark.",
  'jackson-hole':
    "Wyoming's primary luxury gateway, balancing winter ski season with strong summer demand for Yellowstone and the Tetons. Among the most consistent year-round private-aviation destinations in the US Mountain West.",
  hamptons:
    "The Long Island airfields handle one of the densest summer private-aviation patterns in the world, with Friday-afternoon and Sunday-evening peaks visible in the data. Memorial Day to Labor Day defines the commercial year.",
  nantucket:
    'An island whose summer aviation profile reflects its 90-minute helicopter and short-hop jet patterns from New York and Boston. July through August accounts for the majority of annual arrivals.',
  'marthas-vineyard':
    'Quieter and more politically networked than Nantucket, with a similar but somewhat smaller summer arrival pattern. August in particular draws disproportionate Washington and Boston traffic.',
  'palm-beach':
    "The US winter capital of private aviation by some measures, with January-March traffic that rivals Aspen's ski week sustained over twelve weeks. The post-pandemic Florida migration pushed baseline volumes structurally higher.",
  tulum:
    "The Riviera Maya's gateway region, served by both the original Cancún airport and the newer Tulum airport (opened December 2023). The mix runs from Cancún's high-volume resort and commercial traffic to Tulum's wellness-luxury anchor — a specific NYC and LA cohort that operates distinctly from the broader Riviera Maya market. Year-round demand with predictable holiday peaks.",
  'cabo-san-lucas':
    "Baja's primary private-aviation gateway, serving both the Cabo resort cluster and the quieter East Cape. Activity is genuinely year-round, with Thanksgiving and Easter as the most reliable peaks.",
  comporta:
    "A quiet Atlantic stretch an hour south of Lisbon that has been the European fashion and design industry's open secret for two decades. Activity is modest by Mediterranean standards but unusually loyal -- repeat visitors dominate.",

  // Caribbean expansion
  barbados:
    "The Caribbean's most established luxury market, with British colonial bones and a steadier private-aviation profile than the trend-driven islands. Sandy Lane's calendar — December through Easter — defines the commercial year.",

  antigua:
    "365 beaches and a private-aviation footprint that punches above its size, anchored by the V.C. Bird gateway and a deep-water harbor that draws the yachting circuit each spring. Tightly seasonal.",

  nassau:
    "Paradise Island's resort-and-private-aviation mix makes Nassau the Caribbean's most accessible luxury entry point — closer to Miami than Palm Beach to New York. Volume runs steady year-round with predictable winter peaks.",

  exuma:
    "The Out Islands' standout, drawing a UHNW yachting and villa cohort distinct from Nassau's resort traffic. Activity is small but unusually consistent — the destination's appeal is its limited capacity.",

  'casa-de-campo':
    "The Dominican Republic's primary luxury anchor — a 7,000-acre resort with its own polo grounds, marina, and private airport access via La Romana. The clientele skews Latin American family-office.",

  // Mediterranean expansion
  'capri-naples':
    "Capodichino handles the inbound for Capri and the broader Amalfi region, with an unusual mix of Italian-charter intensity and Anglo-American aspiration. June through September is the entire commercial year.",

  'amalfi-salerno':
    "Salerno's small Costa d'Amalfi airport opened the region to private aviation in earnest only in the past decade. Activity is modest but increasingly consistent — the Amalfi Coast was previously accessed only via helicopter from Naples.",

  mallorca:
    "Larger and more commercial than Ibiza, Mallorca's private-aviation profile is dominated by German and Northern European traffic with a growing British contingent. Late June through August defines the volume year.",

  'sicily-catania':
    "Taormina's gateway, recently elevated by HBO's White Lotus and a sustained luxury-villa development cycle. Activity is concentrated July-September with a notable shoulder-season uptick driven by the film-festival circuit.",

  santorini:
    "The Aegean's quieter peer to Mykonos — older clientele, more couples, less club scene. Private-aviation traffic is meaningful but smaller in absolute volume; the runway and parking constraints favor selective access.",

  // Alpine expansion
  verbier:
    "Sion handles the inbound for Verbier and the wider Valais — an under-tracked alternative to the Engadin valley with a notably British and Belgian winter clientele. December through March is the entire commercial year.",

  'megeve-chamonix':
    "Chambéry serves both Megève's understated old-money winter scene and Chamonix's mountaineering set — two distinct markets sharing one airport. UK and Parisian traffic dominates.",

  whistler:
    "North America's most consistently active winter destination outside the Rockies, anchored by Vancouver International. Year-round in commercial terms, with a strong summer mountain-bike season layered on top of ski.",

  // US East / Summer
  'cape-cod':
    "Hyannis serves the Cape, Nantucket overflow, and the cottage-and-clambake set whose summer rhythms haven't changed materially since the 1960s. Memorial Day through Labor Day, with an unusually sticky September.",

  'block-island':
    "Twelve square miles, a single airport, and a yacht-and-summer-house cohort that arrives entirely in July and August. Aviation traffic is small but among the densest per-capita in the US Northeast.",

  'hilton-head':
    "South Carolina's golf-and-beach anchor, with a private-aviation profile that runs nearly year-round — moderating the Northeast's sharp seasonal cliff. The RBC Heritage in April is the calendar's commercial high-water mark.",

  charleston:
    "The Holy City's private-aviation profile has grown substantially over the past decade as Charleston has become the South's most fashionable urban destination. Activity is genuinely year-round with a notable spring-festival peak.",

  // US West
  'sun-valley':
    "Idaho's quiet luxury anchor — less visible than Aspen or Jackson Hole, but with an equally serious clientele and the Allen & Co. media conference in July as its signature commercial moment.",

  napa:
    "Wine country's primary private-aviation gateway, with KAPC handling traffic that bypasses San Francisco entirely. Harvest season (September-October) and the spring auctions drive the calendar.",

  'santa-fe':
    "A small but distinct private-aviation footprint serving the art-and-design cohort that has made Santa Fe a year-round residential market. Indian Market in August is the commercial peak.",

  'coronado-san-diego':
    "The Hotel del Coronado anchor and the broader San Diego luxury market share airport infrastructure with substantial commercial volume — making private-aviation signal harder to isolate. The Del's calendar drives the rhythm.",

  // US Gulf
  'destin-30a':
    "The 30A corridor — Seaside, Alys Beach, Rosemary Beach — has become the Gulf Coast's most distinct luxury destination, with a Texas and Atlanta clientele that travels almost exclusively private. May through October is the commercial year.",

  // Mexico
  'puerto-vallarta':
    "Puerto Vallarta serves both PV proper and the quieter Punta Mita resort cluster to the north. The mix is genuinely year-round, with a notable winter-snowbird pattern from Texas and California.",

  'puerto-escondido':
    "Oaxaca's surf-and-design destination has cult status without the volume — most arrivals are commercial Aeromexico from CDMX. Activity is intentionally modest; the destination's appeal is its limited capacity.",

  // Asia-Pacific
  phuket:
    "Southeast Asia's most established luxury beach destination, anchored by a substantial year-round commercial-and-private mix. November through April is the high season, with a meaningful European holiday-week peak around New Year.",

  maldives:
    "Velana serves as the gateway to a fragmented archipelago of resort-island microdestinations reached by seaplane or speedboat. Private-aviation traffic is unusually transcontinental — Heathrow, Dubai, and Singapore are all major origin hubs.",

  bali:
    "Denpasar's private-aviation profile has grown sharply over the past five years as Bali transitioned from backpacker market to legitimate UHNW destination. The Australian and Singaporean cohorts dominate.",

  'koh-samui':
    "Quieter and more selective than Phuket, with a runway-length constraint that filters the aircraft mix. The clientele is heavily British and German, with a long-staying villa rental pattern.",

  // Middle East
  'dubai-private':
    "Al Maktoum (DWC) handles the private-aviation traffic that the busy DXB cannot accommodate — making it the cleanest signal for actual UHNW Dubai activity. Volume is genuinely year-round, with a notable winter peak.",

  // South America
  'punta-del-este':
    "South America's signature summer destination — January and February are essentially the entire commercial year. The clientele is overwhelmingly Argentine and Brazilian, with a small but growing North American contingent.",

  // Africa
  marrakech:
    "North Africa's most established luxury private-aviation destination, with a clientele that skews European and a calendar shaped by the festival circuit (Marrakech International Film Festival in November is the highest-profile moment). Year-round commercial volume.",
};
