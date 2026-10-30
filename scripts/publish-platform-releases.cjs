'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const repo = 'bramafajar25-gif/layar-andro-tv';
const api = 'https://api.github.com/repos/' + repo + '/';
const token = process.env.GH_TOKEN;
if (!token) throw new Error('GH_TOKEN is required.');
const headers = {
  Accept: 'application/vnd.github+json', 'User-Agent': 'Layar-platform-releases',
  'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token
};
async function request(resource, method = 'GET', body, allowMissing = false) {
  const response = await fetch(api + resource, {
    method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000)
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error('GitHub HTTP ' + response.status + ' ' + resource);
  return response.json();
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return 'sha256:' + hash.digest('hex');
}
(async () => {
  const source = await request('releases/tags/v3.0.5');
  let reference = (await request('git/ref/tags/v3.0.5')).object;
  while (reference.type === 'tag') reference = (await request('git/tags/' + reference.sha)).object;
  if (reference.type !== 'commit') throw new Error('Source tag does not resolve to a commit.');
  const platforms = [
    { tag: 'windows-v3.0.5', title: 'Layar Windows Laptop / PC v3.0.5', file: 'Layar-Windows-Laptop-v3.0.5-x64.zip',
      text: '**KHUSUS LAPTOP / PC WINDOWS x64**\n\nDownload ZIP di bagian Assets, ekstrak seluruh isinya, lalu buka **Layar.exe**. Tidak perlu memasang Node.js/npm. Biarkan folder resources, locales, dan DLL bersama aplikasi.' },
    { tag: 'android-hp-v3.0.5', title: 'Layar Android HP / Tablet v3.0.5', file: 'Layar-Android-HP-v3.0.5.apk',
      text: '**KHUSUS HP / TABLET ANDROID**\n\nDownload dan pasang APK di bagian Assets. Nama aplikasi **Layar HP**. Navigasi sentuh, katalog portrait/landscape, player video landscape. APK memakai debug key CI.' },
    { tag: 'android-tv-v3.0.5', title: 'Layar Android TV / TV Box v3.0.5', file: 'Layar-Android-TV-v3.0.5.apk',
      text: '**KHUSUS ANDROID TV / TV BOX**\n\nDownload dan pasang APK di bagian Assets pada TV. Nama aplikasi **Layar TV**. Navigasi D-Pad remote dan orientasi landscape. APK memakai debug key CI.' }
  ];
  const directory = path.join(__dirname, '..', 'dist', 'platform-releases');
  fs.mkdirSync(directory, { recursive: true });
  for (const platform of platforms) {
    const asset = source.assets.find(asset => asset.name === platform.file);
    if (!asset || asset.size < 1) throw new Error('Missing verified source asset: ' + platform.file);
    const file = path.join(directory, platform.file);
    if (!fs.existsSync(file) || fs.statSync(file).size !== asset.size || asset.digest && await hashFile(file) !== asset.digest) {
      console.log('Downloading', platform.file);
      const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(180000) });
      if (!response.ok || !response.body) throw new Error('Download HTTP ' + response.status);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
    }
    const digest = await hashFile(file);
    if (fs.statSync(file).size !== asset.size || asset.digest && digest !== asset.digest) throw new Error('Source asset checksum mismatch: ' + platform.file);
    const body = platform.text + '\n\nFile identik dengan build v3.0.5 yang telah lolos pemeriksaan.\n\nDownload perangkat lain:\n' +
      platforms.filter(other => other !== platform).map(other => '- [' + other.title + '](https://github.com/' + repo + '/releases/tag/' + other.tag + ')').join('\n');
    let release = await request('releases/tags/' + platform.tag, 'GET', undefined, true);
    if (!release) release = await request('releases', 'POST', {
      tag_name: platform.tag, target_commitish: reference.sha, name: platform.title,
      body, draft: true, prerelease: false, make_latest: 'false'
    });
    if (release.assets.some(other => other.name !== platform.file)) throw new Error('Unexpected assets on ' + platform.tag);
    let uploaded = release.assets.find(other => other.name === platform.file);
    if (!uploaded) {
      const upload = new URL(release.upload_url.replace(/\{.*$/, ''));
      if (upload.origin !== 'https://uploads.github.com') throw new Error('Unexpected GitHub upload host');
      upload.searchParams.set('name', platform.file);
      console.log('Uploading', platform.file);
      const response = await fetch(upload, {
        method: 'POST', headers: { ...headers, 'Content-Type': platform.file.endsWith('.zip') ? 'application/zip' : 'application/vnd.android.package-archive', 'Content-Length': String(asset.size) },
        body: fs.createReadStream(file), duplex: 'half', signal: AbortSignal.timeout(300000)
      });
      if (!response.ok) throw new Error('Upload HTTP ' + response.status + ': ' + platform.file);
      uploaded = await response.json();
    }
    if (uploaded.state !== 'uploaded' || uploaded.size !== asset.size || uploaded.digest && uploaded.digest !== digest) throw new Error('Uploaded asset verification failed: ' + platform.file);
    const published = await request('releases/' + release.id, 'PATCH', { name: platform.title, body, draft: false, prerelease: false, make_latest: 'false' });
    if (published.draft || published.assets.length !== 1) throw new Error('Published release verification failed');
    console.log(JSON.stringify({ platform: platform.title, url: published.html_url, file: platform.file, size: uploaded.size, verified: true }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
