const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateResource, playbackUrl, normalize, createClient } = require('../desktop/source.cjs');

test('source requests are limited to read-only public catalog resources', () => {
  assert.equal(validateResource('series/the-mentalist-2008/season/7'), 'https://z2.idlixku.com/api/series/the-mentalist-2008/season/7');
  assert.equal(validateResource('search?q=a%26b&page=2'), 'https://z2.idlixku.com/api/search?q=a%26b&page=2');
  for (const resource of ['https://example.com/api/movies', '//localhost/api/movies', '/api/auth/login', 'movies/../auth', '/api/movies/import-tmdb/upload', null]) assert.throws(() => validateResource(resource));
});
test('playback uses the actual source episode route and rejects unsafe inputs', () => {
  assert.equal(playbackUrl({ type: 'tv_series', slug: 'the-mentalist-2008', season: 7, episode: 13 }), 'https://z2.idlixku.com/series/the-mentalist-2008/season/7/episode/13?play=1');
  assert.equal(playbackUrl({ type: 'movie', slug: 'the-hunt-2012' }), 'https://z2.idlixku.com/movie/the-hunt-2012?play=1');
  for (const options of [{ type: 'tv_series', slug: 'safe', season: -1, episode: 1 }, { type: 'movie', slug: '../auth' }, { type: 'iframe', slug: 'safe' }]) assert.throws(() => playbackUrl(options));
});
test('mixed homepage content retains film/series identity and excludes ad modules', () => {
  const data = normalize('homepage', { above: [{ type: 'featured', data: [{ contentType: 'tv_series', content: { title: 'A', slug: 'a', firstAirDate: '2022-01-01', voteAverage: '8.36' } }] }], below: [{ type: 'latest_movies', title: 'Movies', data: [{ title: 'B', slug: 'b', contentType: 'movie' }] }, { type: 'latest_episodes', data: [] }], ads: [{ targetUrl: 'https://ad.example' }] });
  assert.equal(data.featured[0].type, 'tv_series');
  assert.equal(data.featured[0].rating, 8.36);
  assert.equal(data.featured[0].year, '2022');
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].items[0].type, 'movie');
  assert.equal(data.ads, undefined);
});
test('episode availability is retained and unpublished episodes are excluded', () => {
  const data = normalize('series/a/season/1', { season: { seasonNumber: 1, episodes: [{ episodeNumber: 3, name: 'Three', hasVideo: false }, { episodeNumber: 1, name: 'One', hasVideo: true }, { episodeNumber: 2, isPublished: false }] } });
  assert.deepEqual(data.episodes.map(e => [e.number, e.available]), [[1, true], [3, false]]);
});
test('failed requests can be retried and successful concurrent requests are cached', async () => {
  let calls = 0;
  const client = createClient(async () => { calls++; if (calls === 1) return { ok: false, status: 503 }; return { ok: true, json: async () => ({ data: [], pagination: { totalPages: 2 } }) }; });
  await assert.rejects(client('movies'), /503/);
  const [a, b] = await Promise.all([client('movies'), client('movies')]);
  assert.equal(calls, 2);
  assert.equal(a.pages, 2);
  assert.deepEqual(a, b);
});
