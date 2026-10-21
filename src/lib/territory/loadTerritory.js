const FILES = {
  data: 'communes.json',
  meta: 'meta.json',
  sites: 'sites.json',
  colors: 'colors.json',
  concur: 'concurrence.json',
  frontiere: 'frontiere.json',
  enc: 'facturation.enc.json',
};

const get = (name) =>
  fetch(`${import.meta.env.BASE_URL}data/${name}`).then((r) => {
    if (!r.ok) throw new Error(`Données indisponibles (${name})`);
    return r.json();
  });

/**
 * Charge le référentiel territorial (contours communaux, agrégats, sites,
 * couleurs, concurrence, frontière et données de facturation chiffrées).
 */
export async function loadTerritory() {
  const [data, meta, sites, colors, concur, frontiere, enc] = await Promise.all(
    Object.values(FILES).map(get)
  );

  // META est enrichi à chaud par le moteur cartographique : on travaille sur une copie.
  return {
    data,
    meta: JSON.parse(JSON.stringify(meta)),
    sites,
    colors,
    concur,
    frontiere,
    enc,
  };
}