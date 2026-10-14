import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { Miniflare, Log, LogLevel } = await import(pathToFileURL(require.resolve('miniflare', { paths: [require.resolve('wrangler/package.json')] })).href);
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [require.resolve('vite/package.json')] })).href);
const built = process.argv.includes('--built');
async function workerModules(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await workerModules(filename));
    else if (/\.m?js$/.test(entry.name)) result.push({ type: 'ESModule', path: filename });
  }
  return result;
}
const modules = built ? await workerModules(path.resolve('dist/server')) : true;
const backend = built ? null : await build({ stdin: { contents: `import { handleCinemaRequest } from './lib/cinema-server.ts';export default { fetch(request,env){return handleCinemaRequest(request,env,new URL(request.url).pathname.split('/').slice(3));}}`, resolveDir: process.cwd() }, bundle: true, format: 'esm', write: false, platform: 'browser', target: 'es2022' });

await test('two seats: private room, synchronized playback, chat and private uploads', async t => {
  if (built) modules.sort((a,b) => (a.path.endsWith('/index.js') ? -1 : 0) - (b.path.endsWith('/index.js') ? -1 : 0));
  const mf = new Miniflare({ modules, ...(built ? { modulesRoot: path.resolve('dist/server') } : { script: backend.outputFiles[0].text }), compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['BUCKET'], cf: false, log: new Log(LogLevel.ERROR), outboundService: async request => {
    const u = new URL(request.url);
    if (u.hostname === 'www.aparat.com') {
      if (u.pathname.includes('unavailable')) return new Response('{}', { status: 404 });
      return Response.json({ data: { attributes: { title: 'ویدیوی آزمایشی آپارات', file_link_all: [{ profile: '720p', urls: ['https://media.aparat.com/example.mp4'] }, { profile: '1080p', urls: ['https://media.aparat.com/example-hd.mp4'] }] } } });
    }
    return new Response('External resources are not used by integration tests.', { status: 404 });
  } });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) {
      for (const statement of (await readFile(`drizzle/${file}`, 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) await db.prepare(statement.trim()).run();
    }
    const bucket = await mf.getR2Bucket('BUCKET');
    async function request(suffix, member, method = 'GET', body, extra = {}) {
      const headers = new Headers(extra);
      if (member) headers.set('Authorization', `Bearer ${member.token}`);
      if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') { headers.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
      const response = await mf.dispatchFetch(`https://cinema.test/api/cinema/${suffix}`, { method, headers, body });
      const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null;
      return { response, data, status: response.status };
    }
    let owner, guest, roomId, hostCookie, current, fileId;
    await t.test('host receives a private access key and a separate invitation', async () => {
      const result = await request('rooms', null, 'POST', { title: 'اتاق تست', name: 'امیر', mood: 'amber' });
      assert.equal(result.status, 201, JSON.stringify(result.data)); owner = result.data.session; roomId = owner.id; current = result.data.snapshot;
      hostCookie = result.response.headers.get('set-cookie').split(';')[0];
      assert.notEqual(owner.token, owner.invite); assert.equal(current.members.length, 1); assert.equal(current.me, 'host');
      assert(!JSON.stringify(current).includes(owner.token)); assert(!JSON.stringify(current).includes('token_hash'));
    });
    await t.test('anonymous users and invitation tokens cannot read the room', async () => {
      assert.equal((await request(`rooms/${roomId}`, null)).status, 401);
      assert.equal((await request(`rooms/${roomId}`, { token: owner.invite })).status, 401);
    });
    await t.test('Vercel preflight enables the browser API without allowing credential cookies', async () => {
      const origin = 'https://two-seats-preview.vercel.app';
      const preflight = await request(`rooms/${roomId}/settings`, null, 'OPTIONS', undefined, { Origin: origin, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.response.headers.get('access-control-allow-origin'), origin);
      assert.match(preflight.response.headers.get('access-control-allow-headers'), /Authorization/);
      assert.equal(preflight.response.headers.get('access-control-allow-credentials'), null);
      const authorized = await request(`rooms/${roomId}`, owner, 'GET', undefined, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' });
      assert.equal(authorized.status, 200);
      assert.equal(authorized.response.headers.get('access-control-allow-origin'), origin);
      const cookieOnly = await request(`rooms/${roomId}/settings`, null, 'PATCH', { title: 'not authorized' }, { Origin: origin, Cookie: hostCookie, 'Sec-Fetch-Site': 'cross-site' });
      assert.equal(cookieOnly.status, 401);
      const write = await request(`rooms/${roomId}/settings`, owner, 'PATCH', { title: 'اتاق تست' }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' });
      assert.equal(write.status, 200);
    });
    await t.test('unapproved origins and lookalike Vercel domains are rejected', async () => {
      for (const origin of ['https://other.test', 'https://preview.vercel.app.evil.test', 'http://preview.vercel.app', 'null']) {
        const result = await request(`rooms/${roomId}`, owner, 'GET', undefined, { Origin: origin });
        assert.equal(result.status, 403);
        assert.equal(result.response.headers.get('access-control-allow-origin'), null);
      }
      assert.equal((await request(`rooms/${roomId}`, owner, 'GET', undefined, { Origin: 'http://localhost:5173' })).status, 200);
    });
    await t.test('two simultaneous invite redemptions admit exactly one guest', async () => {
      const results = await Promise.all([request(`rooms/${roomId}/join`, null, 'POST', { invite: owner.invite, name: 'پارتنر' }), request(`rooms/${roomId}/join`, null, 'POST', { invite: owner.invite, name: 'نفر سوم' })]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); guest = results.find(r => r.status === 200).data.session;
      const result = await request(`rooms/${roomId}`, owner); current = result.data;
      assert.equal(current.members.length, 2); assert.equal(current.room.inviteOpen, false);
      assert.equal((await request(`rooms/${roomId}`, guest)).data.me, 'guest');
    });
    await t.test('guests cannot change settings, add a source, upload or delete the room', async () => {
      assert.equal((await request(`rooms/${roomId}/settings`, guest, 'PATCH', { title: 'bad' })).status, 403);
      assert.equal((await request(`rooms/${roomId}/media`, guest, 'POST', { url: 'https://example.com/movie.mp4' })).status, 403);
      assert.equal((await request(`rooms/${roomId}/uploads`, guest, 'POST', { name: 'movie.mp4', size: 10 })).status, 403);
      assert.equal((await request(`rooms/${roomId}`, guest, 'DELETE')).status, 403);
    });
    await t.test('chat supports Persian and retries without duplicating a message', async () => {
      const input = { text: 'سلام، با هم ببینیم ❤️ <script>alert(1)</script>', clientId: 'stable-client-123456' };
      assert.equal((await request(`rooms/${roomId}/messages`, owner, 'POST', input)).status, 200);
      await request(`rooms/${roomId}/messages`, owner, 'POST', input);
      const next = await request(`rooms/${roomId}`, guest);
      assert.equal(next.data.messages.filter(m => m.client_id === input.clientId).length, 1);
      assert.equal(next.data.messages.find(m => m.client_id === input.clientId).text, input.text);
      const reaction = await request(`rooms/${roomId}/messages`, guest, 'POST', { text: '❤️', kind: 'reaction', clientId: 'reaction-client-123456' });
      assert.equal(reaction.status, 200); assert(reaction.data.messages.some(m => m.kind === 'reaction'));
    });
    await t.test('presence, typing and readiness are stored independently for both seats', async () => {
      await request(`rooms/${roomId}/heartbeat`, owner, 'POST', { ready: true });
      await request(`rooms/${roomId}/heartbeat`, guest, 'POST', { ready: true, typing: true });
      const { data } = await request(`rooms/${roomId}`, owner);
      assert(data.members.every(m => m.ready === 1)); assert(data.members.find(m => m.seat === 'guest').typing_until > data.serverTime);
    });
    await t.test('playback uses server time, shared controls and conflict protection', async () => {
      const add = await request(`rooms/${roomId}/media`, owner, 'POST', { url: 'https://example.com/movie.mp4', title: 'فیلم نمونه' });
      assert.equal(add.status, 201); current = add.data;
      const payload = { mediaId: current.playback.mediaId, position: 42, playing: true, rate: 1, revision: current.playback.revision, countdown: true };
      const play = await request(`rooms/${roomId}/playback`, owner, 'POST', payload); assert.equal(play.status, 200); current = play.data;
      assert.equal(current.playback.position, 42); assert.equal(current.playback.playing, true); assert(current.playback.updatedAt > current.serverTime + 2000);
      const conflict = await request(`rooms/${roomId}/playback`, guest, 'POST', { ...payload, position: 9 });
      assert.equal(conflict.status, 409); assert.equal(conflict.data.playback.position, 42);
      const pause = await request(`rooms/${roomId}/playback`, guest, 'POST', { ...payload, position: 50, playing: false, revision: current.playback.revision }); assert.equal(pause.status, 200); current = pause.data;
      await request(`rooms/${roomId}/settings`, owner, 'PATCH', { sharedControl: false });
      assert.equal((await request(`rooms/${roomId}/playback`, guest, 'POST', { ...payload, revision: current.playback.revision })).status, 403);
      await request(`rooms/${roomId}/settings`, owner, 'PATCH', { sharedControl: true });
    });
    await t.test('a cross-origin write and oversized payload are rejected', async () => {
      assert.equal((await request(`rooms/${roomId}/settings`, owner, 'PATCH', {}, { Origin: 'https://other.test' })).status, 403);
      assert.equal((await request(`rooms/${roomId}/messages`, owner, 'POST', { text: 'x'.repeat(20000), clientId: 'oversized-message-123' })).status, 413);
      assert.equal((await request(`rooms/${roomId}/media`, owner, 'POST', { url: 'javascript:alert(1)' })).status, 400);
      assert.equal((await request(`rooms/${roomId}/media`, owner, 'POST', { url: 'https://127.0.0.1/movie.mp4' })).status, 400);
    });
    const chunkSize = 8 * 1024 * 1024, fixture = new Uint8Array(chunkSize + 57); fixture.forEach((_,i) => fixture[i] = i % 251);
    await t.test('multipart upload enforces exact parts, supports retries and completes once', async () => {
      const init = await request(`rooms/${roomId}/uploads`, owner, 'POST', { name: 'original.mp4', mime: 'video/mp4', size: fixture.length });
      assert.equal(init.status, 201); fileId = init.data.id; assert.equal(init.data.chunkSize, chunkSize);
      assert.equal((await request(`rooms/${roomId}/uploads/${fileId}/complete`, owner, 'POST')).status, 400);
      assert.equal((await request(`rooms/${roomId}/uploads/${fileId}/parts/1`, owner, 'PUT', new Uint8Array(20))).status, 400);
      assert.equal((await request(`rooms/${roomId}/uploads/${fileId}/parts/1`, owner, 'PUT', fixture.slice(0,chunkSize))).status, 200);
      const manifest = await request(`rooms/${roomId}/uploads/${fileId}`, owner); assert.equal(manifest.data.parts.length, 1);
      assert.equal((await request(`rooms/${roomId}/uploads/${fileId}/parts/1`, owner, 'PUT', fixture.slice(0,chunkSize))).status, 200);
      assert.equal((await request(`rooms/${roomId}/uploads/${fileId}/parts/2`, owner, 'PUT', fixture.slice(chunkSize))).status, 200);
      const complete = await request(`rooms/${roomId}/uploads/${fileId}/complete`, owner, 'POST'); assert.equal(complete.status, 200, JSON.stringify(complete.data));
      assert.equal(complete.data.playback.mediaId, fileId); assert.equal(complete.data.media.find(m => m.id === fileId).size, fixture.length);
      const retry = await request(`rooms/${roomId}/uploads/${fileId}/complete`, owner, 'POST'); assert.equal(retry.status, 200); assert.equal(retry.data.media.filter(m => m.id === fileId).length, 1);
    });
    await t.test('private media streams preserve bytes and implement Range, suffix, HEAD and 416', async () => {
      const endpoint = `rooms/${roomId}/media/${fileId}/stream`;
      assert.equal((await request(endpoint, null)).status, 401);
      const ticket = (await request(`rooms/${roomId}`, guest)).data.mediaAccess;
      const ticketed = await request(`${endpoint}?${ticket}`, null, 'GET', undefined, { Range: 'bytes=0-3' });
      assert.equal(ticketed.status, 206); assert.deepEqual(new Uint8Array(await ticketed.response.arrayBuffer()), fixture.slice(0,4));
      const corsMedia = await request(`${endpoint}?${ticket}`, null, 'GET', undefined, { Origin: 'https://two-seats-preview.vercel.app', Range: 'bytes=0-3' });
      assert.equal(corsMedia.status, 206);
      assert.equal(corsMedia.response.headers.get('access-control-allow-origin'), 'https://two-seats-preview.vercel.app');
      assert.match(corsMedia.response.headers.get('access-control-expose-headers'), /Content-Range/);
      assert.deepEqual(new Uint8Array(await corsMedia.response.arrayBuffer()), fixture.slice(0,4));
      assert.equal((await request(`rooms/${roomId}?${ticket}`, null)).status, 401);
      assert.equal((await request(`${endpoint}?${ticket.replace(/sig=./,'sig=z')}`, null)).status, 401);
      const range = await request(endpoint, guest, 'GET', undefined, { Range: 'bytes=23-48' }); assert.equal(range.status, 206); assert.equal(range.response.headers.get('content-range'), `bytes 23-48/${fixture.length}`); assert.deepEqual(new Uint8Array(await range.response.arrayBuffer()), fixture.slice(23,49));
      const suffix = await request(endpoint, null, 'GET', undefined, { Cookie: hostCookie, Range: 'bytes=-20' }); assert.equal(suffix.status, 206); assert.deepEqual(new Uint8Array(await suffix.response.arrayBuffer()), fixture.slice(-20));
      const head = await request(endpoint, owner, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.response.headers.get('content-length'), String(fixture.length)); assert.equal((await head.response.arrayBuffer()).byteLength, 0);
      assert.equal((await request(endpoint, owner, 'GET', undefined, { Range: 'bytes=99999999-' })).status, 416);
      assert.equal((await request(endpoint, owner, 'GET', undefined, { Range: 'bytes=1-2,3-4' })).status, 416);
    });
    await t.test('subtitles convert SRT to shared VTT and remain private', async () => {
      const srt = '1\n00:00:01,000 --> 00:00:03,000\nسلام از صندلی دوم\n';
      const result = await request(`rooms/${roomId}/media/${fileId}/subtitle`, owner, 'PUT', srt, { 'Content-Type': 'text/plain' }); assert.equal(result.status, 200);
      const subtitle = await request(`rooms/${roomId}/media/${fileId}/subtitle`, guest); assert.match(await subtitle.response.text(), /^WEBVTT\n\n1\n00:00:01\.000/);
      assert.equal((await request(`rooms/${roomId}/media/${fileId}/subtitle`, null)).status, 401);
    });
    await t.test('YouTube links are normalized and Aparat has native and explicit embed fallback', async () => {
      const youtube = await request(`rooms/${roomId}/media`, owner, 'POST', { url: 'https://youtu.be/M7lc1UVf-VE?t=10' }); assert.equal(youtube.status, 201); assert.equal(youtube.data.media.at(-1).extra.providerId, 'M7lc1UVf-VE');
      const aparat = await request(`rooms/${roomId}/media`, owner, 'POST', { url: 'https://www.aparat.com/v/publicVideo' }); assert.equal(aparat.status, 201); assert.equal(aparat.data.media.at(-1).extra.mode, 'native');
      const fallback = await request(`rooms/${roomId}/media`, owner, 'POST', { url: 'https://www.aparat.com/v/unavailable' }); assert.equal(fallback.status, 201); assert.equal(fallback.data.media.at(-1).extra.mode, 'embed');
    });
    await t.test('another room cannot access the film or write into the first room', async () => {
      const second = await request('rooms', null, 'POST', { name: 'another', title: 'another' });
      assert.equal((await request(`rooms/${roomId}/media/${fileId}/stream`, second.data.session)).status, 401);
      assert.equal((await request(`rooms/${second.data.session.id}/media/${fileId}/stream`, owner)).status, 401);
      await request(`rooms/${second.data.session.id}`, second.data.session, 'DELETE');
    });
    await t.test('resetting the invitation revokes the old guest and requires a new link', async () => {
      const result = await request(`rooms/${roomId}/invite`, owner, 'POST', { reset: true }); assert.equal(result.status, 200);
      assert.equal((await request(`rooms/${roomId}`, guest)).status, 401);
      assert.equal((await request(`rooms/${roomId}/join`, null, 'POST', { invite: owner.invite, name: 'old link' })).status, 409);
      const join = await request(`rooms/${roomId}/join`, null, 'POST', { invite: result.data.invite, name: 'پارتنر دوباره' }); assert.equal(join.status, 200); guest = join.data.session;
    });
    await t.test('deleting a movie removes the original bytes and its subtitle', async () => {
      const result = await request(`rooms/${roomId}/media/${fileId}`, owner, 'DELETE'); assert.equal(result.status, 200);
      assert.equal((await request(`rooms/${roomId}/media/${fileId}/stream`, guest)).status, 404);
      assert.equal(await bucket.head(`rooms/${roomId}/${fileId}`), null); assert.equal(await bucket.head(`rooms/${roomId}/${fileId}.vtt`), null);
    });
    await t.test('deleting a room removes membership, chat and all sources', async () => {
      assert.equal((await request(`rooms/${roomId}`, owner, 'DELETE')).status, 200);
      for (const table of ['rooms','members','messages','media','uploads']) assert.equal((await db.prepare(`SELECT COUNT(*) as n FROM ${table}`).first()).n, 0);
      assert.equal((await request(`rooms/${roomId}`, guest)).status, 401);
    });
    if (built) await t.test('the built application serves Persian HTML and metadata', async () => {
      const response = await mf.dispatchFetch('https://cinema.test/'); assert.equal(response.status, 200); const html = await response.text(); assert.match(html, /دو صندلی/); assert.match(html, /dir="rtl"/); assert.match(html, /امشب/); assert(!html.includes('Starter Project'));
    });
  } finally { await mf.dispose(); }
});
