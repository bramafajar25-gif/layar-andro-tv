'use strict';
const SOURCE = 'https://z2.idlixku.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

function validateResource(resource) {
  if (typeof resource !== 'string' || resource.length > 1500) throw new Error('Permintaan tidak valid.');
  const url = new URL(resource, SOURCE + '/api/');
  if (url.origin !== SOURCE || !/^\/api\/(homepage|movies|series|search)(?:\/|$)/.test(url.pathname)) throw new Error('Sumber tidak diizinkan.');
  if (!/^\/api\/(?:homepage|search|movies|series|(?:movies|series)\/[a-z0-9-]+|series\/[a-z0-9-]+\/season\/\d+)$/.test(url.pathname)) throw new Error('Permintaan tidak didukung.');
  return url.href;
}

function playbackUrl({ type, slug, season, episode }) {
  if (!['movie', 'tv_series'].includes(type) || !/^[a-z0-9-]{1,250}$/.test(slug || '')) throw new Error('Judul tidak valid.');
  if (type === 'movie') return `${SOURCE}/movie/${slug}?play=1`;
  if (![season, episode].every(n => Number.isInteger(n) && n > 0 && n < 100000)) throw new Error('Episode tidak valid.');
  return `${SOURCE}/series/${slug}/season/${season}/episode/${episode}?play=1`;
}

function title(raw, fallbackType) {
  const item = raw.content || raw;
  const type = raw.contentType === 'episode' ? 'tv_series' : raw.contentType || item.contentType || fallbackType || (item.firstAirDate ? 'tv_series' : 'movie');
  return {
    id: item.id, type, slug: item.slug, title: item.title || item.name || '', overview: item.overview || '',
    poster: item.posterPath || '', backdrop: item.backdropPath || '', logo: item.logoPath || '',
    year: (item.releaseDate || item.firstAirDate || '').slice(0, 4), rating: Number(item.voteAverage) || 0,
    runtime: item.runtime || null, quality: item.quality || '', numberOfSeasons: item.numberOfSeasons || 0,
    genres: (item.genres || []).map(g => typeof g === 'string' ? g : g.name).filter(Boolean),
    cast: (item.cast || []).slice(0, 8).map(c => c.name).filter(Boolean), director: item.director || '',
    tagline: item.tagline || '', hasVideo: item.hasVideo !== false,
    seasons: (item.seasons || []).filter(s => s.isPublished !== false).map(s => ({ number: s.seasonNumber, name: s.name || `Season ${s.seasonNumber}`, count: s.episodeCount || s.episodes?.length || 0 }))
  };
}

function normalize(resource, raw) {
  const path = new URL(validateResource(resource)).pathname;
  if (path === '/api/homepage') {
    const modules = [...(raw.above || []), ...(raw.below || [])];
    return {
      featured: (modules.find(m => m.type === 'featured')?.data || []).map(x => title(x)).filter(x => x.slug),
      rows: modules.filter(m => m.type !== 'featured' && m.type !== 'latest_episodes').map(m => ({ key: m.slug || m.type, title: m.title, type: m.type, items: (m.data || []).map(x => title(x)).filter(x => x.slug) })).filter(m => m.items.length)
    };
  }
  if (/\/season\/\d+$/.test(path)) {
    const s = raw.season || raw;
    return { number: s.seasonNumber, episodes: (s.episodes || []).filter(e => e.isPublished !== false).map(e => ({ number: e.episodeNumber, title: e.name || `Episode ${e.episodeNumber}`, overview: e.overview || '', still: e.stillPath || '', runtime: e.runtime || null, available: e.hasVideo !== false })).sort((a, b) => a.number - b.number) };
  }
  if (/\/api\/(movies|series)\/.+/.test(path)) return title(raw, path.startsWith('/api/movies/') ? 'movie' : 'tv_series');
  const items = raw.results || raw.data || [];
  const limit = raw.pagination?.limit || 24;
  return { items: items.map(x => title(x, path === '/api/series' ? 'tv_series' : undefined)).filter(x => x.slug), pages: raw.pagination?.totalPages || Math.ceil((raw.total || items.length) / limit), total: raw.pagination?.total || raw.total || items.length };
}

function createClient(fetcher = fetch) {
  const cache = new Map();
  return async resource => {
    const url = validateResource(resource);
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.promise;
    const promise = (async () => {
      const response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(25000), redirect: 'error' });
      if (!response.ok) throw new Error(response.status === 403 ? 'IDLIX menolak koneksi. Coba muat ulang atau buka sumber.' : `IDLIX belum bisa dimuat (${response.status}).`);
      return normalize(resource, await response.json());
    })();
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    cache.set(url, { promise, expires: Date.now() + 120000 });
    promise.catch(() => cache.delete(url));
    return promise;
  };
}
module.exports = { SOURCE, USER_AGENT, validateResource, playbackUrl, title, normalize, createClient };
