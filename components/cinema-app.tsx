"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Armchair, Heart, ArrowUpLeft, ShieldCheck, Users, Clapperboard, Popcorn, Link2, Moon, Sparkles, Settings2, Plus, Copy, Check, DoorOpen, CircleHelp, LoaderCircle, Film, Captions, Trash2, Play, Wifi, RefreshCw, Expand, Shrink, CheckCircle2, Share2, Upload, LockKeyhole, ChevronLeft, Coffee, AlertCircle } from "lucide-react";
import { api, inviteLink, readSessions, removeSession, RequestError, roomPath, saveSession } from "@/lib/cinema-client";
import { type MediaSource, type Mood, type RoomSession, type Snapshot } from "@/lib/cinema-types";
import { fileSize, targetPosition } from "@/lib/cinema-utils";
import { CinemaArt, Youtube } from "./cinema-art";
import { CinemaPlayer } from "./cinema-player";
import { CinemaChat } from "./cinema-chat";
import { SourceModal } from "./source-modal";
import { Modal } from "./modal";
import { useCinemaRoom } from "./use-cinema-room";
export function CinemaApp() {
    const [session, setSession] = useState<RoomSession | null>(null), [initial, setInitial] = useState<Snapshot | null>(null), [saved, setSaved] = useState<RoomSession[]>([]);
    const [join, setJoin] = useState<{
        id: string;
        invite: string;
    } | null>(null), [showJoin, setShowJoin] = useState(false), [help, setHelp] = useState(false), [toast, setToast] = useState<{
        id: number;
        text: string;
    } | null>(null);
    const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
    useEffect(() => {
        const stored = readSessions();
        setSaved(stored);
        const u = new URL(location.href), room = u.searchParams.get("room"), invite = new URLSearchParams(u.hash.slice(1)).get("invite");
        if (room) {
            const existing = stored.find(s => s.id === room);
            if (existing) {
                setSession(existing);
            }
            else {
                setJoin({ id: room, invite: invite || "" });
                setShowJoin(true);
            }
        }
    }, []);
    useEffect(() => { if (!toast)
        return; const timer = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timer); }, [toast]);
    const enter = useCallback((s: RoomSession, state: Snapshot | null) => { saveSession(s); setSaved(readSessions()); setSession(s); setInitial(state); setShowJoin(false); history.replaceState(null, "", `/?room=${s.id}`); }, []);
    const leave = useCallback(() => { setSession(null); setInitial(null); setSaved(readSessions()); history.replaceState(null, "", "/"); }, []);
    return <div className="cinema-app" data-mood={initial?.room.mood || "amber"}>
    {session ? <Theater key={session.id} session={session} initial={initial} onSession={s => { saveSession(s); setSession(s); }} onLeave={leave} onInvalid={() => { removeSession(session.id); leave(); }} onHelp={() => setHelp(true)} notify={notify}/> : <Landing saved={saved} onEnter={enter} onJoin={() => { setJoin(null); setShowJoin(true); }} onHelp={() => setHelp(true)} notify={notify}/>}
    {showJoin && !session && <JoinModal invitation={join} onClose={() => { setShowJoin(false); history.replaceState(null, "", "/"); }} onEnter={enter}/>}
    {help && <HelpModal onClose={() => setHelp(false)}/>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18}/><span>{toast.text}</span><button aria-label="بستن پیام" onClick={() => setToast(null)}>×</button></div>}
  </div>;
}
function Brand({ onClick }: {
    onClick: () => void;
}) { return <button className="brand" onClick={onClick} aria-label="دو صندلی، خانه"><span className="brand-symbol"><Armchair size={23}/><Armchair size={23}/><Heart size={9} fill="currentColor"/></span><span><strong>دو صندلی</strong><small>سینمای کوچکِ ما</small></span></button>; }
function Landing({ saved, onEnter, onJoin, onHelp, notify }: {
    saved: RoomSession[];
    onEnter: (s: RoomSession, state: Snapshot | null) => void;
    onJoin: () => void;
    onHelp: () => void;
    notify: (s: string) => void;
}) {
    const [name, setName] = useState(""), [title, setTitle] = useState("سینمای ما"), [mood, setMood] = useState<Mood>("amber"), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const form = useRef<HTMLFormElement>(null);
    async function create(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try {
        const result = await api<{
            session: RoomSession;
            snapshot: Snapshot;
        }>("rooms", null, { method: "POST", body: JSON.stringify({ name, title, mood }) });
        onEnter(result.session, result.snapshot);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <div className="landing">
    <header className="site-header"><Brand onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}/><div className="header-actions"><span className="private-badge"><LockKeyhole size={13}/> فقط برای دو نفر</span><button className="icon-button help-button" onClick={onHelp} aria-label="راهنمای سینما"><CircleHelp size={20}/></button></div></header>
    <main className="landing-main">
      <div className="landing-intro"><span className="eyebrow"><span /> یک شبِ خوب، از همین‌جا شروع می‌شود</span><h1>فاصله هست.<br /><span>ولی امشب، کنار همیم.</span><Heart className="headline-heart" size={32}/></h1><p>فیلم مورد علاقه‌تان، دو صندلی کنار هم و حرف‌هایی که<br className="desktop-break"/> بین سکانس‌ها می‌زنید. سینمای شما، هرجا که باشید.</p></div>
      <div className="landing-stage" data-mood={mood}>
        <div className="stage-illustration"><div className="stage-topline"><span><Clapperboard size={15}/> به سینمای کوچک‌مان خوش آمدی</span><span dir="ltr">EST. TONIGHT</span></div><CinemaArt /><div className="stage-ticket"><span className="ticket-icon"><Popcorn size={23}/></span><div><strong>یک فیلم. یک شب. فقط شما دو نفر.</strong><span>بهترین صندلی دنیا، صندلی کنار توست.</span></div><span className="ticket-number" dir="ltr">01 + 02</span></div></div>
        <form ref={form} className="create-room-card" onSubmit={create}><div className="create-heading"><span className="create-icon"><Armchair size={22}/></span><div><h2>اتاق امشب را بساز</h2><p>صندلی دوم را برای آدمِ خودت نگه دار.</p></div></div>
          <div className="form-stack"><label>تو را چی صدا کنیم؟<input placeholder="مثلاً امیر" value={name} onChange={e => setName(e.target.value)} required maxLength={32} autoComplete="given-name" disabled={busy}/></label><label>اسم سینمای شما<input value={title} onChange={e => setTitle(e.target.value)} placeholder="سینمای ما" required maxLength={60} disabled={busy}/></label>
          <div><span className="field-label">حال‌وهوای امشب</span><MoodPicker value={mood} onChange={setMood}/></div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button className="button primary full create-button" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin"/> : <Plus size={19}/>} {busy ? "داریم صندلی‌ها را آماده می‌کنیم…" : "بسازیم، کنار هم ببینیم"}<ArrowUpLeft size={18}/></button></div>
          <div className="or-line"><span>یا</span></div><button type="button" className="join-link" onClick={onJoin}><Link2 size={16}/> لینک دعوت داری؟ وارد سینما شو <ChevronLeft size={15}/></button><div className="create-private"><ShieldCheck size={13}/> اتاق خصوصی · دعوت یک‌بارمصرف · دو صندلی</div>
        </form>
      </div>
      <div className="feature-row"><div><span><RefreshCw size={20}/></span><div><h3>یک زمان، یک سکانس</h3><p>پلی، توقف و جلو زدن، برای هر دو هماهنگ.</p></div></div><div><span><Upload size={20}/></span><div><h3>فیلمت، با کیفیت خودش</h3><p>فایل اصلی، یوتیوب، آپارات یا لینک مستقیم.</p></div></div><div><span><Heart size={20}/></span><div><h3>حرف‌ها هم جزو فیلم‌اند</h3><p>چت، واکنش و حس کنار هم بودن.</p></div></div></div>
      {saved.length > 0 && <section className="recent-rooms"><div className="section-heading"><h2><DoorOpen size={19}/> سینماهایی که منتظرت‌اند</h2><span>روی همین مرورگر</span></div><div className="recent-grid">{saved.slice(0, 4).map(s => <button key={s.id} onClick={() => onEnter(s, null)} className="recent-room"><span className="recent-icon"><Clapperboard size={24}/></span><div><strong>{s.title}</strong><span>{s.seat === "host" ? "صندلی میزبان" : "صندلی مهمان"} · {new Date(s.createdAt).toLocaleDateString("fa-IR", { month: "long", day: "numeric" })}</span></div><ArrowUpLeft size={17}/></button>)}</div></section>}
    </main><footer className="site-footer"><span>با عشق، برای شب‌های دونفره <Heart size={11}/></span><button onClick={onHelp}>چطور کار می‌کند؟</button><span className="footer-wordmark" dir="ltr">TWO SEATS. ONE STORY.</span></footer>
  </div>;
}
function MoodPicker({ value, onChange }: {
    value: Mood;
    onChange: (m: Mood) => void;
}) { return <div className="mood-picker">{([{ id: "amber", label: "گرم و دنج", icon: Coffee }, { id: "rose", label: "رمانتیک", icon: Heart }, { id: "midnight", label: "شب آرام", icon: Moon }] as const).map(m => <button key={m.id} type="button" className={`mood-option mood-${m.id} ${value === m.id ? "selected" : ""}`} aria-pressed={value === m.id} onClick={() => onChange(m.id)}><m.icon size={15}/>{m.label}</button>)}</div>; }
function JoinModal({ invitation, onClose, onEnter }: {
    invitation: {
        id: string;
        invite: string;
    } | null;
    onClose: () => void;
    onEnter: (s: RoomSession, state: Snapshot) => void;
}) {
    const [link, setLink] = useState(""), [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
    async function join(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            let details = invitation;
            if (!details?.invite) {
                const u = new URL(link.trim());
                if (u.origin !== location.origin)
                    throw new Error("لینک دعوت باید مربوط به همین سینما باشد.");
                details = { id: u.searchParams.get("room") || "", invite: new URLSearchParams(u.hash.slice(1)).get("invite") || "" };
            }
            if (!details.id || !details.invite)
                throw new Error("لینک کامل دعوت را وارد کن یا از میزبان لینک تازه بگیر.");
            const existing = readSessions().find(s => s.id === details!.id);
            if (existing) {
                const state = await api<Snapshot>(roomPath(existing), existing);
                onEnter(existing, state);
                return;
            }
            const result = await api<{
                session: RoomSession;
                snapshot: Snapshot;
            }>(`rooms/${details.id}/join`, null, { method: "POST", body: JSON.stringify({ name, invite: details.invite }) });
            onEnter(result.session, result.snapshot);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    return <Modal title="صندلی کنارت نگه داشته شده" subtitle="بیا تو؛ قرار است امشب را با هم ببینید." onClose={onClose}>
    <div className="join-art"><span><Armchair size={44}/></span><Heart size={22}/><span><Armchair size={44}/></span></div><form className="form-stack" onSubmit={join}>
      {!invitation?.invite && <label>لینک کامل دعوت<input dir="ltr" type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…/?room=…#invite=…" required disabled={busy}/></label>}
      <label>اسمت چیست؟<input placeholder="اسمی که پارتنرت صدایت می‌کند" value={name} onChange={e => setName(e.target.value)} required maxLength={32} disabled={busy}/></label>
      {error && <div className="inline-error" role="alert"><AlertCircle size={17}/><p>{error}</p></div>}
      <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <DoorOpen size={17}/>} {busy ? "در حال پیدا کردن صندلی‌ات…" : "من رسیدم؛ بریم سینما"}</button>
      <p className="small-note"><LockKeyhole size={12}/> فقط همین دو مرورگر به فیلم و گفت‌وگو دسترسی دارند. برای برگشتن، از همان مرورگر استفاده کن.</p>
    </form>
  </Modal>;
}
function Theater({ session, initial, onSession, onLeave, onInvalid, onHelp, notify }: {
    session: RoomSession;
    initial: Snapshot | null;
    onSession: (s: RoomSession) => void;
    onLeave: () => void;
    onInvalid: () => void;
    onHelp: () => void;
    notify: (s: string) => void;
}) {
    const room = useCinemaRoom(session, initial, notify, onInvalid);
    const [modal, setModal] = useState<"source" | "invite" | "settings" | "subtitle" | null>(null), [cinemaMode, setCinemaMode] = useState(false), [actionBusy, setActionBusy] = useState(false), [removeFilm, setRemoveFilm] = useState<MediaSource | null>(null);
    const state = room.state;
    const source = state?.media.find(m => m.id === state.playback.mediaId);
    const partner = state?.members.find(m => m.seat !== session.seat), me = state?.members.find(m => m.seat === session.seat);
    const bothReady = state?.members.length === 2 && state.members.every(m => !!m.ready && state.serverTime - m.last_seen < 16000);
    const canControl = !!state && (session.seat === "host" || state.room.sharedControl);
    const add = () => session.seat === "host" ? setModal("source") : notify("میزبان می‌تواند فیلم تازه اضافه کند؛ فیلم‌های موجود را از فهرست انتخاب کن.");
    const safe = async (task: () => Promise<unknown>) => { setActionBusy(true); try {
        await task();
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setActionBusy(false);
    } };
    async function ready() { await safe(async () => { await api(roomPath(session, "heartbeat"), session, { method: "POST", body: JSON.stringify({ ready: !me?.ready }) }); await room.refresh(); }); }
    const subtitle = () => { if (source?.type === "youtube") {
        notify("زیرنویس یوتیوب را از دکمه CC در پلیر خودش انتخاب کن.");
        return;
    } if (session.seat !== "host") {
        notify("میزبان می‌تواند یک فایل زیرنویس به فیلم اضافه کند.");
        return;
    } if (!source) {
        notify("اول یک فیلم انتخاب کن.");
        return;
    } setModal("subtitle"); };
    const currentReactions = state?.messages.filter(m => m.kind === "reaction" && state.serverTime - m.created_at < 4000).slice(-8) || [];
    return <div className={`theater ${cinemaMode ? "cinema-mode" : ""}`} data-mood={state?.room.mood || "amber"}>
    <header className="site-header theater-header"><Brand onClick={onLeave}/><div className="room-header-title"><span className="status-dot"/><strong>{state?.room.title || session.title}</strong><span className="private-badge"><LockKeyhole size={12}/> اتاق خصوصی</span></div><div className="header-actions"><button className="icon-button cinema-mode-button" onClick={() => setCinemaMode(v => !v)} title="حالت سینما" aria-label={cinemaMode ? "خروج از حالت سینما" : "حالت سینما"}>{cinemaMode ? <Shrink size={19}/> : <Expand size={19}/>}</button>{session.seat === "host" && <button className="button invite-header-button" onClick={() => setModal("invite")}><Link2 size={16}/><span>دعوت پارتنرم</span></button>}<button className="icon-button" onClick={() => setModal("settings")} aria-label="تنظیمات اتاق" title="تنظیمات اتاق"><Settings2 size={19}/></button></div></header>
    {!state ? <main className="room-loading"><LoaderCircle className="spin" size={32}/><h1>داریم به سینمایت وصل می‌شویم…</h1><p>{room.connection === "reconnecting" ? "اتصال قطع شد؛ دوباره تلاش می‌کنیم." : "صندلی تو محفوظ است."}</p><button className="button secondary" onClick={() => room.refresh().catch(e => notify(e.message))}><RefreshCw size={16}/> تلاش دوباره</button><button className="text-button" onClick={onLeave}>برگشت به خانه</button></main> : <main className="theater-main">
      <div className="theater-topline"><div><span className="eyebrow">YOUR PRIVATE SCREENING</span><h1>{state.room.title} <span>فقط ما و این فیلم.</span></h1></div><div className={`connection-badge ${room.connection !== "online" ? "reconnecting" : ""}`}><Wifi size={13}/><span>{room.connection === "online" ? "اتصال برقرار است" : "در حال اتصال دوباره…"}</span><span className="connection-latency" dir="ltr">{room.connection === "online" ? `${room.latency} ms` : ""}</span></div></div>
      <div className="theater-grid"><section className="screen-column"><div className="screen-wrapper"><CinemaPlayer source={source} roomId={session.id} mediaAccess={state.mediaAccess} playback={state.playback} clockOffset={room.clockOffset} canControl={canControl} commandBusy={room.commandBusy} onCommand={room.sendPlayback} onAdd={add} onSubtitle={subtitle} onError={notify} onResolve={() => safe(() => room.mutate(`media/${source?.id}/resolve`))}/><div className="floating-reactions" aria-hidden="true">{currentReactions.map((r, i) => <span key={r.id} style={{ left: `${18 + (i * 19) % 65}%`, animationDelay: `${i * .03}s` }}>{r.text}</span>)}</div></div>
      <div className="now-playing"><div className="now-icon"><Clapperboard size={21}/></div><div className="now-title"><span>{source ? "روی پردهٔ امشب" : "پرده هنوز منتظر فیلم است"}</span><h2 dir="auto">{source?.title || "شروع یک شب مشترک"}</h2></div>{source && <span className="source-pill">{source.type === "upload" ? "کیفیت اصلی" : source.type === "youtube" ? "YouTube" : source.type === "aparat" ? "آپارات" : "لینک مستقیم"}</span>}</div>
      {source?.url.includes("/gtv-videos-bucket/sample/BigBuckBunny.mp4") && <a className="film-credit" href="https://peach.blender.org/about/" target="_blank" rel="noreferrer">Big Buck Bunny · © 2008 Blender Foundation · CC BY 3.0 ↗</a>}<div className="presence-card"><div className="two-members">{(["host", "guest"] as const).map(seat => { const member = state.members.find(m => m.seat === seat), online = member && state.serverTime - member.last_seen < 16000; return <div key={seat} className={`member ${member ? "" : "empty"}`}><span className={`member-avatar avatar-${seat}`}>{seat === "host" ? <Moon size={21}/> : <Sparkles size={21}/>}<i className={online ? "online" : ""}/></span><div><strong>{member?.name || "صندلی پارتنرت"}{seat === session.seat && <small> (تو)</small>}</strong><span>{member?.ready ? "آمادهٔ تماشا ♥" : online ? "نشسته کنار پرده" : member ? "فعلاً بیرون از سینما" : "هنوز خالی است"}</span></div></div>; })}<span className="members-heart"><Heart size={17}/></span></div>
        <div className="ready-actions"><button className={`button ready-button ${me?.ready ? "is-ready" : ""}`} disabled={actionBusy} onClick={ready}>{me?.ready ? <Check size={16}/> : <Popcorn size={16}/>} {me?.ready ? "من آماده‌ام" : "من آماده‌ام؟ بزن بریم"}</button><button className="button start-together" disabled={!source || !bothReady || !canControl || room.commandBusy || state.playback.playing || (source.type === "aparat" && source.extra.mode !== "native")} title={!bothReady ? "هر دو نفر باید آنلاین و آماده باشند" : "شروع با شمارش معکوس ۳ ثانیه"} onClick={() => room.sendPlayback({ position: targetPosition(state.playback, Date.now() + room.clockOffset), playing: true, countdown: true })}><Play size={15} fill="currentColor"/> شروع با هم</button></div></div>
      <div className="queue-section"><div className="section-heading"><h2><Film size={18}/> فیلم‌های این اتاق <span className="count-badge">{state.media.length.toLocaleString("fa-IR")}</span></h2>{session.seat === "host" && <button className="text-button" onClick={add}><Plus size={16}/> فیلم تازه</button>}</div><div className="queue-list">{state.media.map(m => <div key={m.id} className={`queue-item ${m.id === source?.id ? "selected" : ""}`}><button className="queue-select" disabled={!canControl || actionBusy} onClick={() => safe(() => room.mutate(`media/${m.id}/select`))}><span className={`queue-cover source-${m.type}`}>{m.type === "youtube" ? <Youtube size={26}/> : m.type === "upload" ? <Film size={26}/> : <Play size={25}/>}</span><span className="queue-details"><strong dir="auto">{m.title}</strong><span>{m.type === "upload" ? fileSize(m.size) : m.type === "youtube" ? "YouTube" : m.type === "aparat" ? "آپارات" : "لینک مستقیم"}{m.subtitle ? " · زیرنویس دارد" : ""}</span></span><span className="queue-play">{m.id === source?.id ? <span className="equalizer"><i /><i /><i /></span> : <Play size={14}/>}</span></button>{session.seat === "host" && <button className="queue-delete" onClick={() => setRemoveFilm(m)} aria-label={`حذف ${m.title}`} title="حذف فیلم"><Trash2 size={14}/></button>}</div>)}
        {session.seat === "host" && <button className="queue-add" onClick={add}><Plus size={22}/><span>{state.media.length ? "یک فیلم دیگر" : "فیلمی که دوست دارید"}</span><small>آپلود یا لینک ویدیو</small></button>}</div>
        {state.media.length === 0 && session.seat === "host" && <button className="demo-film" disabled={actionBusy} onClick={() => safe(() => room.mutate("media", { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", title: "Big Buck Bunny · فیلم آزمایشی" }))}><Play size={12}/> برای امتحان سینما، یک انیمیشن رایگان پخش کن <ArrowUpLeft size={13}/></button>}
      </div><div className="screen-notes"><span><ShieldCheck size={12}/> فقط دو صندلی، همیشه خصوصی</span><button onClick={onHelp}><CircleHelp size={12}/> راهنمای پخش و کلیدها</button></div></section>
      <CinemaChat state={state} session={session} onState={room.apply} typing={room.typing} onInvite={() => setModal("invite")} notify={notify}/></div>
    </main>}
    <footer className="site-footer theater-footer"><span>فاصله، فقط بیرونِ این اتاق است. <Heart size={11}/></span><button onClick={onLeave}><DoorOpen size={13}/> بیرون رفتن از سینما</button><span className="footer-wordmark" dir="ltr">TWO SEATS. ONE STORY.</span></footer>
    {modal === "source" && <SourceModal session={session} onState={room.apply} notify={notify} onClose={() => setModal(null)}/>}
    {modal === "invite" && state && <InviteModal session={session} state={state} onSession={onSession} onState={room.apply} notify={notify} onClose={() => setModal(null)}/>}
    {modal === "settings" && state && <SettingsModal session={session} state={state} onState={room.apply} onClose={() => setModal(null)} notify={notify} onDeleted={() => { removeSession(session.id); onLeave(); }} onReset={s => onSession(s)}/>}
    {modal === "subtitle" && source && <SubtitleModal session={session} source={source} onState={room.apply} onClose={() => setModal(null)}/>}
    {removeFilm && <Modal title="این فیلم از اتاق حذف شود؟" subtitle={removeFilm.title} onClose={() => !actionBusy && setRemoveFilm(null)}><p className="dialog-copy">فایل و زیرنویس این فیلم هم حذف می‌شوند. اگر روی پرده باشد، پخش برای هر دو متوقف می‌شود.</p><div className="button-row"><button className="button secondary" onClick={() => setRemoveFilm(null)} disabled={actionBusy}>نگهش دار</button><button className="button destructive" disabled={actionBusy} onClick={() => safe(async () => { await room.mutate(`media/${removeFilm.id}`, undefined, "DELETE"); setRemoveFilm(null); notify("فیلم از اتاق حذف شد."); })}>{actionBusy ? <LoaderCircle className="spin" size={17}/> : <Trash2 size={17}/>} حذف فیلم</button></div></Modal>}
  </div>;
}
function InviteModal({ session, state, onSession, onState, onClose, notify }: {
    session: RoomSession;
    state: Snapshot;
    onSession: (s: RoomSession) => void;
    onState: (s: Snapshot) => void;
    onClose: () => void;
    notify: (text: string) => void;
}) {
    const [copied, setCopied] = useState(false), [busy, setBusy] = useState(false);
    const occupied = state.members.some(m => m.seat === "guest");
    const link = session.invite ? inviteLink(session) : "";
    async function copy() { try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        notify("لینک دعوت کپی شد؛ برای پارتنرت بفرست.");
    }
    catch {
        notify("امکان کپی خودکار نیست؛ لینک را انتخاب و کپی کن.");
    } }
    async function generate() { setBusy(true); try {
        const next = await api<{
            invite: string;
            snapshot: Snapshot;
        }>(roomPath(session, "invite"), session, { method: "POST", body: JSON.stringify({}) });
        onSession({ ...session, invite: next.invite });
        onState(next.snapshot);
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title={occupied ? "هر دو صندلی پر شده‌اند" : "صندلی دوم، برای آدمِ تو"} subtitle={occupied ? "دعوت پذیرفته شد؛ حالا سینمایتان آماده است." : "این لینک را فقط برای پارتنرت بفرست."} onClose={onClose}><div className="invite-ticket"><div className="ticket-perforation"/><span className="ticket-eyebrow" dir="ltr">PRIVATE INVITATION</span><Armchair size={44}/><h3>{state.room.title}</h3><span>یک صندلی برای تو. یکی برای من.</span><div className="ticket-details"><span><Users size={13}/> ۲ نفر</span><span><LockKeyhole size={13}/> خصوصی</span><span>ردیفِ ما، صندلی ۰۲</span></div></div>
    {occupied ? <div className="source-note"><CheckCircle2 size={20}/><p>پارتنرت وارد شده و این لینک دیگر برای ورود تازه قابل استفاده نیست. برای برگشتن، کافی‌ست اتاق را در همان مرورگر باز کند.</p></div> : link ? <><label className="field-label">لینک دعوت<input className="invite-url" dir="ltr" value={link} readOnly onFocus={e => e.target.select()} aria-label="لینک دعوت پارتنر"/></label><div className="button-row"><button className="button primary grow" onClick={copy}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? "کپی شد" : "کپی لینک دعوت"}</button>{typeof navigator !== "undefined" && !!navigator.share && <button className="button secondary" aria-label="اشتراک لینک دعوت" onClick={() => navigator.share({ title: state.room.title, text: "صندلی کنارت را نگه داشتم؛ بیا با هم فیلم ببینیم.", url: link }).catch(() => { })}><Share2 size={18}/></button>}</div></> : <button className="button primary full" disabled={busy} onClick={generate}>{busy ? <LoaderCircle className="spin" size={17}/> : <Link2 size={17}/>} ساخت لینک دعوت</button>}
    <p className="small-note"><ShieldCheck size={13}/> لینک یک‌بارمصرف است و جایگاه میزبان را به مهمان نمی‌دهد.</p>
  </Modal>;
}
function SettingsModal({ session, state, onState, onClose, notify, onDeleted, onReset }: {
    session: RoomSession;
    state: Snapshot;
    onState: (s: Snapshot) => void;
    onClose: () => void;
    notify: (t: string) => void;
    onDeleted: () => void;
    onReset: (s: RoomSession) => void;
}) {
    const [title, setTitle] = useState(state.room.title), [mood, setMood] = useState(state.room.mood), [shared, setShared] = useState(state.room.sharedControl), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState<"delete" | "reset" | null>(null);
    const isHost = session.seat === "host";
    async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); try {
        onState(await api<Snapshot>(roomPath(session, "settings"), session, { method: "PATCH", body: JSON.stringify({ title, mood, sharedControl: shared }) }));
        notify("حال‌وهوای سینما عوض شد.");
        onClose();
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function destructive() { setBusy(true); try {
        if (confirm === "delete") {
            await api(roomPath(session), session, { method: "DELETE" });
            notify("اتاق و فایل‌هایش حذف شدند.");
            onDeleted();
        }
        else {
            const result = await api<{
                invite: string;
                snapshot: Snapshot;
            }>(roomPath(session, "invite"), session, { method: "POST", body: JSON.stringify({ reset: true }) });
            onReset({ ...session, invite: result.invite });
            onState(result.snapshot);
            notify("صندلی دوم آزاد شد. لینک تازه را از بخش دعوت کپی کن.");
            onClose();
        }
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title={confirm === "delete" ? "سینما و فیلم‌هایش حذف شوند؟" : confirm === "reset" ? "صندلی دوم آزاد شود؟" : "حال‌وهوای سینمای ما"} subtitle={confirm ? undefined : "جزئیات کوچک، برای یک شب بهتر."} onClose={() => !busy && onClose()}>
    {confirm ? <><p className="dialog-copy">{confirm === "delete" ? "اتاق، همهٔ فیلم‌ها، زیرنویس‌ها و گفت‌وگو حذف می‌شوند. هر دو نفر از این اتاق خارج می‌شوند." : "دسترسی مهمان فعلی و لینک قبلی لغو می‌شود. یک دعوت تازه برای صندلی دوم ساخته می‌شود."}</p><div className="button-row"><button className="button secondary" onClick={() => setConfirm(null)} disabled={busy}>برگشت</button><button className="button destructive" onClick={destructive} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Trash2 size={17}/>} {confirm === "delete" ? "حذف کامل اتاق" : "آزاد کردن صندلی"}</button></div></> : <form className="form-stack" onSubmit={save}><label>اسم اتاق<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={60} disabled={!isHost || busy}/></label><div><span className="field-label">نور و حسِ امشب</span>{isHost ? <MoodPicker value={mood} onChange={setMood}/> : <p className="muted">حال‌وهوای اتاق را میزبان انتخاب می‌کند.</p>}</div><label className="switch-row"><span><strong>کنترل پخش برای هر دو</strong><small>هر دو بتوانید پلی، توقف و جلو زدن را کنترل کنید.</small></span><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} disabled={!isHost || busy}/><i aria-hidden="true"/></label>{isHost && <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} ذخیرهٔ حال‌وهوای ما</button>}
      <div className="settings-info"><ShieldCheck size={16}/><p>اتاق و فیلم‌ها با کلید اختصاصی هر مرورگر محافظت می‌شوند. لینک دعوت فقط صندلی دوم را باز می‌کند.</p></div>
      {isHost && <div className="settings-danger"><button type="button" className="text-button" onClick={() => setConfirm("reset")}><RefreshCw size={14}/> آزاد کردن صندلی مهمان و دعوت تازه</button><button type="button" className="text-button danger" onClick={() => setConfirm("delete")}><Trash2 size={14}/> حذف کامل اتاق و فایل‌ها</button></div>}
    </form>}
  </Modal>;
}
function SubtitleModal({ session, source, onState, onClose }: {
    session: RoomSession;
    source: MediaSource;
    onState: (s: Snapshot) => void;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState("");
    const input = useRef<HTMLInputElement>(null);
    async function upload(file: File) { if (file.size > 1024 * 1024) {
        setError("زیرنویس باید کمتر از یک مگابایت باشد.");
        return;
    } setBusy(true); setError(""); try {
        const content = await file.text();
        onState(await api<Snapshot>(roomPath(session, `media/${source.id}/subtitle`), session, { method: "PUT", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: content }));
        onClose();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title="کلمه‌ها هم کنارمان باشند" subtitle="یک زیرنویس فارسی یا هر زبان دیگری برای هر دو نفر." onClose={() => !busy && onClose()}><input className="sr-only" type="file" tabIndex={-1} aria-hidden="true" accept=".srt,.vtt" ref={input} onChange={e => { if (e.target.files?.[0])
        upload(e.target.files[0]); }}/><div className="dropzone"><span className="upload-icon"><Captions size={36}/></span><h3>زیرنویس SRT یا VTT</h3><p>برای فیلم: {source.title}</p><button className="button primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Upload size={17}/>} {busy ? "در حال اضافه کردن…" : "انتخاب زیرنویس"}</button><span className="dropzone-limit">تا ۱ مگابایت · ترجیحاً با کدگذاری UTF-8</span></div>{error && <p className="inline-error" role="alert">{error}</p>}</Modal>;
}
function HelpModal({ onClose }: {
    onClose: () => void;
}) {
    return <Modal title="یک شب مشترک، در سه قدم" subtitle="همه‌چیز برای تماشای دونفره آماده است." onClose={onClose} wide>
  <div className="help-steps"><div><span>۱</span><h3>سینمایتان را بساز</h3><p>اسمت و اسم اتاق را بنویس و نور دلخواهت را انتخاب کن.</p></div><div><span>۲</span><h3>صندلی کنارت را دعوت کن</h3><p>لینک دعوت را برای پارتنرت بفرست. مهمان با اسمش و همان لینک وارد می‌شود.</p></div><div><span>۳</span><h3>فیلم بگذار؛ با هم ببینید</h3><p>فیلم را آپلود کن یا لینک بده. آماده‌باش را بزنید و با شمارش معکوس شروع کنید.</p></div></div>
  <div className="help-details"><h3><MonitorIcon /> چه فیلم‌هایی پخش می‌شوند؟</h3><p><strong>فایل آپلودی:</strong> تا ۴ گیگابایت، با کیفیت اصلی و آپلود قابل ادامه. MP4 با H.264/AAC و WebM روی دستگاه‌های بیشتری پخش می‌شوند. کیفیت 4K هم در صورت پشتیبانی دستگاه و اینترنت حفظ می‌شود.</p><p><strong>لینک مستقیم و HLS:</strong> باید آدرس خودِ ویدیو باشد. برای HLS و برخی منابع دارای زیرنویس، سرور فیلم باید CORS را فعال کرده باشد.</p><p><strong>یوتیوب:</strong> پخش هماهنگ با پلیر رسمی؛ بعضی ویدیوها نمایش در سایت دیگر را نمی‌پذیرند. کیفیت از تنظیمات خود پلیر انتخاب می‌شود و هر دو نفر باید به یوتیوب دسترسی داشته باشند.</p><p><strong>آپارات:</strong> ابتدا پخش مستقیم هماهنگ از منابع عمومی امتحان می‌شود. در صورت محدودیت، پلیر رسمی نمایش داده می‌شود؛ کنترل خودکار زمان در این حالت در دسترس نیست.</p></div>
  <div className="keyboard-help"><h3>کلیدهای کوچک، تجربهٔ بهتر</h3><div><span><kbd>Space</kbd> پلی / توقف</span><span><kbd>← →</kbd> ده ثانیه جابه‌جایی</span><span><kbd>F</kbd> تمام‌صفحه</span><span><kbd>M</kbd> بی‌صدا</span></div></div><div className="source-note"><ShieldCheck size={18}/><p>برای برگشت به اتاق از همان مرورگر استفاده کنید. با پاک‌کردن داده‌های مرورگر، کلید ورود هم پاک می‌شود؛ میزبان می‌تواند صندلی مهمان را آزاد و دوباره دعوت کند. اتاق و فیلم‌ها از تنظیمات قابل حذف‌اند.</p></div>
  <button className="button primary full" onClick={onClose}>آمادهٔ سینماییم <Popcorn size={17}/></button>
    </Modal>;
}
function MonitorIcon() { return <Clapperboard size={18}/>; }
