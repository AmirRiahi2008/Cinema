import type { RoomSession, Snapshot } from "./cinema-types";
export class RequestError extends Error {
    constructor(message: string, public status: number, public payload: unknown) { super(message); }
}
const apiOrigin = (import.meta.env.VITE_CINEMA_API_ORIGIN || "").replace(/\/$/, "");
export function cinemaApiUrl(path: string) {
    return `${apiOrigin}/api/cinema/${path.replace(/^\/+/, "")}`;
}
export async function api<T>(path: string, session?: RoomSession | null, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (session)
        headers.set("Authorization", `Bearer ${session.token}`);
    if (options.body && typeof options.body === "string" && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
    const response = await fetch(cinemaApiUrl(path), { ...options, headers, cache: "no-store", credentials: apiOrigin ? "omit" : "same-origin", signal: options.signal ?? AbortSignal.timeout(18000) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok)
        throw new RequestError(typeof payload.error === "string" ? payload.error : (response.status === 409 ? "کنترل پخش هم‌زمان تغییر کرد. وضعیت تازه دریافت شد." : "ارتباط برقرار نشد. دوباره تلاش کن."), response.status, payload);
    return payload as T;
}
const storageKey = "two-seats:sessions:v1";
export function readSessions(): RoomSession[] {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
        return Array.isArray(value) ? value.filter(v => v && /^[\w-]{12,40}$/.test(v.id) && /^[a-f0-9]{48}$/.test(v.token)).slice(0, 20) : [];
    }
    catch {
        return [];
    }
}
export function saveSession(session: RoomSession) {
    try {
        localStorage.setItem(storageKey, JSON.stringify([session, ...readSessions().filter(v => v.id !== session.id)].slice(0, 20)));
    }
    catch { /* The active room still works when device storage is unavailable. */ }
}
export function removeSession(id: string) { try {
    localStorage.setItem(storageKey, JSON.stringify(readSessions().filter(v => v.id !== id)));
}
catch { /* device storage is optional */ } }
export function inviteLink(session: RoomSession) { return `${location.origin}/?room=${session.id}#invite=${session.invite || ""}`; }
export function roomPath(session: RoomSession, suffix = "") { return `rooms/${session.id}${suffix ? "/" + suffix : ""}`; }
export function isSnapshot(value: unknown): value is Snapshot { return !!value && typeof value === "object" && "playback" in value && "room" in value; }
