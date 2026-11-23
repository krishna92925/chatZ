import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types.js';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** REST handlers emit through this; it does nothing until the socket server is attached. */
class Realtime {
  io: IoServer | null = null;

  attach(io: IoServer) {
    this.io = io;
  }

  room(userId: string) {
    return `u:${userId}`;
  }

  toUsers<E extends keyof ServerToClientEvents>(userIds: string[], event: E, ...args: Parameters<ServerToClientEvents[E]>) {
    if (!this.io || !userIds.length) return;
    (this.io.to(userIds.map((u) => this.room(u))) as any).emit(event, ...args);
  }

  toUser<E extends keyof ServerToClientEvents>(userId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>) {
    this.toUsers([userId], event, ...args);
  }
}

export const realtime = new Realtime();
