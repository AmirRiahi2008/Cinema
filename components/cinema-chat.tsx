"use client";
import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle, ChevronDown, LoaderCircle, RotateCcw, Moon, Sparkles, CheckCheck, Heart, LockKeyhole } from "lucide-react";
import { REACTIONS, type ChatMessage, type RoomSession, type Snapshot } from "@/lib/cinema-types";
import { api, roomPath } from "@/lib/cinema-client";
type Pending = {
    client_id: string;
    text: string;
    failed: boolean;
};
export function CinemaChat({ state, session, onState, typing, onInvite, notify }: {
    state: Snapshot;
    session: RoomSession;
    onState: (value: Snapshot) => void;
    typing: (value: boolean) => void;
    onInvite: () => void;
    notify: (text: string) => void;
}) {
    const [draft, setDraft] = useState(""), [pending, setPending] = useState<Pending[]>([]), [unread, setUnread] = useState(false);
    const scroll = useRef<HTMLDivElement>(null), lastId = useRef(0), nearBottom = useRef(true), textarea = useRef<HTMLTextAreaElement>(null);
    const partner = state.members.find(m => m.seat !== session.seat), online = partner && state.serverTime - partner.last_seen < 16000;
    const messages = state.messages.filter(m => m.kind !== "reaction");
    const seen = new Set(state.messages.map(m => m.client_id));
    const outstanding = pending.filter(p => !seen.has(p.client_id));
    useEffect(() => {
        const last = state.messages.at(-1)?.id || 0;
        if (last === lastId.current)
            return;
        lastId.current = last;
        if (nearBottom.current) {
            requestAnimationFrame(() => { if (scroll.current)
                scroll.current.scrollTop = scroll.current.scrollHeight; });
        }
        else
            setUnread(true);
    }, [state.messages]);
    async function send(text: string, clientId = crypto.randomUUID()) {
        const clean = text.trim();
        if (!clean)
            return;
        setPending(p => [...p.filter(m => m.client_id !== clientId), { client_id: clientId, text: clean, failed: false }].slice(-20));
        typing(false);
        nearBottom.current = true;
        requestAnimationFrame(() => { if (scroll.current)
            scroll.current.scrollTop = scroll.current.scrollHeight; });
        try {
            const next = await api<Snapshot>(roomPath(session, "messages"), session, { method: "POST", body: JSON.stringify({ text: clean, clientId }) });
            onState(next);
            setPending(p => p.filter(m => m.client_id !== clientId));
        }
        catch (e) {
            setPending(p => p.map(m => m.client_id === clientId ? { ...m, failed: true } : m));
            notify((e as Error).message);
        }
    }
    async function react(emoji: string) { try {
        onState(await api<Snapshot>(roomPath(session, "messages"), session, { method: "POST", body: JSON.stringify({ kind: "reaction", text: emoji, clientId: crypto.randomUUID() }) }));
    }
    catch (e) {
        notify((e as Error).message);
    } }
    function submit(e?: React.FormEvent) { e?.preventDefault(); if (!draft.trim())
        return; const value = draft; setDraft(""); if (textarea.current)
        textarea.current.style.height = "auto"; send(value); }
    return <aside className="chat-panel">
    <div className="chat-header"><span className="chat-title-icon"><MessageCircle size={19}/></span><div><h2>حرف‌های بین فیلم</h2><p><span className={`status-dot ${online ? "" : "offline"}`}/>{online ? `${partner.name} اینجاست` : partner ? "منتظر برگشتن پارتنرت" : "این گوشه، جای حرف‌های ماست"}</p></div><span className="chat-heart"><Heart size={16}/></span></div>
    <div className="chat-scroll" ref={scroll} onScroll={() => { const el = scroll.current; if (el) {
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (nearBottom.current)
            setUnread(false);
    } }}>
      <div className="chat-privacy"><LockKeyhole size={12}/> این گفت‌وگو فقط برای دو نفر است.</div>
      {messages.length === 0 && <div className="chat-empty"><div className="chat-empty-art"><span><Moon size={25}/></span><Heart size={17}/><span><Sparkles size={25}/></span></div><h3>کنار هم، حتی از دور</h3><p>{partner ? "اولین پیامِ این شب را تو بفرست." : "لینک را بفرست تا صندلی دوم پر شود. بعد، فیلم و حرف‌هایش برای شماست."}</p>{!partner && session.seat === "host" && <button className="text-button" onClick={onInvite}>دعوت به صندلی دوم ←</button>}</div>}
      {messages.map((message, index) => <ChatBubble key={message.id} message={message} own={message.seat === session.seat} name={state.members.find(m => m.seat === message.seat)?.name || (message.seat === "host" ? "میزبان" : "مهمان")} showName={index === 0 || messages[index - 1].seat !== message.seat}/>)}
      {outstanding.map(message => <div className={`message own pending ${message.failed ? "failed" : ""}`} key={message.client_id}><div className="message-body"><p dir="auto">{message.text}</p><span className="message-meta">{message.failed ? <button onClick={() => send(message.text, message.client_id)}><RotateCcw size={12}/> دوباره ارسال</button> : <><LoaderCircle size={11} className="spin"/> در حال ارسال</>}</span></div></div>)}
      {partner && partner.typing_until > state.serverTime && <div className="typing-indicator"><span /><span /><span /><small>{partner.name} دارد می‌نویسد</small></div>}
    </div>
    {unread && <button className="new-messages" onClick={() => { if (scroll.current)
        scroll.current.scrollTop = scroll.current.scrollHeight; nearBottom.current = true; setUnread(false); }}>پیام تازه <ChevronDown size={14}/></button>}
    <div className="reaction-bar"><span>حست را بفرست</span><div>{REACTIONS.map(emoji => <button key={emoji} onClick={() => react(emoji)} aria-label={`ارسال واکنش ${emoji}`} title={`ارسال ${emoji}`}>{emoji}</button>)}</div></div>
    <form className="chat-composer" onSubmit={submit}><textarea ref={textarea} rows={1} placeholder="یه چیزی بگو…" aria-label="پیام به پارتنر" value={draft} maxLength={1500} onChange={e => { setDraft(e.target.value); typing(!!e.target.value.trim()); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }} onBlur={() => typing(false)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
    } }}/><button aria-label="فرستادن پیام" className="send-button" disabled={!draft.trim()}><Send size={18}/></button></form>
    <span className="chat-hint">Enter برای ارسال · Shift + Enter برای خط بعد</span>
  </aside>;
}
function ChatBubble({ message, own, name, showName }: {
    message: ChatMessage;
    own: boolean;
    name: string;
    showName: boolean;
}) {
    if (message.kind === "system")
        return <div className="system-message"><Sparkles size={12}/><span>{message.text}</span></div>;
    return <div className={`message ${own ? "own" : "partner"}`}>
    {showName && <span className="message-name">{own ? "تو" : name}</span>}
    <div className="message-body"><p dir="auto">{message.text}</p><span className="message-meta"><time dateTime={new Date(message.created_at).toISOString()}>{new Date(message.created_at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</time>{own && <CheckCheck size={12} aria-label="به سرور رسید"/>}</span></div>
  </div>;
}
