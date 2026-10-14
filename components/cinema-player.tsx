"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward, Captions, PictureInPicture2, RotateCcw, LoaderCircle, Film, MonitorPlay, Link2 } from "lucide-react";
import type { MediaSource, Playback } from "@/lib/cinema-types";
import { formatTime, targetPosition } from "@/lib/cinema-utils";
import { CinemaArt } from "./cinema-art";
import { cinemaApiUrl } from "@/lib/cinema-client";
type YoutubePlayer = {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(t: number, allow: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    setPlaybackRate(rate: number): void;
    getPlaybackRate(): number;
    setVolume(volume: number): void;
    mute(): void;
    unMute(): void;
    destroy(): void;
    getAvailablePlaybackRates(): number[];
};
type YoutubeApi = {
    Player: new (element: HTMLElement, config: Record<string, unknown>) => YoutubePlayer;
};
declare global {
    interface Window {
        YT?: YoutubeApi;
        onYouTubeIframeAPIReady?: () => void;
        __twoSeatsYT?: Promise<YoutubeApi>;
    }
}
function loadYoutube(): Promise<YoutubeApi> {
    if (window.YT?.Player)
        return Promise.resolve(window.YT);
    if (window.__twoSeatsYT)
        return window.__twoSeatsYT;
    window.__twoSeatsYT = new Promise((resolve, reject) => {
        let done = false;
        const timeout = setTimeout(() => { if (!done) {
            window.__twoSeatsYT = undefined;
            reject(new Error("یوتیوب در این شبکه در دسترس نیست. اتصال اینترنت را بررسی کن یا فیلم را آپلود کن."));
        } }, 15000);
        window.onYouTubeIframeAPIReady = () => { done = true; clearTimeout(timeout); resolve(window.YT!); };
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => { done = true; clearTimeout(timeout); window.__twoSeatsYT = undefined; reject(new Error("پلیر یوتیوب بارگذاری نشد. اتصال اینترنت را بررسی کن.")); };
        document.head.appendChild(script);
    });
    return window.__twoSeatsYT;
}
type Props = {
    source: MediaSource | undefined;
    roomId: string;
    mediaAccess: string;
    playback: Playback;
    clockOffset: number;
    canControl: boolean;
    commandBusy: boolean;
    onCommand: (change: {
        position: number;
        playing: boolean;
        rate?: number;
        countdown?: boolean;
    }) => Promise<void>;
    onAdd: () => void;
    onSubtitle: () => void;
    onError: (message: string) => void;
    onResolve: () => void;
};
export function CinemaPlayer(props: Props) {
    const shell = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), ytMount = useRef<HTMLDivElement>(null), yt = useRef<YoutubePlayer | null>(null);
    const hls = useRef<import("hls.js").default | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const [ready, setReady] = useState(false), [buffering, setBuffering] = useState(false), [autoplayBlocked, setAutoplayBlocked] = useState(false);
    const [error, setError] = useState(""), [current, setCurrent] = useState(0), [duration, setDuration] = useState(0), [volume, setVolume] = useState(80), [muted, setMuted] = useState(false);
    const [fullscreen, setFullscreen] = useState(false), [captions, setCaptions] = useState(true), [scrubbing, setScrubbing] = useState<number | null>(null);
    const [levels, setLevels] = useState<{
        label: string;
        value: number;
    }[]>([]), [quality, setQuality] = useState(-1), [aparatSelection, setAparatSelection] = useState<{
        id: string;
        url: string;
    } | null>(null);
    const [countdown, setCountdown] = useState(0), [definition, setDefinition] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const ignoreUntil = useRef(0), commandUntil = useRef(0), seeking = useRef(false), readyRef = useRef(false), blockedRef = useRef(false);
    const lastSample = useRef(0);
    const source = props.source;
    const embedOnly = source?.type === "aparat" && source.extra.mode !== "native";
    const isYoutube = source?.type === "youtube";
    const aparatQuality = aparatSelection?.id === source?.id ? aparatSelection?.url : "";
    const nativeSource = source?.type === "upload" ? cinemaApiUrl(`rooms/${props.roomId}/media/${source.id}/stream?${props.mediaAccess}`) : source?.type === "aparat" ? aparatQuality || source.extra.qualities?.slice().sort((a, b) => (parseInt(a.label) || 0) - (parseInt(b.label) || 0)).at(-1)?.url : source?.url;
    const getTime = useCallback(() => yt.current ? yt.current.getCurrentTime() || 0 : video.current?.currentTime || 0, []);
    const getDuration = useCallback(() => yt.current ? yt.current.getDuration() || 0 : video.current?.duration || 0, []);
    const seek = useCallback((position: number) => {
        ignoreUntil.current = Date.now() + 1000;
        const d = getDuration();
        const t = Math.max(0, Math.min(position, Number.isFinite(d) && d > 0 ? d : position));
        if (yt.current)
            yt.current.seekTo(t, true);
        else if (video.current && video.current.readyState >= 1)
            video.current.currentTime = t;
        setCurrent(t);
    }, [getDuration]);
    const setPlaying = useCallback((playing: boolean) => {
        ignoreUntil.current = Date.now() + 800;
        if (yt.current) {
            if (playing)
                yt.current.playVideo();
            else
                yt.current.pauseVideo();
        }
        else if (video.current) {
            if (playing && video.current.paused)
                video.current.play().catch(e => { if (e.name === "NotAllowedError") {
                    blockedRef.current = true;
                    setAutoplayBlocked(true);
                } });
            else if (!playing && !video.current.paused)
                video.current.pause();
        }
    }, []);
    const sync = useCallback((force = false) => {
        const p = latest.current, s = p.source;
        if (!readyRef.current || !s || (s.type === "aparat" && s.extra.mode !== "native") || (Date.now() < commandUntil.current && !force) || seeking.current)
            return;
        const now = Date.now() + p.clockOffset, until = p.playback.updatedAt - now;
        const upcoming = p.playback.playing && until > 0;
        setCountdown(upcoming ? Math.ceil(until / 1000) : 0);
        const desired = targetPosition(p.playback, now), actual = getTime(), delta = desired - actual;
        const shouldPlay = p.playback.playing && !upcoming;
        if (force || Math.abs(delta) > (yt.current ? 1.5 : 1.0))
            seek(desired);
        if (yt.current) {
            if (yt.current.getPlaybackRate() !== p.playback.rate)
                yt.current.setPlaybackRate(p.playback.rate);
            const state = yt.current.getPlayerState();
            if (shouldPlay && !blockedRef.current && state !== 1 && state !== 3)
                setPlaying(true);
            if (!shouldPlay && (state === 1 || state === 3))
                setPlaying(false);
        }
        else if (video.current) {
            const v = video.current;
            const speed = shouldPlay && Math.abs(delta) > .2 && Math.abs(delta) < 1 ? p.playback.rate * (delta > 0 ? 1.03 : .97) : p.playback.rate;
            if (Math.abs(v.playbackRate - speed) > .005)
                v.playbackRate = speed;
            if (v.paused === shouldPlay && (!shouldPlay || !blockedRef.current))
                setPlaying(shouldPlay);
        }
        lastSample.current = getTime();
        setCurrent(lastSample.current);
    }, [getTime, seek, setPlaying]);
    const command = useCallback(async (change: {
        position: number;
        playing: boolean;
        rate?: number;
        countdown?: boolean;
    }) => {
        if (!latest.current.canControl || latest.current.commandBusy)
            return;
        commandUntil.current = Date.now() + 1600;
        if (change.countdown)
            setPlaying(false);
        else {
            seek(change.position);
            setPlaying(change.playing);
        }
        await latest.current.onCommand(change);
        commandUntil.current = 0;
        requestAnimationFrame(() => sync(true));
    }, [seek, setPlaying, sync]);
    const toggle = useCallback(() => {
        const p = latest.current;
        if (!readyRef.current || !p.source || p.source.type === "aparat" && p.source.extra.mode !== "native")
            return;
        blockedRef.current = false;
        setAutoplayBlocked(false);
        command({ position: getTime(), playing: !p.playback.playing });
    }, [command, getTime]);
    const toggleFull = useCallback(async () => {
        try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else if (shell.current?.requestFullscreen)
                await shell.current.requestFullscreen();
            else if (video.current && "webkitEnterFullscreen" in video.current)
                (video.current as HTMLVideoElement & {
                    webkitEnterFullscreen(): void;
                }).webkitEnterFullscreen();
        }
        catch {
            latest.current.onError("این مرورگر امکان تمام‌صفحه کردن را نداد.");
        }
    }, []);
    useEffect(() => { const listener = () => setFullscreen(!!document.fullscreenElement); document.addEventListener("fullscreenchange", listener); return () => document.removeEventListener("fullscreenchange", listener); }, []);
    useEffect(() => {
        readyRef.current = false;
        setReady(false);
        setError("");
        setBuffering(false);
        setCurrent(0);
        setDuration(0);
        setLevels([]);
        setQuality(-1);
        setDefinition("");
        setAutoplayBlocked(false);
        blockedRef.current = false;
        if (!source || embedOnly)
            return;
        let disposed = false;
        if (isYoutube) {
            loadYoutube().then(YT => {
                if (disposed || !ytMount.current)
                    return;
                const mount = document.createElement("div");
                ytMount.current.replaceChildren(mount);
                yt.current = new YT.Player(mount, { width: "100%", height: "100%", host: "https://www.youtube-nocookie.com", videoId: source.extra.providerId, playerVars: { playsinline: 1, rel: 0, origin: location.origin, enablejsapi: 1 }, events: {
                        onReady: () => { if (disposed)
                            return; readyRef.current = true; setReady(true); setDuration(getDuration()); yt.current?.setVolume(volume); sync(true); },
                        onStateChange: (event: {
                            data: number;
                        }) => {
                            if (disposed)
                                return;
                            setBuffering(event.data === 3);
                            if (Date.now() < ignoreUntil.current)
                                return;
                            if (event.data === 3 && latest.current.canControl && Math.abs(getTime() - lastSample.current) > 2) {
                                command({ position: getTime(), playing: latest.current.playback.playing });
                                return;
                            }
                            if ([1, 2, 0].includes(event.data)) {
                                const p = latest.current;
                                if (p.canControl)
                                    command({ position: getTime(), playing: event.data === 1 });
                                else
                                    sync(true);
                            }
                        },
                        onPlaybackRateChange: (event: {
                            data: number;
                        }) => { const p = latest.current; if (Date.now() >= ignoreUntil.current && p.canControl && event.data !== p.playback.rate && [.5, .75, 1, 1.25, 1.5, 1.75, 2].includes(event.data))
                            command({ position: getTime(), playing: p.playback.playing, rate: event.data }); },
                        onAutoplayBlocked: () => { blockedRef.current = true; setAutoplayBlocked(true); },
                        onError: (event: {
                            data: number;
                        }) => setError([101, 150].includes(event.data) ? "صاحب این ویدیو اجازه پخش داخل سایت‌های دیگر را نداده است. ویدیوی دیگری انتخاب کن یا فایل فیلم را آپلود کن." : event.data === 153 ? "یوتیوب هویت پلیر را نپذیرفت. صفحه را در مرورگر اصلی باز کن یا فایل فیلم را آپلود کن." : "ویدیوی یوتیوب در دسترس نیست. لینک، اتصال اینترنت و محدودیت ویدیو را بررسی کن."),
                        onPlaybackQualityChange: (event: {
                            data: string;
                        }) => setDefinition(({ hd1080: "1080p", hd720: "720p", highres: "کیفیت بالا", large: "480p", medium: "360p", small: "240p" } as Record<string, string>)[event.data] || event.data),
                    } });
            }).catch(e => { if (!disposed)
                setError(e.message); });
        }
        else if (video.current && nativeSource) {
            const element = video.current;
            const isHls = /\.m3u8(?:\?|$)/i.test(nativeSource) || source.mime.includes("mpegurl");
            if (isHls && !element.canPlayType("application/vnd.apple.mpegurl")) {
                import("hls.js").then(({ default: Hls }) => {
                    if (disposed)
                        return;
                    if (!Hls.isSupported()) {
                        setError("این مرورگر از این نوع پخش پشتیبانی نمی‌کند. با مرورگر به‌روز امتحان کن.");
                        return;
                    }
                    const instance = new Hls({ maxBufferLength: 30, backBufferLength: 30, capLevelToPlayerSize: false });
                    hls.current = instance;
                    instance.loadSource(nativeSource);
                    instance.attachMedia(element);
                    instance.on(Hls.Events.MANIFEST_PARSED, () => { if (disposed)
                        return; setLevels(instance.levels.map((l, i) => ({ label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`, value: i }))); });
                    instance.on(Hls.Events.ERROR, (_, data) => { if (data.fatal && !disposed) {
                        if (data.type === Hls.ErrorTypes.MEDIA_ERROR)
                            instance.recoverMediaError();
                        else
                            setError("پخش این لینک کامل نشد. برای لینک HLS، سرور فیلم باید دسترسی CORS بدهد؛ می‌توانی فایل فیلم را آپلود کنی.");
                    } });
                }).catch(() => { if (!disposed)
                    setError("ماژول پخش بارگذاری نشد. صفحه را دوباره باز کن."); });
            }
            else {
                element.src = nativeSource;
                element.load();
            }
        }
        return () => { disposed = true; readyRef.current = false; yt.current?.destroy(); yt.current = null; hls.current?.destroy(); hls.current = null; };
        // Volume is deliberately local; changing it must not reload the shared movie.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source?.id, nativeSource, isYoutube, embedOnly, reloadKey]);
    useEffect(() => { if (ready)
        sync(true); }, [props.playback.revision, ready, sync]);
    useEffect(() => { const timer = setInterval(() => { if (!readyRef.current)
        return; const d = getDuration(); if (Number.isFinite(d))
        setDuration(d); sync(); }, 250); return () => clearInterval(timer); }, [getDuration, sync]);
    useEffect(() => { if (video.current) {
        video.current.volume = volume / 100;
        video.current.muted = muted;
    } if (yt.current) {
        yt.current.setVolume(volume);
        if (muted)
            yt.current.mute();
        else
            yt.current.unMute();
    } }, [volume, muted, ready]);
    useEffect(() => { if (video.current)
        Array.from(video.current.textTracks).forEach(t => { t.mode = captions ? "showing" : "hidden"; }); }, [captions, source?.subtitle, ready]);
    useEffect(() => {
        const listener = (e: KeyboardEvent) => {
            if (document.querySelector("[role='dialog']") || (e.target as HTMLElement)?.closest("input,textarea,select,button,a,[contenteditable='true']"))
                return;
            if (e.code === "Space") {
                e.preventDefault();
                toggle();
            }
            else if (e.key === "ArrowRight" && latest.current.canControl) {
                e.preventDefault();
                command({ position: getTime() + 10, playing: latest.current.playback.playing });
            }
            else if (e.key === "ArrowLeft" && latest.current.canControl) {
                e.preventDefault();
                command({ position: Math.max(0, getTime() - 10), playing: latest.current.playback.playing });
            }
            else if (e.key.toLowerCase() === "f")
                toggleFull();
            else if (e.key.toLowerCase() === "m")
                setMuted(m => !m);
        };
        document.addEventListener("keydown", listener);
        return () => document.removeEventListener("keydown", listener);
    }, [toggle, command, getTime, toggleFull]);
    async function unlock() { blockedRef.current = false; setAutoplayBlocked(false); setPlaying(true); sync(true); }
    async function pip() { try {
        if (document.pictureInPictureElement)
            await document.exitPictureInPicture();
        else if (video.current && document.pictureInPictureEnabled)
            await video.current.requestPictureInPicture();
        else
            latest.current.onError("تصویر در تصویر برای این منبع یا مرورگر در دسترس نیست.");
    }
    catch {
        latest.current.onError("ابتدا فیلم را پخش کن، سپس تصویر در تصویر را فعال کن.");
    } }
    const buffered = video.current?.buffered.length ? video.current.buffered.end(video.current.buffered.length - 1) : 0;
    return <div ref={shell} className="player-shell">
    <div className={`player-picture ${!source ? "is-empty" : ""}`}>
      {!source ? <div className="empty-screen"><div className="screen-label"><span className="tiny-star">✦</span> یک پرده، دو صندلی</div><CinemaArt compact/><div className="empty-screen-copy"><h2>امشب، چی ببینیم؟</h2><p>فیلم را انتخاب کن. صندلی کنارت منتظر است.</p><button className="button primary" onClick={props.onAdd}><Film size={18}/> انتخاب فیلم</button></div></div> :
            isYoutube ? <div className="youtube-mount" ref={ytMount}/> :
                embedOnly ? <iframe className="aparat-embed" src={`https://www.aparat.com/video/video/embed/videohash/${source.extra.providerId}/vt/frame`} title={source.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> :
                    <video ref={video} className="cinema-video" playsInline preload="metadata" crossOrigin={source.subtitle ? "anonymous" : undefined} onLoadedMetadata={() => { readyRef.current = true; setReady(true); setDuration(getDuration()); const height = video.current?.videoHeight; setDefinition(height ? `${height}p` : ""); sync(true); }} onCanPlay={() => setBuffering(false)} onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onSeeking={() => { seeking.current = true; }} onSeeked={() => { seeking.current = false; }} onEnded={() => { if (props.canControl)
                        command({ position: getDuration(), playing: false }); }} onError={() => setError("مرورگر نتوانست این فیلم را پخش کند. MP4 با کدک H.264/AAC یا WebM انتخاب کن؛ فایل‌های MKV، HEVC و بعضی MOVها روی همه دستگاه‌ها پخش نمی‌شوند.")} onDoubleClick={toggleFull} onClick={toggle}>
          {source.subtitle && <track key={source.id + props.playback.mediaId} kind="subtitles" src={cinemaApiUrl(`rooms/${props.roomId}/media/${source.id}/subtitle?${props.mediaAccess}`)} srcLang="fa" label="فارسی" default={captions}/>}
        </video>}
      {source && !embedOnly && !ready && !error && <div className="player-overlay loading-overlay"><LoaderCircle className="spin" size={28}/><span>پرده دارد روشن می‌شود…</span></div>}
      {source && buffering && ready && !error && <div className="buffering-pill"><LoaderCircle className="spin" size={14}/> دریافت فیلم…</div>}
      {countdown > 0 && <div className="player-overlay countdown-overlay"><span>با هم شروع می‌کنیم</span><strong key={countdown}>{countdown.toLocaleString("fa-IR")}</strong></div>}
      {autoplayBlocked && !error && <div className="player-overlay"><button className="button primary" onClick={unlock}><Play size={18}/> فعال کردن پخش در این دستگاه</button><p>مرورگر برای شروع صدا به یک لمس نیاز دارد.</p></div>}
      {error && <div className="player-overlay error-overlay"><MonitorPlay size={32}/><h3>این فیلم هنوز روی پرده نیامده</h3><p>{error}</p><div className="button-row"><button className="button secondary" onClick={() => { setError(""); if (source?.type === "aparat")
        props.onResolve(); setReloadKey(v => v + 1); }}><RotateCcw size={16}/> تلاش دوباره</button><button className="button primary" onClick={props.onAdd}>انتخاب فیلم دیگر</button></div></div>}
      {source && !props.playback.playing && ready && !error && !autoplayBlocked && !isYoutube && !embedOnly && <button className="big-play" disabled={!props.canControl} onClick={toggle} aria-label="پخش فیلم"><Play size={30} fill="currentColor"/></button>}
      {source && !error && <div className="picture-badge"><span className="status-dot"/>{embedOnly ? "پلیر آپارات" : props.playback.playing ? "در حال تماشا" : "آمادهٔ تماشا"}</div>}
    </div>
    {embedOnly ? <div className="embed-explanation"><Link2 size={16}/><span>پخش آپارات فعال است؛ کنترل هماهنگ در پلیر امبد در دسترس نیست.</span><button className="text-button" onClick={props.onResolve}>تلاش برای پخش هماهنگ</button></div> :
            <div className="player-controls" dir="ltr">
        <div className="timeline-row"><span className="time-number">{formatTime(scrubbing ?? current)}</span><div className="timeline"><div className="timeline-buffer" style={{ width: `${duration ? Math.min(100, buffered / duration * 100) : 0}%` }}/><input type="range" aria-label="زمان پخش فیلم" min="0" max={duration > 0 ? duration : 1} step="0.1" value={Math.min(scrubbing ?? current, duration > 0 ? duration : 1)} disabled={!ready || !props.canControl || props.commandBusy} style={{ "--progress": `${duration ? ((scrubbing ?? current) / duration) * 100 : 0}%` } as React.CSSProperties} onChange={e => { setScrubbing(Number(e.target.value)); seeking.current = true; }} onPointerUp={e => { const t = Number(e.currentTarget.value); setScrubbing(null); seeking.current = false; command({ position: t, playing: props.playback.playing }); }} onKeyUp={e => { if (e.key.startsWith("Arrow") || ["Home", "End", "PageUp", "PageDown"].includes(e.key)) {
                const t = Number(e.currentTarget.value);
                setScrubbing(null);
                seeking.current = false;
                command({ position: t, playing: props.playback.playing });
            } }}/></div><span className="time-number total-time">{formatTime(duration)}</span></div>
        <div className="controls-bottom"><div className="controls-group"><button className="player-button" onClick={() => command({ position: Math.max(0, getTime() - 10), playing: props.playback.playing })} disabled={!ready || !props.canControl || props.commandBusy} title="۱۰ ثانیه عقب" aria-label="۱۰ ثانیه عقب"><SkipBack size={18}/></button><button className="player-button play-toggle" onClick={toggle} disabled={!ready || !props.canControl || props.commandBusy} aria-label={props.playback.playing ? "توقف فیلم" : "پخش فیلم"}>{props.playback.playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button><button className="player-button" onClick={() => command({ position: Math.min(duration || Infinity, getTime() + 10), playing: props.playback.playing })} disabled={!ready || !props.canControl || props.commandBusy} title="۱۰ ثانیه جلو" aria-label="۱۰ ثانیه جلو"><SkipForward size={18}/></button><span className="control-divider"/><button className="player-button" onClick={() => setMuted(v => !v)} aria-label={muted ? "فعال کردن صدا" : "بی‌صدا کردن"}>{muted || volume === 0 ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button><input className="volume-slider" type="range" min="0" max="100" value={muted ? 0 : volume} aria-label="صدای این دستگاه" onChange={e => { setVolume(Number(e.target.value)); setMuted(false); }}/></div>
          <div className="controls-group right-controls"><span className="quality-badge">{source?.type === "upload" ? definition || "اصلی" : definition || (isYoutube ? "YouTube" : "")}</span>
            {!!levels.length && <select aria-label="کیفیت فیلم" value={quality} onChange={e => { const level = Number(e.target.value); setQuality(level); if (hls.current)
                hls.current.currentLevel = level; }}><option value={-1}>Auto</option>{levels.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select>}
            {source?.type === "aparat" && !!source.extra.qualities?.length && <select aria-label="کیفیت آپارات" value={aparatQuality || nativeSource} onChange={e => setAparatSelection({ id: source.id, url: e.target.value })}>{source.extra.qualities.map(q => <option key={q.url} value={q.url}>{q.label}</option>)}</select>}
            <select aria-label="سرعت پخش مشترک" value={props.playback.rate} disabled={!ready || !props.canControl} onChange={e => command({ position: getTime(), playing: props.playback.playing, rate: Number(e.target.value) })}>{[.5, .75, 1, 1.25, 1.5, 1.75, 2].map(r => <option key={r} value={r}>{r}×</option>)}</select>
            <button className={`player-button ${captions && source?.subtitle ? "active" : ""}`} onClick={() => source?.subtitle ? setCaptions(v => !v) : props.onSubtitle()} aria-label={source?.subtitle ? "نمایش یا پنهان کردن زیرنویس" : "اضافه کردن زیرنویس"} title="زیرنویس"><Captions size={20}/></button>
            <button className="player-button pip-button" onClick={pip} aria-label="تصویر در تصویر" title="تصویر در تصویر"><PictureInPicture2 size={19}/></button><button className="player-button" onClick={toggleFull} aria-label="تمام صفحه" title="تمام صفحه (F)">{fullscreen ? <Minimize size={20}/> : <Maximize size={20}/>}</button></div></div>
      </div>}
  </div>;
}
