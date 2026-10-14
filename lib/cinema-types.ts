export type Seat = "host" | "guest";
export type Mood = "amber" | "rose" | "midnight";
export type MediaSource = {
    id: string;
    title: string;
    type: "upload" | "direct" | "youtube" | "aparat";
    url: string;
    mime: string;
    size: number;
    created_at: number;
    subtitle: boolean;
    extra: {
        providerId?: string;
        qualities?: {
            label: string;
            url: string;
        }[];
        poster?: string;
        mode?: string;
    };
};
export type Member = {
    seat: Seat;
    name: string;
    avatar: string;
    ready: number;
    last_seen: number;
    typing_until: number;
};
export type ChatMessage = {
    id: number;
    seat: Seat;
    text: string;
    kind: "text" | "reaction" | "system";
    client_id: string;
    created_at: number;
};
export type Playback = {
    mediaId: string | null;
    position: number;
    playing: boolean;
    rate: number;
    updatedAt: number;
    revision: number;
    actor: Seat;
};
export type Snapshot = {
    room: {
        id: string;
        title: string;
        mood: Mood;
        sharedControl: boolean;
        inviteOpen: boolean;
        revision: number;
        createdAt: number;
    };
    me: Seat;
    members: Member[];
    media: MediaSource[];
    messages: ChatMessage[];
    playback: Playback;
    serverTime: number;
    mediaAccess: string;
};
export type RoomSession = {
    id: string;
    token: string;
    seat: Seat;
    title: string;
    invite?: string;
    name: string;
    createdAt: number;
};
export const CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_FILE_SIZE = 4 * 1024 ** 3;
export const REACTIONS = ["❤️", "😂", "🥹", "🍿", "😮", "✨"];
