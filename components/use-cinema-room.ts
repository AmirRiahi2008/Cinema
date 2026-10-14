"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, isSnapshot, RequestError, roomPath } from "@/lib/cinema-client";
import type { RoomSession, Snapshot } from "@/lib/cinema-types";
export function useCinemaRoom(session: RoomSession, initial: Snapshot | null, onError: (message: string) => void, onInvalid: () => void) {
    const [state, setState] = useState<Snapshot | null>(initial);
    const [connection, setConnection] = useState<"connecting" | "online" | "reconnecting">("connecting");
    const [latency, setLatency] = useState(0);
    const [clockOffset, setClockOffset] = useState(0);
    const [commandBusy, setCommandBusy] = useState(false);
    const stateRef = useRef(state);
    const typingRef = useRef(false);
    const callbacks = useRef({ onError, onInvalid });
    callbacks.current = { onError, onInvalid };
    const lastClock = useRef(false);
    const apply = useCallback((next: Snapshot) => {
        if (next.room.id !== session.id)
            return;
        const previous = stateRef.current;
        if (previous && (next.room.revision < previous.room.revision || next.serverTime < previous.serverTime))
            return;
        if (previous?.mediaAccess && Number(new URLSearchParams(previous.mediaAccess).get("until")) > Date.now() + 300000)
            next = { ...next, mediaAccess: previous.mediaAccess };
        stateRef.current = next;
        setState(next);
    }, [session.id]);
    const refresh = useCallback(async () => {
        const start = Date.now();
        const next = await api<Snapshot>(roomPath(session), session);
        const rtt = Date.now() - start, offset = next.serverTime - (start + rtt / 2);
        setLatency(rtt);
        setClockOffset(previous => { if (!lastClock.current) {
            lastClock.current = true;
            return offset;
        } return rtt < 2500 ? previous * .65 + offset * .35 : previous; });
        apply(next);
        setConnection("online");
        return next;
    }, [session, apply]);
    useEffect(() => {
        let stopped = false, timer: ReturnType<typeof setTimeout>, failures = 0;
        async function poll() {
            try {
                await refresh();
                failures = 0;
            }
            catch (e) {
                if (stopped)
                    return;
                setConnection("reconnecting");
                failures++;
                if (e instanceof RequestError && [401, 404].includes(e.status)) {
                    callbacks.current.onError(e.message);
                    callbacks.current.onInvalid();
                    return;
                }
            }
            if (!stopped)
                timer = setTimeout(poll, failures ? Math.min(10000, 1200 * 2 ** failures) : document.hidden ? 3000 : 1000);
        }
        api<Snapshot>(roomPath(session, "session"), session, { method: "POST" }).then(next => { if (!stopped)
            apply(next); }).catch(() => { });
        poll();
        const heartbeat = () => api(roomPath(session, "heartbeat"), session, { method: "POST", body: JSON.stringify({ typing: typingRef.current }) }).catch(() => { });
        heartbeat();
        const heartTimer = setInterval(heartbeat, 5000);
        const reconnect = () => { if (!stopped)
            refresh().catch(() => { }); };
        window.addEventListener("online", reconnect);
        document.addEventListener("visibilitychange", reconnect);
        return () => { stopped = true; clearTimeout(timer); clearInterval(heartTimer); window.removeEventListener("online", reconnect); document.removeEventListener("visibilitychange", reconnect); };
    }, [session, refresh, apply]);
    const mutate = useCallback(async (suffix: string, data?: unknown, method = "POST") => {
        const next = await api<Snapshot>(roomPath(session, suffix), session, { method, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
        apply(next);
        return next;
    }, [session, apply]);
    const sendPlayback = useCallback(async (change: {
        position: number;
        playing: boolean;
        rate?: number;
        countdown?: boolean;
    }) => {
        const current = stateRef.current;
        if (!current?.playback.mediaId)
            return;
        setCommandBusy(true);
        try {
            await mutate("playback", { mediaId: current.playback.mediaId, revision: current.playback.revision, rate: current.playback.rate, ...change });
        }
        catch (e) {
            if (e instanceof RequestError && isSnapshot(e.payload))
                apply(e.payload);
            else {
                callbacks.current.onError((e as Error).message);
                refresh().catch(() => { });
            }
        }
        finally {
            setCommandBusy(false);
        }
    }, [mutate, apply, refresh]);
    const typing = useCallback((value: boolean) => {
        if (typingRef.current === value)
            return;
        typingRef.current = value;
        api(roomPath(session, "heartbeat"), session, { method: "POST", body: JSON.stringify({ typing: value }) }).catch(() => { });
    }, [session]);
    return { state, apply, connection, latency, clockOffset, mutate, refresh, sendPlayback, commandBusy, typing };
}
