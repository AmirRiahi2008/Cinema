import { CHUNK_SIZE, MAX_FILE_SIZE, REACTIONS } from "./cinema-types";
import { providerFromUrl, toVtt } from "./cinema-utils";
type RoomRow = {
    id: string;
    title: string;
    mood: string;
    invite_hash: string | null;
    shared_control: number;
    media_id: string | null;
    position: number;
    playing: number;
    rate: number;
    playback_at: number;
    playback_revision: number;
    actor: string;
    revision: number;
    created_at: number;
};
type MemberRow = {
    room_id: string;
    seat: string;
    token_hash: string;
    name: string;
    avatar: string;
    ready: number;
    last_seen: number;
    typing_until: number;
};
type MediaRow = {
    id: string;
    room_id: string;
    title: string;
    type: string;
    url: string;
    object_key: string | null;
    subtitle_key: string | null;
    mime: string;
    size: number;
    extra: string;
    created_at: number;
};
type UploadRow = {
    id: string;
    room_id: string;
    object_key: string;
    multipart_id: string;
    name: string;
    mime: string;
    size: number;
    status: string;
    created_at: number;
};
type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    CINEMA_FRONTEND_ORIGINS?: string;
};
class ApiError extends Error {
    constructor(public status: number, message: string, public code = "error") { super(message); }
}
function fail(status: number, text: string, code?: string): never { throw new ApiError(status, text, code); }
const totalStorageLimit = 8 * 1024 ** 3;
const validId = (s: string) => /^[a-zA-Z0-9_-]{12,40}$/.test(s);
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
const id = () => crypto.randomUUID().replace(/-/g, "");
async function hash(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join(""); }
async function mediaKey(tokenHash: string) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(tokenHash), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function mediaAccess(room: string, seat: string, tokenHash: string) {
    const until = Math.ceil(Date.now() / 86400000) * 86400000 + 86400000;
    const signature = await crypto.subtle.sign("HMAC", await mediaKey(tokenHash), new TextEncoder().encode(`${room}:${seat}:${until}`));
    const sig = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
    return new URLSearchParams({ seat, until: String(until), sig }).toString();
}
function json(value: unknown, status = 200, cookie?: string) {
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    if (cookie)
        headers.set("Set-Cookie", cookie);
    return new Response(JSON.stringify(value), { status, headers });
}
function roomCookie(request: Request, room: string, value: string) {
    return `ts_${room}=${value}; Path=/api/cinema/rooms/${room}/; HttpOnly; SameSite=Strict; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
function text(value: unknown, max = 80) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
async function readLimited(request: Request, limit: number) {
    const length = Number(request.headers.get("content-length"));
    if (length > limit)
        fail(413, "درخواست بیش از حد بزرگ است.");
    const reader = request.body?.getReader();
    if (!reader)
        return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        received += value.byteLength;
        if (received > limit) {
            await reader.cancel();
            fail(413, "درخواست بیش از حد بزرگ است.");
        }
        chunks.push(value);
    }
    const result = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
async function body(request: Request) {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
        fail(415, "درخواست نامعتبر است.");
    const raw = new TextDecoder().decode(await readLimited(request, 16000));
    try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== "object" || Array.isArray(v))
            throw new Error();
        return v as Record<string, unknown>;
    }
    catch {
        return fail(400, "درخواست نامعتبر است.");
    }
}
async function rateLimit(db: D1Database, key: string, max: number, window = 60000) {
    const now = Date.now();
    const r = await db.prepare("INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at <= ? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at <= ? THEN ? ELSE reset_at END RETURNING count").bind(key, now + window, now, now, now + window).first<{
        count: number;
    }>();
    if (r && r.count > max)
        fail(429, "کمی صبر کن و دوباره امتحان کن.", "rate_limit");
}
async function authorize(request: Request, db: D1Database, roomId: string, allowMediaTicket = false) {
    if (!validId(roomId))
        fail(404, "این اتاق پیدا نشد.");
    const origin = request.headers.get("origin");
    const sameOrigin = !origin || origin === new URL(request.url).origin;
    // A Vercel frontend authenticates with its seat's bearer key. Cross-origin
    // requests must never inherit a visitor's cookies from the backend domain.
    const credential = request.headers.get("authorization")?.replace(/^Bearer /, "") || (sameOrigin ? request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`ts_${roomId}=`))?.split("=")[1] : undefined);
    let member = credential && /^[a-f0-9]{48}$/.test(credential) ? await db.prepare("SELECT * FROM members WHERE room_id=? AND token_hash=?").bind(roomId, await hash(credential)).first<MemberRow>() : null;
    if (!member && allowMediaTicket) {
        const query = new URL(request.url).searchParams, seat = query.get("seat"), until = Number(query.get("until")), sig = query.get("sig") || "";
        if (["host", "guest"].includes(seat || "") && Number.isSafeInteger(until) && until > Date.now() && until <= Date.now() + 2 * 86400000 && /^[a-f0-9]{64}$/.test(sig)) {
            const candidate = await db.prepare("SELECT * FROM members WHERE room_id=? AND seat=?").bind(roomId, seat).first<MemberRow>();
            if (candidate) {
                const signature = Uint8Array.from(sig.match(/../g)!, byte => parseInt(byte, 16));
                if (await crypto.subtle.verify("HMAC", await mediaKey(candidate.token_hash), signature, new TextEncoder().encode(`${roomId}:${seat}:${until}`)))
                    member = candidate;
            }
        }
    }
    if (!member)
        fail(401, "دسترسی این مرورگر به اتاق معتبر نیست. از میزبان لینک تازه بگیر.", "unauthorized");
    const room = await db.prepare("SELECT * FROM rooms WHERE id=?").bind(roomId).first<RoomRow>();
    if (!room)
        fail(404, "این اتاق دیگر وجود ندارد.");
    return { room: room!, member: member!, credential: credential || "" };
}
function host(member: MemberRow) { if (member.seat !== "host")
    fail(403, "این کار فقط برای میزبان امکان‌پذیر است."); }
function control(room: RoomRow, member: MemberRow) { if (!room.shared_control)
    host(member); }
async function snapshot(db: D1Database, roomId: string, seat: string) {
    // A single D1 batch gives a consistent playback revision and source list.
    const [r, m, sources, chats] = await db.batch([
        db.prepare("SELECT * FROM rooms WHERE id=?").bind(roomId),
        db.prepare("SELECT * FROM members WHERE room_id=? ORDER BY seat DESC").bind(roomId),
        db.prepare("SELECT * FROM media WHERE room_id=? ORDER BY created_at ASC").bind(roomId),
        db.prepare("SELECT id,seat,text,kind,client_id,created_at FROM messages WHERE room_id=? ORDER BY id DESC LIMIT 120").bind(roomId),
    ]);
    const room = r.results[0] as unknown as RoomRow;
    if (!room)
        fail(404, "این اتاق حذف شده است.");
    return {
        room: { id: room.id, title: room.title, mood: room.mood, sharedControl: !!room.shared_control, inviteOpen: !!room.invite_hash, revision: room.revision, createdAt: room.created_at },
        me: seat, members: (m.results as unknown as MemberRow[]).map(({ token_hash, room_id, ...publicMember }) => publicMember),
        media: (sources.results as unknown as MediaRow[]).map(v => ({ id: v.id, title: v.title, type: v.type, url: v.url, mime: v.mime, size: v.size, created_at: v.created_at, subtitle: !!v.subtitle_key, extra: JSON.parse(v.extra) })),
        messages: chats.results.reverse(),
        playback: { mediaId: room.media_id, position: room.position, playing: !!room.playing, rate: room.rate, updatedAt: room.playback_at, revision: room.playback_revision, actor: room.actor },
        serverTime: Date.now(),
        mediaAccess: await mediaAccess(roomId, seat, (m.results as unknown as MemberRow[]).find(member => member.seat === seat)!.token_hash),
    };
}
async function systemMessage(db: D1Database, roomId: string, seat: string, message: string) {
    await db.prepare("INSERT INTO messages (room_id,seat,text,kind,client_id,created_at) VALUES (?,?,?,'system',?,?)").bind(roomId, seat, message, id(), Date.now()).run();
}
async function selectMedia(db: D1Database, roomId: string, mediaId: string, seat: string) {
    await db.prepare("UPDATE rooms SET media_id=?,position=0,playing=0,rate=1,playback_at=?,playback_revision=playback_revision+1,revision=revision+1,actor=? WHERE id=?").bind(mediaId, Date.now(), seat, roomId).run();
}
async function resolveAparat(providerId: string): Promise<Record<string, unknown>> {
    // Fixed provider endpoint only. User URLs are never fetched by the server.
    try {
        const response = await fetch(`https://www.aparat.com/api/fa/v1/video/video/show/videohash/${providerId}`, { signal: AbortSignal.timeout(7000), headers: { Accept: "application/json" } });
        if (!response.ok)
            return { providerId, mode: "embed" };
        const payload = await response.json() as {
            data?: {
                attributes?: {
                    title?: string;
                    big_poster?: string;
                    file_link_all?: {
                        profile?: string;
                        urls?: string[];
                    }[];
                };
            };
        };
        const attributes = payload.data?.attributes;
        const qualities = (attributes?.file_link_all ?? []).flatMap(v => {
            const url = v.urls?.find(u => { try {
                return new URL(u).protocol === "https:";
            }
            catch {
                return false;
            } });
            return url ? [{ label: String(v.profile || "اصلی").slice(0, 40), url }] : [];
        });
        return { providerId, mode: qualities.length ? "native" : "embed", qualities, title: attributes?.title, poster: attributes?.big_poster };
    }
    catch {
        return { providerId, mode: "embed" };
    }
}
async function stream(request: Request, bucket: R2Bucket, key: string, mime: string) {
    const meta = await bucket.head(key);
    if (!meta)
        fail(404, "فایل پیدا نشد.");
    const headers = new Headers({ "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "ETag": meta!.httpEtag });
    let range: {
        offset: number;
        length: number;
    } | undefined;
    const raw = request.headers.get("range");
    if (raw && (!request.headers.get("if-range") || request.headers.get("if-range") === meta!.httpEtag)) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
        if (!match || (!match[1] && !match[2])) {
            headers.set("Content-Range", `bytes */${meta!.size}`);
            return new Response(null, { status: 416, headers });
        }
        const start = match[1] ? Number(match[1]) : Math.max(0, meta!.size - Number(match[2]));
        const end = match[1] ? (match[2] ? Math.min(Number(match[2]), meta!.size - 1) : meta!.size - 1) : meta!.size - 1;
        if (start >= meta!.size || end < start || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (!match[1] && Number(match[2]) === 0)) {
            headers.set("Content-Range", `bytes */${meta!.size}`);
            return new Response(null, { status: 416, headers });
        }
        range = { offset: start, length: end - start + 1 };
        headers.set("Content-Range", `bytes ${start}-${end}/${meta!.size}`);
    }
    headers.set("Content-Length", String(range?.length ?? meta!.size));
    if (request.method === "HEAD")
        return new Response(null, { status: range ? 206 : 200, headers });
    const object = await bucket.get(key, range ? { range } : {});
    if (!object || !("body" in object))
        fail(404, "فایل پیدا نشد.");
    return new Response(object!.body as ReadableStream, { status: range ? 206 : 200, headers });
}
async function handleCinemaRoute(request: Request, env: Bindings, path: string[]) {
    try {
        if (!env.DB || !env.BUCKET)
            fail(503, "فضای ذخیره‌سازی آماده نیست. چند لحظه دیگر امتحان کن.");
        const { DB: db, BUCKET: bucket } = env;
        if (!["GET", "HEAD"].includes(request.method)) {
            const origin = request.headers.get("origin");
            if (!origin && request.headers.get("sec-fetch-site") === "cross-site")
                fail(403, "این درخواست از مبدا معتبر ارسال نشده است.");
        }
        if (path[0] !== "rooms")
            fail(404, "مسیر پیدا نشد.");
        if (path.length === 1 && request.method === "POST") {
            const data = await body(request);
            const ip = await hash(request.headers.get("cf-connecting-ip") || request.headers.get("oai-authenticated-user-id") || "anonymous");
            await rateLimit(db, `create:${ip}`, 6, 3600000);
            const roomId = id(), access = token(), invite = token(), now = Date.now();
            const name = text(data.name, 32) || "میزبان";
            const title = text(data.title, 60) || "سینمای ما";
            const mood = ["amber", "rose", "midnight"].includes(String(data.mood)) ? String(data.mood) : "amber";
            const count = await db.prepare("SELECT count(*) AS n FROM rooms").first<{
                n: number;
            }>();
            if (count && count.n >= 100)
                fail(409, "ظرفیت اتاق‌ها پر شده است. یک اتاق قبلی را حذف کن.");
            await db.batch([
                db.prepare("INSERT INTO rooms (id,title,mood,invite_hash,playback_at,created_at) VALUES (?,?,?,?,?,?)").bind(roomId, title, mood, await hash(invite), now, now),
                db.prepare("INSERT INTO members (room_id,seat,token_hash,name,avatar,last_seen) VALUES (?,'host',?,?,'moon',?)").bind(roomId, await hash(access), name, now),
            ]);
            return json({ session: { id: roomId, token: access, invite, seat: "host", title, name, createdAt: now }, snapshot: await snapshot(db, roomId, "host") }, 201, roomCookie(request, roomId, access));
        }
        const roomId = path[1];
        if (!roomId || !validId(roomId))
            fail(404, "اتاق پیدا نشد.");
        if (path[2] === "join" && path.length === 3 && request.method === "POST") {
            const data = await body(request);
            if (typeof data.invite !== "string" || !/^[a-f0-9]{48}$/.test(data.invite))
                fail(400, "لینک دعوت معتبر نیست.");
            const ip = await hash(request.headers.get("cf-connecting-ip") || "anonymous");
            await rateLimit(db, `join:${ip}`, 30, 60000);
            const access = token(), memberHash = await hash(access), inviteHash = await hash(data.invite), now = Date.now();
            const name = text(data.name, 32) || "مهمان";
            // Unique (room_id,seat) and a guarded INSERT atomically reserve the one guest seat.
            const result = await db.batch([
                db.prepare("INSERT OR IGNORE INTO members (room_id,seat,token_hash,name,avatar,last_seen) SELECT id,'guest',?,?,'star',? FROM rooms WHERE id=? AND invite_hash=?").bind(memberHash, name, now, roomId, inviteHash),
                db.prepare("UPDATE rooms SET invite_hash=NULL,revision=revision+1 WHERE id=? AND EXISTS (SELECT 1 FROM members WHERE room_id=? AND seat='guest' AND token_hash=?)").bind(roomId, roomId, memberHash),
            ]);
            if (!result[0].meta.changes)
                fail(409, "این دعوت استفاده شده یا منقضی است. اگر قبلاً وارد شدی، با همان مرورگر برگرد؛ وگرنه از میزبان دعوت تازه بگیر.", "room_full");
            const room = await db.prepare("SELECT title,created_at FROM rooms WHERE id=?").bind(roomId).first<{
                title: string;
                created_at: number;
            }>();
            await systemMessage(db, roomId, "guest", `${name} به سینما رسید. حالا دو صندلی کنار هم‌اند.`);
            return json({ session: { id: roomId, token: access, seat: "guest", title: room!.title, name, createdAt: room!.created_at }, snapshot: await snapshot(db, roomId, "guest") }, 200, roomCookie(request, roomId, access));
        }
        const readOnlyMedia = ["GET", "HEAD"].includes(request.method) && path[2] === "media" && ["stream", "subtitle"].includes(path[4]);
        const { room, member, credential } = await authorize(request, db, roomId, readOnlyMedia);
        if (path.length === 2 && request.method === "GET")
            return json(await snapshot(db, roomId, member.seat));
        if (path[2] === "session" && request.method === "POST")
            return json(await snapshot(db, roomId, member.seat), 200, roomCookie(request, roomId, credential));
        if (path[2] === "heartbeat" && request.method === "POST") {
            const data = await body(request), now = Date.now();
            await db.prepare("UPDATE members SET last_seen=?,typing_until=?,ready=? WHERE room_id=? AND seat=?").bind(now, data.typing ? now + 4500 : 0, data.ready === undefined ? member.ready : data.ready ? 1 : 0, roomId, member.seat).run();
            return json({ ok: true, serverTime: now });
        }
        if (path[2] === "messages" && request.method === "POST") {
            const data = await body(request);
            const value = text(data.text, 1500), clientId = text(data.clientId, 80), kind = data.kind === "reaction" ? "reaction" : "text";
            if (!value || !/^[\w-]{8,80}$/.test(clientId))
                fail(400, "پیام معتبر نیست.");
            if (kind === "reaction" && !REACTIONS.includes(value))
                fail(400, "این واکنش پشتیبانی نمی‌شود.");
            await rateLimit(db, `msg:${member.token_hash}`, 45);
            await db.prepare("INSERT OR IGNORE INTO messages (room_id,seat,text,kind,client_id,created_at) VALUES (?,?,?,?,?,?)").bind(roomId, member.seat, value, kind, clientId, Date.now()).run();
            // Bound history to the latest 500 messages per room.
            await db.batch([
                db.prepare("DELETE FROM messages WHERE room_id=? AND id < COALESCE((SELECT id FROM messages WHERE room_id=? ORDER BY id DESC LIMIT 1 OFFSET 499),0)").bind(roomId, roomId),
                db.prepare("UPDATE members SET typing_until=0,last_seen=? WHERE room_id=? AND seat=?").bind(Date.now(), roomId, member.seat),
            ]);
            return json(await snapshot(db, roomId, member.seat));
        }
        if (path[2] === "playback" && request.method === "POST") {
            control(room, member);
            const data = await body(request);
            if (!room.media_id || data.mediaId !== room.media_id)
                fail(409, "فیلم تغییر کرده است. دوباره تلاش کن.", "stale_media");
            const position = Number(data.position), rate = Number(data.rate ?? room.rate);
            if (!Number.isFinite(position) || position < 0 || position > 604800 || ![0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(rate) || typeof data.playing !== "boolean" || !Number.isInteger(data.revision))
                fail(400, "وضعیت پخش معتبر نیست.");
            await rateLimit(db, `play:${member.token_hash}`, 100);
            const at = Date.now() + (data.countdown && data.playing ? 3000 : 0);
            const result = await db.prepare("UPDATE rooms SET position=?,playing=?,rate=?,playback_at=?,actor=?,playback_revision=playback_revision+1,revision=revision+1 WHERE id=? AND media_id=? AND playback_revision=?").bind(position, data.playing ? 1 : 0, rate, at, member.seat, roomId, room.media_id, data.revision).run();
            return json(await snapshot(db, roomId, member.seat), result.meta.changes ? 200 : 409);
        }
        if (path[2] === "settings" && request.method === "PATCH") {
            host(member);
            const data = await body(request);
            const mood = ["amber", "rose", "midnight"].includes(String(data.mood)) ? String(data.mood) : room.mood;
            await db.prepare("UPDATE rooms SET title=?,mood=?,shared_control=?,revision=revision+1 WHERE id=?").bind(text(data.title, 60) || room.title, mood, data.sharedControl === undefined ? room.shared_control : data.sharedControl ? 1 : 0, roomId).run();
            return json(await snapshot(db, roomId, member.seat));
        }
        if (path[2] === "invite" && request.method === "POST") {
            host(member);
            const data = await body(request);
            const invite = token();
            const guest = await db.prepare("SELECT seat FROM members WHERE room_id=? AND seat='guest'").bind(roomId).first();
            if (guest && !data.reset)
                fail(409, "صندلی دوم اشغال است. برای دعوت تازه، صندلی مهمان را آزاد کن.");
            await db.batch([
                db.prepare("DELETE FROM members WHERE room_id=? AND seat='guest'").bind(roomId),
                db.prepare("UPDATE rooms SET invite_hash=?,revision=revision+1 WHERE id=?").bind(await hash(invite), roomId),
            ]);
            return json({ invite, snapshot: await snapshot(db, roomId, member.seat) });
        }
        if (path[2] === "media" && path.length === 3 && request.method === "POST") {
            host(member);
            const data = await body(request);
            let parsed: ReturnType<typeof providerFromUrl>;
            try {
                parsed = providerFromUrl(String(data.url || ""));
            }
            catch (e) {
                return fail(400, (e as Error).message);
            }
            const count = await db.prepare("SELECT count(*) AS n FROM media WHERE room_id=?").bind(roomId).first<{
                n: number;
            }>();
            if (count && count.n >= 15)
                fail(409, "برای اضافه کردن فیلم تازه، یکی از ۱۵ فیلم فعلی را حذف کن.");
            const mediaId = id();
            const extra = parsed.type === "aparat" ? await resolveAparat(parsed.providerId!) : { providerId: parsed.providerId };
            let filename = new URL(parsed.url).pathname.split("/").pop() || "فیلم جدید";
            try {
                filename = decodeURIComponent(filename);
            }
            catch { /* Keep a malformed escaped filename readable. */ }
            const title = text(data.title, 120) || text(extra.title, 120) || (parsed.type === "youtube" ? "ویدیوی یوتیوب" : parsed.type === "aparat" ? "ویدیوی آپارات" : filename.slice(0, 120));
            const mime = /\.m3u8(?:\?|$)/i.test(parsed.url) ? "application/vnd.apple.mpegurl" : "video/mp4";
            await db.prepare("INSERT INTO media (id,room_id,title,type,url,mime,extra,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(mediaId, roomId, title, parsed.type, parsed.url, mime, JSON.stringify(extra), Date.now()).run();
            if (data.select !== false)
                await selectMedia(db, roomId, mediaId, member.seat);
            return json(await snapshot(db, roomId, member.seat), 201);
        }
        if (path[2] === "media" && path[3]) {
            const source = await db.prepare("SELECT * FROM media WHERE id=? AND room_id=?").bind(path[3], roomId).first<MediaRow>();
            if (!source)
                fail(404, "این فیلم پیدا نشد.");
            if ((path[4] === "stream" || path[4] === "subtitle") && ["GET", "HEAD"].includes(request.method)) {
                const key = path[4] === "subtitle" ? source!.subtitle_key : source!.object_key;
                if (!key)
                    fail(404, "فایل پیدا نشد.");
                return stream(request, bucket, key!, path[4] === "subtitle" ? "text/vtt; charset=utf-8" : source!.mime);
            }
            if (path[4] === "select" && request.method === "POST") {
                control(room, member);
                await selectMedia(db, roomId, source!.id, member.seat);
                return json(await snapshot(db, roomId, member.seat));
            }
            if (path[4] === "resolve" && request.method === "POST") {
                if (source!.type !== "aparat")
                    fail(400, "منبع آپارات نیست.");
                const parsed = providerFromUrl(source!.url);
                const extra = await resolveAparat(parsed.providerId!);
                await db.prepare("UPDATE media SET extra=? WHERE id=?").bind(JSON.stringify(extra), source!.id).run();
                return json(await snapshot(db, roomId, member.seat));
            }
            if (path[4] === "subtitle" && request.method === "PUT") {
                host(member);
                const raw = new TextDecoder().decode(await readLimited(request, 1024 * 1024));
                let vtt: string;
                try {
                    vtt = toVtt(raw);
                }
                catch (e) {
                    return fail(400, (e as Error).message);
                }
                const key = `rooms/${roomId}/${source!.id}.vtt`;
                await bucket.put(key, vtt, { httpMetadata: { contentType: "text/vtt; charset=utf-8" } });
                await db.batch([db.prepare("UPDATE media SET subtitle_key=? WHERE id=?").bind(key, source!.id), db.prepare("UPDATE rooms SET revision=revision+1 WHERE id=?").bind(roomId)]);
                return json(await snapshot(db, roomId, member.seat));
            }
            if (path.length === 4 && request.method === "DELETE") {
                host(member);
                // Revoke access in D1 before removing private objects.
                await db.batch([
                    db.prepare("UPDATE rooms SET media_id=NULL,playing=0,position=0,playback_revision=playback_revision+1,revision=revision+1 WHERE id=? AND media_id=?").bind(roomId, source!.id),
                    db.prepare("DELETE FROM media WHERE id=? AND room_id=?").bind(source!.id, roomId),
                ]);
                const keys = [source!.object_key, source!.subtitle_key].filter(Boolean) as string[];
                if (keys.length)
                    await bucket.delete(keys);
                return json(await snapshot(db, roomId, member.seat));
            }
        }
        if (path[2] === "uploads" && path.length === 3 && request.method === "POST") {
            host(member);
            const data = await body(request);
            const size = Number(data.size);
            // R2 automatically aborts incomplete multipart uploads after seven days.
            await db.prepare("DELETE FROM uploads WHERE created_at < ?").bind(Date.now() - 7 * 86400000).run();
            const name = text(data.name, 120), mime = text(data.mime, 80) || "video/mp4";
            if (!name || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE || !["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-m4v", "video/ogg"].includes(mime))
                fail(400, "یک فایل ویدیویی معتبر تا ۴ گیگابایت انتخاب کن.");
            const uploadsCount = await db.prepare("SELECT count(*) AS n FROM uploads WHERE room_id=?").bind(roomId).first<{
                n: number;
            }>();
            const mediaCount = await db.prepare("SELECT count(*) AS n FROM media WHERE room_id=?").bind(roomId).first<{
                n: number;
            }>();
            if ((uploadsCount?.n ?? 0) > 1 || (mediaCount?.n ?? 0) >= 15)
                fail(409, "ابتدا آپلود فعلی را کامل کن یا یک فیلم را حذف کن.");
            const uploadId = id(), key = `rooms/${roomId}/${uploadId}`;
            const multipart = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: mime }, customMetadata: { roomId, name } });
            // Reserve bytes with one guarded statement to prevent concurrent quota bypass.
            const result = await db.prepare("INSERT INTO uploads (id,room_id,object_key,multipart_id,name,mime,size,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM media) + (SELECT COALESCE(SUM(size),0) FROM uploads) + ? <= ?").bind(uploadId, roomId, key, multipart.uploadId, name, mime, size, Date.now(), size, totalStorageLimit).run();
            if (!result.meta.changes) {
                await multipart.abort();
                fail(409, "فضای فیلم‌ها پر شده است. یک فیلم یا اتاق قبلی را حذف کن.", "storage_full");
            }
            return json({ id: uploadId, chunkSize: CHUNK_SIZE, parts: Math.ceil(size / CHUNK_SIZE) }, 201);
        }
        if (path[2] === "uploads" && path.length === 3 && request.method === "GET") {
            host(member);
            const pending = await db.prepare("SELECT id,name,size,status FROM uploads WHERE room_id=? ORDER BY created_at").bind(roomId).all();
            return json({ uploads: pending.results });
        }
        if (path[2] === "uploads" && path[3]) {
            host(member);
            const upload = await db.prepare("SELECT * FROM uploads WHERE id=? AND room_id=?").bind(path[3], roomId).first<UploadRow>();
            if (!upload) {
                // A client may retry after the final response was lost. Completion is idempotent.
                if (path[4] === "complete" && request.method === "POST") {
                    const done = await db.prepare("SELECT id FROM media WHERE id=? AND room_id=? AND type='upload'").bind(path[3], roomId).first();
                    if (done)
                        return json(await snapshot(db, roomId, member.seat));
                }
                fail(404, "این آپلود پیدا نشد.");
            }
            const multipart = bucket.resumeMultipartUpload(upload!.object_key, upload!.multipart_id);
            if (path[4] === "parts" && request.method === "PUT") {
                if (upload!.status !== "active")
                    fail(409, "آپلود در حال نهایی شدن است.");
                const n = Number(path[5]), expected = Math.ceil(upload!.size / CHUNK_SIZE);
                if (!Number.isInteger(n) || n < 1 || n > expected)
                    fail(400, "شماره بخش معتبر نیست.");
                const requiredSize = n === expected ? upload!.size - (n - 1) * CHUNK_SIZE : CHUNK_SIZE;
                const length = Number(request.headers.get("content-length"));
                if (length && length !== requiredSize)
                    fail(400, "اندازه بخش آپلود معتبر نیست.");
                const bytes = await readLimited(request, requiredSize);
                if (bytes.byteLength !== requiredSize)
                    fail(400, "بخش آپلود کامل دریافت نشد.");
                const part = await multipart.uploadPart(n, bytes);
                await db.prepare("INSERT INTO upload_parts (upload_id,part_number,etag,bytes) VALUES (?,?,?,?) ON CONFLICT(upload_id,part_number) DO UPDATE SET etag=excluded.etag,bytes=excluded.bytes").bind(upload!.id, n, part.etag, bytes.byteLength).run();
                return json({ partNumber: n, etag: part.etag });
            }
            if (path[4] === "complete" && request.method === "POST") {
                const parts = await db.prepare("SELECT part_number AS partNumber,etag,bytes FROM upload_parts WHERE upload_id=? ORDER BY part_number").bind(upload!.id).all<{
                    partNumber: number;
                    etag: string;
                    bytes: number;
                }>();
                if (parts.results.length !== Math.ceil(upload!.size / CHUNK_SIZE) || parts.results.reduce((sum, p) => sum + p.bytes, 0) !== upload!.size)
                    fail(400, "همه بخش‌های فیلم هنوز نرسیده‌اند.");
                const locked = await db.prepare("UPDATE uploads SET status='completing' WHERE id=? AND status='active'").bind(upload!.id).run();
                if (!locked.meta.changes)
                    fail(409, "فیلم در حال نهایی شدن است.");
                try {
                    const previousObject = await bucket.head(upload!.object_key);
                    const completed = previousObject ?? await multipart.complete(parts.results.map(p => ({ partNumber: p.partNumber, etag: p.etag })));
                    if (completed.size !== upload!.size) {
                        await bucket.delete(upload!.object_key);
                        fail(400, "فایل نهایی کامل نیست.");
                    }
                    await db.batch([
                        db.prepare("INSERT INTO media (id,room_id,title,type,object_key,mime,size,created_at) VALUES (?,?,?,'upload',?,?,?,?)").bind(upload!.id, roomId, upload!.name, upload!.object_key, upload!.mime, upload!.size, Date.now()),
                        db.prepare("DELETE FROM uploads WHERE id=?").bind(upload!.id),
                    ]);
                    await selectMedia(db, roomId, upload!.id, member.seat);
                    return json(await snapshot(db, roomId, member.seat));
                }
                catch (e) {
                    await db.prepare("UPDATE uploads SET status='active' WHERE id=?").bind(upload!.id).run();
                    throw e;
                }
            }
            if (path.length === 4 && request.method === "DELETE") {
                const locked = await db.prepare("UPDATE uploads SET status='aborting' WHERE id=? AND status='active'").bind(upload!.id).run();
                if (!locked.meta.changes)
                    fail(409, "صبر کن تا فیلم نهایی شود.");
                try {
                    await multipart.abort();
                }
                catch (e) {
                    await db.prepare("UPDATE uploads SET status='active' WHERE id=?").bind(upload!.id).run();
                    throw e;
                }
                await db.prepare("DELETE FROM uploads WHERE id=?").bind(upload!.id).run();
                return json({ ok: true });
            }
            if (path.length === 4 && request.method === "GET") {
                const parts = await db.prepare("SELECT part_number AS partNumber,etag FROM upload_parts WHERE upload_id=? ORDER BY part_number").bind(upload!.id).all();
                return json({ id: upload!.id, size: upload!.size, name: upload!.name, parts: parts.results, chunkSize: CHUNK_SIZE });
            }
        }
        if (path.length === 2 && request.method === "DELETE") {
            host(member);
            const sources = await db.prepare("SELECT object_key,subtitle_key FROM media WHERE room_id=?").bind(roomId).all<{
                object_key: string | null;
                subtitle_key: string | null;
            }>();
            const pending = await db.prepare("SELECT * FROM uploads WHERE room_id=?").bind(roomId).all<UploadRow>();
            for (const u of pending.results) {
                try {
                    await bucket.resumeMultipartUpload(u.object_key, u.multipart_id).abort();
                }
                catch { /* R2 already completed/aborted */ }
            }
            const keys = sources.results.flatMap(v => [v.object_key, v.subtitle_key]).filter(Boolean) as string[];
            await db.prepare("DELETE FROM rooms WHERE id=?").bind(roomId).run();
            if (keys.length)
                await bucket.delete(keys);
            return json({ ok: true });
        }
        return fail(404, "مسیر پیدا نشد.");
    }
    catch (e) {
        if (e instanceof ApiError)
            return json({ error: e.message, code: e.code }, e.status);
        console.error("Cinema request failed", (e as Error).message);
        return json({ error: "ارتباط با سینما کامل نشد. دوباره امتحان کن.", code: "server_error" }, 500);
    }
}

