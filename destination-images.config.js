/**
 * Destination modal photo hero manifest (prototype).
 * Keyed by destination id — same ids used in destinations.config.js and the modal.
 * Missing entries or failed image loads fall back to the dark editorial header.
 */
window.DESTINATION_IMAGE_MANIFEST = {
  hamptons: {
    src: '/images/destinations/hamptons-hero.jpg',
    alt: 'Atlantic shoreline and dunes near the Hamptons, Long Island',
    credit: 'Wikimedia Commons',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Coopers_Beach_Hamptons.jpg',
    license: 'CC BY-SA 3.0',
    objectPosition: 'center 40%',
  },
  'hilton-head': {
    src: '/images/destinations/hilton-head-hero.jpg',
    alt: 'Palmetto-lined path leading toward the beach at Hilton Head Island',
    credit: 'Wikimedia Commons',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hilton_Head_Island_Beach.jpg',
    license: 'CC BY 2.0',
    objectPosition: 'center 35%',
  },
};
