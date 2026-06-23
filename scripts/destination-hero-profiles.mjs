/**
 * Iconic search profiles for destination-specific Pexels hero selection.
 * requiredStrong tokens must appear in photo alt/URL for acceptance in --specific mode.
 */
export const WIKIMEDIA_DESTINATION_IDS = new Set(['hamptons', 'hilton-head']);

export const GENERIC_WEAK_TOKENS = [
  'caribbean', 'island', 'islands', 'coast', 'coastline', 'beach', 'ocean', 'sea',
  'aerial', 'drone', 'landscape', 'scenic', 'turquoise', 'paradise', 'tropical',
  'mountain', 'mountains', 'alpine', 'skyline', 'cityscape', 'harbor', 'harbour',
  'marina', 'bay', 'water', 'shore', 'seaside', 'archipelago', 'lagoon',
];

/** Destinations flagged for people-heavy or weak/generic heroes after the specific pass. */
export const TARGETED_REFETCH_IDS = [
  'st-barts', 'turks-caicos', 'mustique',
  'anguilla', 'marthas-vineyard', 'palm-beach', 'exuma', 'phuket',
  'comporta', 'mallorca', 'puerto-vallarta', 'sun-valley', 'santa-fe',
  'jackson-hole', 'verbier', 'whistler',
];

export const PEOPLE_SUBJECT_KEYWORDS = [
  'people on', 'people at', 'people walking', 'person on', 'person at',
  'crowd', 'couple', 'couples', 'kids', 'kid ', 'children', 'child ',
  'playing with', 'tourists', 'tourist ', 'walking on a beach', 'walking on the beach',
  'jetski', 'jet ski', 'jet-ski', 'grayscale photo of people', 'family on',
  'two kids', 'group of people', 'woman on', 'man on', 'men on', 'women on',
];

export const WEAK_SUBJECT_KEYWORDS = [
  'footprints on', 'open field under', 'cell tower', 'blue sea under the blue sky',
  'photo of the ocean', 'footprints on shore', 'wooden building in village',
];