function allowedFrontendOrigin(request: Request, env: Bindings): boolean {
    const origin = request.headers.get("origin");
    if (!origin || origin === new URL(request.url).origin) return true;
    try {
        const url = new URL(origin);
        if (url.origin !== origin) return false;
        if (url.protocol === "https:" && url.hostname.endsWith(".vercel.app")) return true;
        if (["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin)) return true;
        return url.protocol === "https:" && (env.CINEMA_FRONTEND_ORIGINS || "").split(",").map(value => value.trim()).includes(origin);
    } catch { return false; }
}

export async function handleCinemaRequest(request: Request, env: Bindings, path: string[]) {
    if (!allowedFrontendOrigin(request, env)) return json({ error: "دامنهٔ این رابط برای اتصال به سینما فعال نشده است.", code: "origin_not_allowed" }, 403);
    const response = request.method === "OPTIONS" ? new Response(null, { status: 204 }) : await handleCinemaRoute(request, env, path);
    const origin = request.headers.get("origin");
    if (!origin) return response;
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, If-Range");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag");
    headers.set("Access-Control-Max-Age", "600");
    headers.append("Vary", "Origin");
    // No Access-Control-Allow-Credentials: cross-origin clients use explicit
    // bearer keys or expiring read-only media signatures, never ambient cookies.
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
