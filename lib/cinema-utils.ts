export function providerFromUrl(value: string): {
    type: "direct" | "youtube" | "aparat";
    url: string;
    providerId?: string;
} {
    let u: URL;
    try {
        u = new URL(value.trim());
    }
    catch {
        throw new Error("لینک معتبر با https:// وارد کن.");
    }
    if (u.protocol !== "https:" || u.username || u.password)
        throw new Error("فقط لینک امن https پشتیبانی می‌شود.");
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
        const id = host === "youtu.be" ? u.pathname.split("/")[1] : u.searchParams.get("v") || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
        if (!id || !/^[\w-]{11}$/.test(id))
            throw new Error("لینک یک ویدیوی یوتیوب را وارد کن، نه لینک کانال یا پلی‌لیست.");
        return { type: "youtube", providerId: id, url: `https://www.youtube.com/watch?v=${id}` };
    }
    if (host === "aparat.com") {
        const id = u.pathname.match(/\/(?:v|embed)\/([a-zA-Z0-9_-]{4,24})(?:\/|$)/)?.[1] || u.pathname.match(/videohash\/([a-zA-Z0-9_-]{4,24})/)?.[1];
        if (!id)
            throw new Error("لینک یک ویدیوی آپارات را وارد کن؛ مثل aparat.com/v/…");
        return { type: "aparat", providerId: id, url: `https://www.aparat.com/v/${id}` };
    }
    if (/^(localhost|.*\.local|.*\.internal)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(":"))
        throw new Error("لینک فیلم باید روی اینترنت قابل دسترسی باشد.");
    return { type: "direct", url: u.href };
}
export function targetPosition(playback: {
    position: number;
    playing: boolean;
    updatedAt: number;
    rate: number;
}, serverNow: number) {
    return Math.max(0, playback.position + (playback.playing ? Math.max(0, serverNow - playback.updatedAt) / 1000 * playback.rate : 0));
}
export function formatTime(seconds: number) {
    if (!Number.isFinite(seconds))
        return "00:00";
    const s = Math.max(0, Math.floor(seconds));
    return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function fileSize(size: number) {
    if (!size)
        return "";
    return size >= 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(size / 1024 ** 2))} MB`;
}
export function toVtt(input: string): string {
    const s = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
    if (/^WEBVTT(?:\s|$)/.test(s))
        return s;
    if (!/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(s))
        throw new Error("فایل زیرنویس باید SRT یا VTT معتبر باشد.");
    return "WEBVTT\n\n" + s.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}
