const MODE_PROPS = { agences: 'a', secteurs: 'r', cps: 'k' };

function centroid(features) {
  let x = 0;
  let y = 0;
  let n = 0;
  features.forEach((f) => {
    const geom = f.geometry;
    if (!geom) return;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
    const ring = rings[0] || [];
    ring.forEach(([lng, lat]) => {
      x += lng;
      y += lat;
      n += 1;
    });
  });
  return n ? [y / n, x / n] : [46.6, -0.8];
}

/**
 * Restreint le référentiel au périmètre du profil connecté.
 * - direction  : tout le territoire
 * - agence     : les communes rattachées à cette agence
 * - commercial : les communes de son secteur
 * Les agrégats du bandeau latéral sont recalculés sur le périmètre visible,
 * pour qu'aucun chiffre d'une autre zone ne soit affiché.
 */
export function scopeTerritory({ data, meta, sites, ...rest }, access) {
  if (!access || access.profile_type === 'direction') {
    return { data, meta, sites, ...rest };
  }

  const field = access.profile_type === 'agence' ? 'a' : 'r';
  const features = data.features.filter((f) => f.properties[field] === access.scope);

  const scopedMeta = {};
  Object.entries(MODE_PROPS).forEach(([mode, prop]) => {
    const groups = {};
    features.forEach((f) => {
      const key = f.properties[prop];
      groups[key] = groups[key] || { nb: 0, deps: {} };
      groups[key].nb += 1;
      const dep = f.properties.dep;
      groups.deps[dep] = (groups.deps[dep] || 0) + 1;
    });
    Object.keys(groups).forEach((key) => {
      const source = meta[mode] && meta[mode][key];
      if (source && source.lat != null) {
        groups[key].lat = source.lat;
        groups[key].lng = source.lng;
      } else {
        const [lat, lng] = centroid(features.filter((f) => f.properties[prop] === key));
        groups[key].lat = lat;
        groups[key].lng = lng;
      }
    });
    scopedMeta[mode] = groups;
  });

  const agencies = new Set(features.map((f) => f.properties.a));
  return {
    data: { ...data, features },
    meta: scopedMeta,
    sites: sites.filter((s) => s.a && agencies.has(s.a)),
    ...rest,
  };
}