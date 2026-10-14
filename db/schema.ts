import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  mood: text("mood").notNull().default("amber"), inviteHash: text("invite_hash"),
  sharedControl: integer("shared_control").notNull().default(1), mediaId: text("media_id"),
  position: real("position").notNull().default(0), playing: integer("playing").notNull().default(0),
  rate: real("rate").notNull().default(1), playbackAt: integer("playback_at").notNull(),
  playbackRevision: integer("playback_revision").notNull().default(0),
  actor: text("actor").notNull().default("host"), revision: integer("revision").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const members = sqliteTable("members", {
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  seat: text("seat").notNull(), tokenHash: text("token_hash").notNull(), name: text("name").notNull(),
  avatar: text("avatar").notNull().default("moon"), ready: integer("ready").notNull().default(0),
  lastSeen: integer("last_seen").notNull(), typingUntil: integer("typing_until").notNull().default(0),
}, t => [primaryKey({ columns: [t.roomId, t.seat] }), uniqueIndex("members_token").on(t.tokenHash)]);
export const media = sqliteTable("media", {
  id: text("id").primaryKey(), roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  title: text("title").notNull(), type: text("type").notNull(), url: text("url").notNull().default(""),
  objectKey: text("object_key"), subtitleKey: text("subtitle_key"), mime: text("mime").notNull().default("video/mp4"),
  size: integer("size").notNull().default(0), extra: text("extra").notNull().default("{}"), createdAt: integer("created_at").notNull(),
}, t => [index("media_room").on(t.roomId, t.createdAt)]);
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  seat: text("seat").notNull(), text: text("text").notNull(), kind: text("kind").notNull().default("text"),
  clientId: text("client_id").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("messages_room").on(t.roomId, t.id), uniqueIndex("messages_client").on(t.roomId, t.clientId)]);
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(), roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(), multipartId: text("multipart_id").notNull(), name: text("name").notNull(),
  mime: text("mime").notNull(), size: integer("size").notNull(), status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
}, t => [index("uploads_room").on(t.roomId)]);
export const uploadParts = sqliteTable("upload_parts", {
  uploadId: text("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  partNumber: integer("part_number").notNull(), etag: text("etag").notNull(), bytes: integer("bytes").notNull(),
}, t => [primaryKey({ columns: [t.uploadId, t.partNumber] })]);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), resetAt: integer("reset_at").notNull(),
});
