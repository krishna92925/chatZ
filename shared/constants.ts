// Values shared by the API, the socket server and the web app.
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'support', 'help', 'system', 'chatz', 'moderator', 'mod', 'staff', 'null', 'undefined', 'me', 'api',
];
export const MAX_BODY_LENGTH = 4000;
export const MAX_ATTACHMENTS = 6;
export const MAX_NAME_LENGTH = 40;
export const MAX_BIO_LENGTH = 160;
export const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * MB;
export const MAX_VIDEO_BYTES = 50 * MB;
export const MAX_FILE_BYTES = 25 * MB;
export const MAX_AVATAR_BYTES = 5 * MB;
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const CONNECT_CODE_LENGTH = 10;
