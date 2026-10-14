"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Link2, Film, CloudUpload, Check, LoaderCircle, X, AlertCircle, ArrowUpLeft, RefreshCw } from "lucide-react";
import { Youtube } from "./cinema-art";
import { api, cinemaApiUrl, RequestError, roomPath } from "@/lib/cinema-client";
import { CHUNK_SIZE, MAX_FILE_SIZE, type RoomSession, type Snapshot } from "@/lib/cinema-types";
import { fileSize, providerFromUrl } from "@/lib/cinema-utils";
import { Modal } from "./modal";
type UploadCheckpoint = {
    id: string;
    name: string;
    size: number;
    modified: number;
};
export function SourceModal({ session, onClose, onState, notify }: {
    session: RoomSession;
    onClose: () => void;
    onState: (state: Snapshot) => void;
    notify: (message: string) => void;
}) {
    const [tab, setTab] = useState<"upload" | "link">("link"), [url, setUrl] = useState(""), [title, setTitle] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const [file, setFile] = useState<File | null>(null), [progress, setProgress] = useState(0), [phase, setPhase] = useState(""), [dragging, setDragging] = useState(false);
    const input = useRef<HTMLInputElement>(null), abort = useRef<AbortController | null>(null), uploadId = useRef<string | null>(null);
    const cancelling = useRef(false);
    const [unfinished, setUnfinished] = useState<{
        id: string;
        name: string;
        size: number;
        status: string;
    }[]>([]);
    const checkpointKey = `two-seats:upload:${session.id}`;
    useEffect(() => { api<{
        uploads: typeof unfinished;
    }>(roomPath(session, "uploads"), session).then(r => setUnfinished(r.uploads)).catch(() => { }); }, [session]);
    let detected: ReturnType<typeof providerFromUrl> | null = null;
    try {
        if (url)
            detected = providerFromUrl(url);
    }
    catch { /* inline validation appears on submission */ }
    const close = () => { if (busy) {
        notify("آپلود یا افزودن فیلم در حال انجام است؛ برای قطع آپلود، «لغو» را بزن.");
        return;
    } onClose(); };
    async function addLink(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            providerFromUrl(url);
            const next = await api<Snapshot>(roomPath(session, "media"), session, { method: "POST", body: JSON.stringify({ url, title }) });
            onState(next);
            notify("فیلم روی پرده قرار گرفت.");
            onClose();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    function uploadPart(partNumber: number, blob: Blob, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", cinemaApiUrl(roomPath(session, `uploads/${uploadId.current}/parts/${partNumber}`)));
            xhr.setRequestHeader("Authorization", `Bearer ${session.token}`);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.timeout = 120000;
            const cancel = () => xhr.abort();
            signal.addEventListener("abort", cancel, { once: true });
            const finish = () => signal.removeEventListener("abort", cancel);
            xhr.upload.onprogress = e => onProgress(e.loaded);
            xhr.onload = () => { finish(); if (xhr.status >= 200 && xhr.status < 300)
                resolve();
            else {
                let error = "این بخش از فیلم ارسال نشد.";
                try {
                    error = JSON.parse(xhr.responseText).error || error;
                }
                catch { }
                reject(new Error(error));
            } };
            xhr.onerror = () => { finish(); reject(new Error("ارتباط هنگام آپلود قطع شد. دوباره همین فایل را انتخاب کن تا ادامه پیدا کند.")); };
            xhr.ontimeout = () => { finish(); reject(new Error("ارسال این بخش طول کشید. اتصال را بررسی کن و دوباره امتحان کن.")); };
            xhr.onabort = () => { finish(); reject(new DOMException("لغو شد", "AbortError")); };
            if (signal.aborted) {
                reject(new DOMException("لغو شد", "AbortError"));
                return;
            }
            xhr.send(blob);
        });
    }
    async function startUpload(selected: File) {
        if (busy)
            return;
        setError("");
        setFile(selected);
        setProgress(0);
        if (selected.size === 0 || selected.size > MAX_FILE_SIZE) {
            setError("فیلم باید بیشتر از صفر و حداکثر ۴ گیگابایت باشد.");
            return;
        }
        const extension = selected.name.split(".").pop()?.toLowerCase();
        const mime = selected.type || ({ mp4: "video/mp4", m4v: "video/x-m4v", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", ogv: "video/ogg" } as Record<string, string>)[extension || ""];
        if (!mime?.startsWith("video/")) {
            setError("یک فایل فیلم انتخاب کن؛ MP4 و WebM بهترین سازگاری را دارند.");
            return;
        }
        cancelling.current = false;
        setBusy(true);
        setPhase("آماده‌سازی آپلود…");
        const controller = new AbortController();
        abort.current = controller;
        let checkpoint: UploadCheckpoint | null = null;
        try {
            checkpoint = JSON.parse(localStorage.getItem(checkpointKey) || "null");
        }
        catch { }
        try {
            let doneParts: number[] = [];
            if (checkpoint && checkpoint.name === selected.name && checkpoint.size === selected.size && checkpoint.modified === selected.lastModified) {
                try {
                    const resumed = await api<{
                        parts: {
                            partNumber: number;
                        }[];
                    }>(roomPath(session, `uploads/${checkpoint.id}`), session, { signal: controller.signal });
                    uploadId.current = checkpoint.id;
                    doneParts = resumed.parts.map(p => p.partNumber);
                }
                catch (e) {
                    if (!(e instanceof RequestError && e.status === 404))
                        throw e;
                }
            }
            if (!uploadId.current) {
                if (checkpoint) {
                    try {
                        await api(roomPath(session, `uploads/${checkpoint.id}`), session, { method: "DELETE", signal: controller.signal });
                    }
                    catch { }
                }
                const init = await api<{
                    id: string;
                }>(roomPath(session, "uploads"), session, { method: "POST", body: JSON.stringify({ name: title.trim() || selected.name, mime, size: selected.size }), signal: controller.signal });
                uploadId.current = init.id;
                try {
                    localStorage.setItem(checkpointKey, JSON.stringify({ id: init.id, name: selected.name, size: selected.size, modified: selected.lastModified }));
                }
                catch { }
            }
            const count = Math.ceil(selected.size / CHUNK_SIZE), loaded = new Map<number, number>();
            for (const n of doneParts)
                loaded.set(n, Math.min(CHUNK_SIZE, selected.size - (n - 1) * CHUNK_SIZE));
            const update = () => setProgress(Math.min(99, Math.floor(Array.from(loaded.values()).reduce((a, b) => a + b, 0) / selected.size * 100)));
            update();
            setPhase(doneParts.length ? "ادامهٔ آپلود از بخش‌های باقی‌مانده" : "در حال فرستادن فیلم به سینمای شما");
            const pending = Array.from({ length: count }, (_, i) => i + 1).filter(n => !doneParts.includes(n));
            let cursor = 0;
            async function send() {
                while (cursor < pending.length) {
                    const n = pending[cursor++], blob = selected.slice((n - 1) * CHUNK_SIZE, Math.min(n * CHUNK_SIZE, selected.size));
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            await uploadPart(n, blob, controller.signal, bytes => { loaded.set(n, bytes); update(); });
                            loaded.set(n, blob.size);
                            update();
                            break;
                        }
                        catch (e) {
                            if (controller.signal.aborted || attempt === 2)
                                throw e;
                            setPhase("اتصال ناپایدار است؛ تلاش دوباره برای همین بخش…");
                            await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
                        }
                    }
                }
            }
            let firstError: unknown;
            const run = () => send().catch(e => { if (!firstError)
                firstError = e; controller.abort(); throw e; });
            await Promise.allSettled([run(), run()]);
            if (firstError)
                throw firstError;
            if (controller.signal.aborted)
                throw new DOMException("لغو شد", "AbortError");
            setPhase("همهٔ بخش‌ها رسیدند؛ آماده‌سازی فیلم…");
            let next: Snapshot;
            try {
                next = await api<Snapshot>(roomPath(session, `uploads/${uploadId.current}/complete`), session, { method: "POST", signal: controller.signal });
            }
            catch (e) {
                next = await api<Snapshot>(roomPath(session), session);
                if (!next.media.some(v => v.id === uploadId.current))
                    throw e;
            }
            setProgress(100);
            try {
                localStorage.removeItem(checkpointKey);
            }
            catch { }
            onState(next);
            notify("فیلم با کیفیت اصلی آمادهٔ تماشا شد.");
            onClose();
        }
        catch (e) {
            if ((e as Error).name !== "AbortError") {
                setError((e as Error).message);
                setPhase("بخش‌های ارسال‌شده نگه داشته شدند. همین فایل را دوباره انتخاب کن.");
            }
        }
        finally {
            if (!cancelling.current)
                setBusy(false);
            abort.current = null;
            uploadId.current = null;
        }
    }
    async function cancel() {
        cancelling.current = true;
        const current = uploadId.current;
        abort.current?.abort();
        if (current) {
            try {
                await api(roomPath(session, `uploads/${current}`), session, { method: "DELETE" });
                localStorage.removeItem(checkpointKey);
            }
            catch (e) {
                notify((e as Error).message);
            }
        }
        setPhase("آپلود لغو شد.");
        setProgress(0);
        setBusy(false);
        cancelling.current = false;
    }
    async function discard(id: string) { try {
        await api(roomPath(session, `uploads/${id}`), session, { method: "DELETE" });
        setUnfinished(v => v.filter(u => u.id !== id));
        const previous = JSON.parse(localStorage.getItem(checkpointKey) || "null");
        if (previous?.id === id)
            localStorage.removeItem(checkpointKey);
    }
    catch (e) {
        notify((e as Error).message);
    } }
    return <Modal title="فیلم امشب را انتخاب کن" subtitle="یک لینک بفرست یا فیلمت را با کیفیت اصلی آپلود کن." onClose={close}>
    <div className="segmented"><button className={tab === "link" ? "selected" : ""} onClick={() => !busy && setTab("link")}><Link2 size={17}/> لینک ویدیو</button><button className={tab === "upload" ? "selected" : ""} onClick={() => !busy && setTab("upload")}><Upload size={17}/> آپلود فیلم</button></div>
    {tab === "link" ? <form onSubmit={addLink} className="form-stack"><label>لینک فیلم<div className="input-with-icon"><Link2 size={18}/><input dir="ltr" type="url" placeholder="YouTube, Aparat, https://…/movie.mp4" value={url} onChange={e => setUrl(e.target.value)} required autoComplete="off" disabled={busy}/></div></label>
      {detected && <div className="source-detected"><Check size={14}/>{detected.type === "youtube" ? "لینک یوتیوب شناسایی شد" : detected.type === "aparat" ? "لینک آپارات شناسایی شد" : "لینک مستقیم فیلم"}</div>}
      <label>اسم فیلم <span className="optional">اختیاری</span><input placeholder="مثلاً: فیلمی برای یک شب خوب" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} disabled={busy}/></label>
      <div className="source-note"><Film size={17}/><p>{detected?.type === "aparat" ? "ابتدا پخش هماهنگ از لینک‌های عمومی آپارات امتحان می‌شود. اگر در دسترس نباشد، پلیر رسمی نمایش داده می‌شود؛ همگام‌سازی خودکار آن محدود است." : detected?.type === "youtube" ? "نیازی به API Key نیست. ویدیو باید اجازهٔ نمایش در سایت‌های دیگر را داشته باشد؛ کیفیت را از تنظیمات پلیر یوتیوب انتخاب کن." : "لینک مستقیم باید آدرس خودِ فایل MP4، WebM یا استریم HLS باشد؛ لینک یک صفحهٔ وب به‌عنوان فیلم پخش نمی‌شود."}</p></div>
      <button className="button primary full" disabled={busy || !url.trim()}>{busy ? <LoaderCircle className="spin" size={18}/> : <ArrowUpLeft size={18}/>} {busy ? "در حال آماده‌سازی…" : "بگذار روی پرده"}</button>
    </form> : <div className="form-stack"><input ref={input} type="file" tabIndex={-1} aria-hidden="true" accept="video/*,.mkv,.m4v" className="sr-only" onChange={e => { if (e.target.files?.[0])
            startUpload(e.target.files[0]); e.target.value = ""; }}/>
      <div className={`dropzone ${dragging ? "dragging" : ""} ${busy ? "uploading" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0])
            startUpload(e.dataTransfer.files[0]); }}>
        {busy ? <><div className="upload-ring" style={{ "--upload-progress": `${progress}%` } as React.CSSProperties}><span dir="ltr">{progress}%</span></div><h3 dir="auto">{file?.name}</h3><p>{phase}</p><span className="muted" dir="ltr">{fileSize(file?.size || 0)}</span><button className="text-button danger" onClick={cancel}><X size={15}/> لغو آپلود</button></> : <><span className="upload-icon"><CloudUpload size={34}/></span><h3>فیلمت را همین‌جا رها کن</h3><p>یا از دستگاهت انتخابش کن</p><button className="button secondary" onClick={() => input.current?.click()}>{file && error ? <RefreshCw size={16}/> : <Upload size={16}/>} {file && error ? "انتخاب فایل برای ادامهٔ آپلود" : "انتخاب فیلم"}</button><span className="dropzone-limit">تا ۴ گیگابایت · بدون فشرده‌سازی</span></>}
      </div><div className="source-note"><Check size={17}/><p>برای پخش روی گوشی و لپ‌تاپ، MP4 با H.264/AAC یا WebM مناسب است. کیفیت‌های بالا تا جایی که اینترنت و دستگاه پشتیبانی کنند حفظ می‌شوند.</p></div></div>}
    {tab === "upload" && !busy && unfinished.length > 0 && <div className="unfinished-uploads"><span>آپلودهای نیمه‌تمام؛ برای ادامه، همان فایل را انتخاب کن.</span>{unfinished.map(u => <div key={u.id}><span dir="auto">{u.name}</span><button className="text-button danger" onClick={() => discard(u.id)}>لغو</button></div>)}</div>}
    {error && <div className="inline-error" role="alert"><AlertCircle size={17}/><p>{error}</p></div>}
    <div className="provider-footer"><span><Youtube size={15}/> YouTube</span><span><PlayMark /> آپارات</span><span><Film size={15}/> MP4 / WebM</span><span>HLS</span></div>
  </Modal>;
}
function PlayMark() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="4" stroke="currentColor" transform="rotate(10 8 8)"/><path d="m6 5 5 3-5 3V5Z" fill="currentColor"/></svg>; }