export const DESTINATION_HERO_PROFILES = {
  'st-barts': {
    iconicQueries: ['Gustavia harbor St Barts', 'Saint Barthelemy aerial', 'St Barts island harbor'],
    requiredStrong: ['st bart', 'barth', 'barthelemy', 'gustavia'],
    iconicBonus: ['gustavia', 'barth', 'barthelemy', 'harbor'],
    forbidden: ['australia', 'antalya', 'venezuela', 'colombia', 'turkey'],
    relaxedFallback: {
      queries: [
        'Gustavia Saint Barthelemy harbor',
        'Saint Barthelemy island coast',
        'St Barts French West Indies aerial',
      ],
      requiredStrong: ['bart', 'barth', 'gustavia', 'barthelemy', 'french west indies'],
      minScore: 42,
    },
  },
  'turks-caicos': {
    iconicQueries: ['Grace Bay Turks Caicos', 'Providenciales beach aerial', 'Turks and Caicos aerial'],
    requiredStrong: ['turks', 'caicos', 'providenciales', 'grace bay'],
    iconicBonus: ['grace bay', 'providenciales', 'turks', 'caicos'],
    forbidden: ['venezuela', 'carabobo', 'antalya', 'australia'],
    relaxedFallback: {
      queries: [
        'Grace Bay beach Turks and Caicos',
        'Turks Caicos islands aerial',
        'Providenciales turquoise water',
        'Turks and Caicos Grace Bay sand',
      ],
      requiredStrong: ['turks', 'caicos', 'providenciales', 'grace'],
      minScore: 42,
    },
  },
  anguilla: {
    iconicQueries: ['Anguilla island aerial', 'Anguilla coastline drone', 'Sandy Ground Anguilla harbor'],
    requiredStrong: ['anguilla'],
    iconicBonus: ['anguilla', 'shoal bay', 'sandy ground', 'rendezvous bay'],
    forbidden: ['antigua only', 'australia'],
  },
  mustique: {
    iconicQueries: ['Mustique island', 'Mustique Caribbean aerial', 'Grenadines Mustique'],
    requiredStrong: ['mustique'],
    iconicBonus: ['mustique', 'grenadines', 'bequia'],
    forbidden: ['australia', 'portsea'],
    relaxedFallback: {
      queries: [
        'Mustique island Grenadines',
        'Grenadines Saint Vincent island aerial',
        'Bequia Grenadines aerial',
        'Southern Grenadines island coast',
      ],
      requiredStrong: ['mustique', 'grenadines', 'bequia', 'canouan', 'union island'],
      minScore: 38,
    },
  },
  'harbour-island': {
    iconicQueries: ['Harbour Island pink sand Bahamas', 'Eleuthera pink sand beach', 'Harbour Island Bahamas aerial'],
    requiredStrong: ['harbour island', 'harbor island', 'eleuthera', 'pink sand'],
    iconicBonus: ['harbour island', 'pink sand', 'eleuthera'],
    forbidden: ['nassau only', 'australia'],
  },
  mykonos: {
    iconicQueries: ['Mykonos windmills Greece', 'Mykonos town aerial', 'Little Venice Mykonos'],
    requiredStrong: ['mykonos', 'cyclades'],
    iconicBonus: ['mykonos', 'windmill', 'little venice', 'cyclades'],
    forbidden: ['santorini only', 'ibiza only'],
  },
  ibiza: {
    iconicQueries: ['Ibiza old town Dalt Vila', 'Ibiza island aerial Spain', 'Es Vedra Ibiza'],
    requiredStrong: ['ibiza', 'balearic'],
    iconicBonus: ['ibiza', 'dalt vila', 'es vedra', 'balearic'],
    forbidden: ['mallorca only', 'mykonos'],
  },
  'st-tropez': {
    iconicQueries: ['Saint Tropez harbor France', 'St Tropez marina aerial', 'Port de Saint Tropez'],
    requiredStrong: ['tropez', 'saint tropez', 'st tropez'],
    iconicBonus: ['tropez', 'saint tropez', 'riviera'],
    forbidden: ['italy only', 'spain only'],
  },
  'sardinia-olbia': {
    iconicQueries: ['Costa Smeralda Sardinia aerial', 'Sardinia coast Italy aerial', 'Olbia Sardinia coastline'],
    requiredStrong: ['sardinia', 'smeralda', 'olbia', 'costa smeralda'],
    iconicBonus: ['sardinia', 'smeralda', 'olbia', 'maddalena'],
    forbidden: ['sicily only', 'corsica only'],
  },
  aspen: {
    iconicQueries: ['Aspen Colorado mountains', 'Maroon Bells Aspen', 'Aspen ski town aerial'],
    requiredStrong: ['aspen', 'maroon bells', 'colorado'],
    iconicBonus: ['aspen', 'maroon bells', 'roaring fork'],
    forbidden: ['jackson hole only', 'vail only'],
  },
  courchevel: {
    iconicQueries: ['Courchevel ski resort France', 'Courchevel alpine village', 'Trois Vallees Courchevel'],
    requiredStrong: ['courchevel', 'trois vallees', 'savoie'],
    iconicBonus: ['courchevel', 'trois vallees', 'altiport'],
    forbidden: ['chamonix only', 'verbier only'],
  },
  'st-moritz': {
    iconicQueries: ['St Moritz lake Switzerland', 'Engadin St Moritz winter', 'St Moritz alpine town'],
    requiredStrong: ['st moritz', 'moritz', 'engadin', 'samedan'],
    iconicBonus: ['st moritz', 'engadin', 'lake st moritz'],
    forbidden: ['zermatt only', 'verbier only'],
  },
  'jackson-hole': {
    iconicQueries: ['Grand Teton Jackson Hole', 'Teton Range Wyoming aerial', 'Snake River Grand Teton'],
    requiredStrong: ['teton', 'jackson hole', 'jackson', 'wyoming'],
    iconicBonus: ['grand teton', 'teton', 'jackson hole', 'snake river'],
    forbidden: ['airport', 'airplane', 'wooden building', 'barn', 'yellowstone only'],
  },
  nantucket: {
    iconicQueries: ['Nantucket harbor Massachusetts', 'Nantucket island aerial', 'Brant Point lighthouse Nantucket'],
    requiredStrong: ['nantucket'],
    iconicBonus: ['nantucket', 'brant point', 'cisco beach'],
    forbidden: ['chatham', 'cape cod', 'block island', 'martha'],
  },
  'marthas-vineyard': {
    iconicQueries: ['Aquinnah cliffs Martha Vineyard', 'Edgartown harbor Martha Vineyard', 'Menemsha Martha Vineyard coast'],
    requiredStrong: ['martha', 'vineyard', 'edgartown', 'aquinnah', 'menemsha'],
    iconicBonus: ['martha', 'vineyard', 'edgartown', 'aquinnah', 'menemsha', 'oak bluffs'],
    forbidden: ['monument', 'plaque', 'nantucket', 'block island', 'grayscale'],
  },
  'palm-beach': {
    iconicQueries: ['Palm Beach inlet Florida aerial', 'Lake Worth lagoon Palm Beach', 'Palm Beach island coastline'],
    requiredStrong: ['palm beach', 'west palm', 'lake worth'],
    iconicBonus: ['palm beach', 'lake worth', 'breakers', 'worth avenue'],
    forbidden: ['clearwater', 'miami only', 'fort lauderdale only'],
  },
  tulum: {
    iconicQueries: ['Tulum Mayan ruins beach', 'Tulum ruins Mexico aerial', 'Tulum archaeological site coast'],
    requiredStrong: ['tulum', 'mayan ruins', 'riviera maya'],
    iconicBonus: ['tulum', 'mayan', 'ruins', 'cancun'],
    forbidden: ['chichen itza only'],
  },
  'cabo-san-lucas': {
    iconicQueries: ['El Arco Cabo San Lucas', 'Lands End Cabo arch', 'Cabo San Lucas aerial'],
    requiredStrong: ['cabo', 'san lucas', 'el arco', 'lands end'],
    iconicBonus: ['cabo', 'el arco', 'lands end', 'baja'],
    forbidden: ['cancun only', 'tulum only'],
  },
  comporta: {
    iconicQueries: ['Comporta rice fields Portugal', 'Comporta dunes Portugal coast', 'Tróia peninsula Portugal aerial'],
    requiredStrong: ['comporta', 'alentejo', 'troia'],
    iconicBonus: ['comporta', 'alentejo', 'troia', 'sado', 'rice field'],
    forbidden: ['australia', 'milfontes only', 'footprints'],
  },
  barbados: {
    iconicQueries: ['Barbados coastline aerial', 'Bridgetown Barbados harbor', 'Barbados Caribbean island'],
    requiredStrong: ['barbados', 'bridgetown'],
    iconicBonus: ['barbados', 'bridgetown', 'crane beach'],
    forbidden: ['antigua only', 'st lucia only'],
  },
  antigua: {
    iconicQueries: ['Antigua English Harbour', 'Nelsons Dockyard Antigua', 'Antigua Caribbean aerial'],
    requiredStrong: ['antigua', 'english harbour', 'nelson'],
    iconicBonus: ['antigua', 'english harbour', 'nelson', 'dockyard'],
    forbidden: ['colombia', 'providencia', 'venezuela'],
  },
  nassau: {
    iconicQueries: ['Nassau Bahamas aerial', 'Paradise Island Bahamas', 'Nassau harbor Bahamas'],
    requiredStrong: ['nassau', 'paradise island', 'bahamas'],
    iconicBonus: ['nassau', 'paradise island', 'cable beach'],
    forbidden: ['eleuthera only', 'exuma only', 'harbour island'],
  },
  exuma: {
    iconicQueries: ['Exuma Cays sandbar aerial', 'Exuma Bahamas turquoise cays', 'Stocking Island Exuma aerial'],
    requiredStrong: ['exuma', 'exuma cays', 'stocking island', 'george town'],
    iconicBonus: ['exuma', 'cays', 'sandbar', 'stocking island'],
    forbidden: ['beach ball', 'nassau only', 'jetski', 'jet ski'],
  },
  'casa-de-campo': {
    iconicQueries: ['La Romana Dominican Republic coast', 'Casa de Campo marina', 'Dominican Republic Caribbean aerial'],
    requiredStrong: ['la romana', 'dominican', 'casa de campo'],
    iconicBonus: ['la romana', 'dominican', 'romana'],
    forbidden: ['punta cana only', 'jamaica only'],
  },
  'capri-naples': {
    iconicQueries: ['Capri Faraglioni rocks', 'Capri island Italy aerial', 'Blue Grotto Capri coast'],
    requiredStrong: ['capri', 'faraglioni', 'gulf of naples'],
    iconicBonus: ['capri', 'faraglioni', 'anacapri', 'marina grande'],
    forbidden: ['amalfi only', 'sicily only'],
  },
  'amalfi-salerno': {
    iconicQueries: ['Amalfi Coast Positano aerial', 'Positano Italy coast', 'Amalfi Coast Italy cliff'],
    requiredStrong: ['amalfi', 'positano', 'ravello', 'salerno', 'costiera'],
    iconicBonus: ['amalfi', 'positano', 'ravello', 'praiano', 'atrani'],
    forbidden: ['capri only', 'cinque terre only'],
  },
  mallorca: {
    iconicQueries: ['Cap de Formentor Mallorca', 'Port de Soller Mallorca coast', 'Palma Bay Mallorca aerial'],
    requiredStrong: ['mallorca', 'majorca', 'formentor', 'soller', 'palma'],
    iconicBonus: ['mallorca', 'majorca', 'formentor', 'soller', 'tramuntana'],
    forbidden: ['ibiza only', 'menorca only'],
  },
  'sicily-catania': {
    iconicQueries: ['Taormina Sicily coast', 'Mount Etna Sicily aerial', 'Sicily coastline Catania'],
    requiredStrong: ['sicily', 'taormina', 'etna', 'catania', 'cefalu'],
    iconicBonus: ['sicily', 'taormina', 'etna', 'cefalu', 'siracusa'],
    forbidden: ['sardinia only', 'amalfi only'],
  },
  santorini: {
    iconicQueries: ['Santorini Oia caldera', 'Santorini blue domes Greece', 'Oia Santorini sunset aerial'],
    requiredStrong: ['santorini', 'oia', 'thera', 'fira'],
    iconicBonus: ['santorini', 'oia', 'caldera', 'fira', 'cyclades'],
    forbidden: ['mykonos only', 'crete only'],
  },
  verbier: {
    iconicQueries: ['Verbier ski resort Switzerland', 'Verbier village Switzerland aerial', 'Verbier 4 Vallees'],
    requiredStrong: ['verbier'],
    iconicBonus: ['verbier', 'valais', '4 vallees', 'mont fort'],
    forbidden: ['klosters', 'zermatt only', 'chamonix only'],
  },
  'megeve-chamonix': {
    iconicQueries: ['Chamonix Mont Blanc aerial', 'Mont Blanc Chamonix valley', 'Megeve French Alps village'],
    requiredStrong: ['chamonix', 'mont blanc', 'megeve', 'aiguille'],
    iconicBonus: ['chamonix', 'mont blanc', 'megeve', 'mer de glace'],
    forbidden: ['courchevel only', 'zermatt only'],
  },
  whistler: {
    iconicQueries: ['Whistler Blackcomb mountains', 'Whistler village aerial', 'Whistler peak Canada'],
    requiredStrong: ['whistler', 'blackcomb', 'garibaldi'],
    iconicBonus: ['whistler', 'blackcomb', 'peak to peak'],
    forbidden: ['vancouver city only', 'banff only'],
  },
  'cape-cod': {
    iconicQueries: ['Cape Cod Chatham lighthouse', 'Cape Cod Massachusetts aerial', 'Provincetown Cape Cod'],
    requiredStrong: ['cape cod', 'chatham', 'provincetown', 'hyannis'],
    iconicBonus: ['cape cod', 'chatham', 'provincetown', 'race point'],
    forbidden: ['nantucket', 'block island', 'martha'],
  },
  'block-island': {
    iconicQueries: ['Block Island Mohegan Bluffs', 'Block Island Rhode Island aerial', 'New Shoreham Block Island'],
    requiredStrong: ['block island', 'new shoreham', 'mohegan bluffs'],
    iconicBonus: ['block island', 'mohegan', 'southeast light'],
    forbidden: ['nantucket', 'martha', 'cape cod'],
  },
  charleston: {
    iconicQueries: ['Charleston Rainbow Row aerial', 'Charleston harbor South Carolina', 'Charleston Battery waterfront'],
    requiredStrong: ['charleston', 'rainbow row', 'battery'],
    iconicBonus: ['charleston', 'rainbow row', 'battery', 'cooper river'],
    forbidden: ['ripped', 'ruins', 'flag on island'],
  },
  'sun-valley': {
    iconicQueries: ['Bald Mountain Sun Valley Idaho', 'Sun Valley ski resort Idaho', 'Ketchum Sun Valley mountains'],
    requiredStrong: ['sun valley', 'bald mountain', 'ketchum'],
    iconicBonus: ['sun valley', 'bald mountain', 'ketchum', 'wood river', 'hailey'],
    forbidden: ['santa fe', 'aspen only', 'open field'],
  },
  napa: {
    iconicQueries: ['Napa Valley vineyards aerial', 'Napa Valley California wine country', 'Napa vineyards hills'],
    requiredStrong: ['napa', 'napa valley', 'wine country', 'sonoma'],
    iconicBonus: ['napa', 'vineyard', 'wine country', 'calistoga'],
    forbidden: ['tuscany only', 'bordeaux only'],
  },
  'santa-fe': {
    iconicQueries: ['Santa Fe Plaza adobe New Mexico', 'Santa Fe historic district aerial', 'Sangre de Cristo Santa Fe'],
    requiredStrong: ['santa fe'],
    iconicBonus: ['santa fe', 'adobe', 'plaza', 'sangre de cristo', 'canyon road'],
    forbidden: ['idaho', 'sun valley', 'snow forest', 'cell tower'],
  },
  'coronado-san-diego': {
    iconicQueries: ['Coronado Bridge San Diego', 'Hotel del Coronado aerial', 'Coronado island San Diego'],
    requiredStrong: ['coronado', 'san diego', 'coronado bridge'],
    iconicBonus: ['coronado', 'san diego', 'hotel del coronado', 'bay'],
    forbidden: ['los angeles only', 'tijuana'],
  },
  'destin-30a': {
    iconicQueries: ['Destin Florida emerald coast', 'Destin harbor Florida aerial', '30A Florida Seaside beach'],
    requiredStrong: ['destin', 'emerald coast', '30a', 'seaside florida', 'rosemary beach'],
    iconicBonus: ['destin', 'emerald coast', '30a', 'seaside', 'grayton'],
    forbidden: ['clearwater', 'tampa', 'panama city only'],
  },
  'puerto-vallarta': {
    iconicQueries: ['Puerto Vallarta Malecon waterfront', 'Banderas Bay Puerto Vallarta city', 'Los Arcos Puerto Vallarta'],
    requiredStrong: ['puerto vallarta', 'vallarta', 'banderas', 'malecon'],
    iconicBonus: ['puerto vallarta', 'vallarta', 'banderas', 'malecon', 'los arcos'],
    forbidden: ['casa demae', 'cancun only', 'blue sea under'],
  },
  'puerto-escondido': {
    iconicQueries: ['Puerto Escondido beach Oaxaca', 'Zicatela Puerto Escondido', 'Puerto Escondido Mexico coast'],
    requiredStrong: ['puerto escondido', 'escondido', 'oaxaca', 'zicatela'],
    iconicBonus: ['puerto escondido', 'zicatela', 'oaxaca', 'carrizalillo'],
    forbidden: ['cancun only', 'acapulco only'],
  },
  phuket: {
    iconicQueries: ['Phang Nga Bay Thailand karst', 'Phuket Big Buddha aerial', 'Kata beach Phuket coastline'],
    requiredStrong: ['phuket', 'phang nga', 'kata', 'patong'],
    iconicBonus: ['phuket', 'phang nga', 'kata', 'patong', 'big buddha'],
    forbidden: ['bali only', 'koh samui only'],
  },
  maldives: {
    iconicQueries: ['Maldives overwater bungalows aerial', 'Maldives atoll turquoise', 'Maldives island aerial'],
    requiredStrong: ['maldives', 'male', 'atoll'],
    iconicBonus: ['maldives', 'atoll', 'overwater', 'maafushi'],
    forbidden: ['seychelles only', 'bali only'],
  },
  bali: {
    iconicQueries: ['Bali rice terraces Tegallalang', 'Tanah Lot temple Bali', 'Bali coastline Uluwatu'],
    requiredStrong: ['bali', 'denpasar', 'uluwatu', 'ubud', 'tegallalang'],
    iconicBonus: ['bali', 'tanah lot', 'uluwatu', 'ubud', 'tegallalang', 'nusa penida'],
    forbidden: ['thailand only', 'phuket only'],
  },
  'koh-samui': {
    iconicQueries: ['Koh Samui Thailand aerial', 'Big Buddha Samui', 'Lamai Beach Koh Samui'],
    requiredStrong: ['samui', 'koh samui', 'ko samui'],
    iconicBonus: ['samui', 'big buddha', 'lamai', 'chaweng', 'ang thong'],
    forbidden: ['phuket only', 'bali only'],
  },
  'dubai-private': {
    iconicQueries: ['Dubai skyline Burj Khalifa', 'Palm Jumeirah Dubai aerial', 'Dubai Marina skyline'],
    requiredStrong: ['dubai', 'burj khalifa', 'jumeirah', 'emirates'],
    iconicBonus: ['dubai', 'burj khalifa', 'palm jumeirah', 'marina', 'sheikh zayed'],
    forbidden: ['abu dhabi only', 'doha only'],
  },
  'punta-del-este': {
    iconicQueries: ['Punta del Este La Mano sculpture', 'Punta del Este Uruguay coast', 'Punta del Este aerial'],
    requiredStrong: ['punta del este', 'punta del', 'la mano', 'uruguay'],
    iconicBonus: ['punta del este', 'la mano', 'brava beach', 'portezuelo'],
    forbidden: ['argentina only', 'brazil only'],
  },
  marrakech: {
    iconicQueries: ['Marrakech medina aerial', 'Koutoubia Mosque Marrakech', 'Jemaa el Fna Marrakech'],
    requiredStrong: ['marrakech', 'marrakesh', 'jemaa', 'koutoubia'],
    iconicBonus: ['marrakech', 'medina', 'koutoubia', 'jemaa', 'atlas'],
    forbidden: ['casablanca only', 'fes only'],
  },
};
