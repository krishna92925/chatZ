// Types shared by backend and frontend. Types only: nothing here exists at runtime.

export type Id = string;

export interface PrivacySettings {
  showOnline: boolean;
  showLastSeen: boolean;
  readReceipts: boolean;
  whoCanMessage: 'friends' | 'everyone';
}

export interface Profile {
  id: Id;
  username: string;
  fullName: string;
  bio: string;
  avatarUrl: string | null;
  connectCode: string;
  settings: PrivacySettings;
  createdAt: string;
}

export interface PublicUser {
  id: Id;
  username: string;
  fullName: string;
  bio: string;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
}

export type Relation =
  | 'self'
  | 'none'
  | 'friends'
  | 'request_sent'
  | 'request_received'
  | 'blocked'
  | 'blocked_by';

export interface UserCard extends PublicUser {
  relation: Relation;
  requestId: Id | null;
  canMessage: boolean;
}

export type AttachmentKind = 'image' | 'video' | 'file';
export type MessageKind = 'text' | 'image' | 'video' | 'file';

export interface Attachment {
  id: Id;
  kind: AttachmentKind;
  mime: string;
  size: number;
  name: string;
  width: number | null;
  height: number | null;
  url: string;
}

export interface UploadResult {
  id: Id;
  kind: AttachmentKind;
  mime: string;
  size: number;
  name: string;
  width: number | null;
  height: number | null;
}

export interface ReplyPreview {
  id: Id;
  senderId: Id;
  kind: MessageKind;
  body: string;
  deleted: boolean;
}

export interface ReactionGroup {
  emoji: string;
  userIds: Id[];
}

export interface Message {
  id: Id;
  conversationId: Id;
  seq: number;
  senderId: Id;
  kind: MessageKind;
  body: string;
  attachments: Attachment[];
  replyTo: ReplyPreview | null;
  reactions: ReactionGroup[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  clientId: string | null;
}

export interface LastMessage {
  id: Id;
  senderId: Id;
  kind: MessageKind;
  body: string;
  deleted: boolean;
  createdAt: string;
}

export interface Conversation {
  id: Id;
  type: 'direct';
  peer: PublicUser;
  lastMessage: LastMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  /** false when blocked, or when the other person only accepts messages from friends and you are not friends */
  canSend: boolean;
  myLastReadSeq: number;
  /** null when read receipts are switched off by either person */
  peerLastReadSeq: number | null;
  createdAt: string;
}

export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
  hasNewer: boolean;
}

export interface FriendRequest {
  id: Id;
  direction: 'incoming' | 'outgoing';
  user: PublicUser;
  createdAt: string;
}

export interface SearchMessageHit {
  message: Message;
  conversationId: Id;
  peer: PublicUser;
}

export interface MeResponse {
  email: string;
  profile: Profile | null;
}

export interface OtpStartResponse {
  ok: true;
  maskedEmail: string | null;
}

export interface SessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface SendMessagePayload {
  conversationId: Id;
  clientId: string;
  body?: string;
  replyToId?: Id | null;
  attachmentIds?: Id[];
}

export interface ClientToServerEvents {
  'message:send': (p: SendMessagePayload, ack: (r: Ack<Message>) => void) => void;
  'message:edit': (p: { messageId: Id; body: string }, ack: (r: Ack<Message>) => void) => void;
  'message:delete': (p: { messageId: Id; scope: 'me' | 'everyone' }, ack: (r: Ack<null>) => void) => void;
  'reaction:toggle': (p: { messageId: Id; emoji: string }, ack: (r: Ack<ReactionGroup[]>) => void) => void;
  'conversation:read': (p: { conversationId: Id; seq: number }, ack?: (r: Ack<null>) => void) => void;
  typing: (p: { conversationId: Id; isTyping: boolean }) => void;
}

export interface ServerToClientEvents {
  'message:new': (p: { message: Message }) => void;
  'message:updated': (p: { message: Message }) => void;
  'message:hidden': (p: { conversationId: Id; messageId: Id }) => void;
  'reaction:updated': (p: { conversationId: Id; messageId: Id; reactions: ReactionGroup[] }) => void;
  'receipt:updated': (p: { conversationId: Id; userId: Id; lastReadSeq: number }) => void;
  typing: (p: { conversationId: Id; userId: Id; isTyping: boolean }) => void;
  'presence:update': (p: { userId: Id; online: boolean; lastSeenAt: string | null }) => void;
  'friend:request': (p: { request: FriendRequest }) => void;
  'friend:accepted': (p: { user: PublicUser; conversationId: Id }) => void;
  'friend:removed': (p: { userId: Id }) => void;
  'conversation:updated': (p: { conversationId: Id }) => void;
}
