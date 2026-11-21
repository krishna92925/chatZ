import { useEffect, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuthStore } from "../store/authStore";
import { SocketContext } from "./SocketContext";

type SocketConnection = { userId: string; socket: Socket };

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const userId = useAuthStore((state) => state.user?.id);
  const [connection, setConnection] = useState<SocketConnection | null>(null);

  useEffect(() => {
    if (!userId) return;

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
    const socketClient = io(apiUrl.replace(/\/api\/?$/, ""), {
      withCredentials: true,
      reconnectionAttempts: 1,
    });

    const handleConnect = () => {
      console.log("Socket connected", socketClient.id);
      setConnection({ userId, socket: socketClient });
    };
    const handleConnectError = (error: Error) => {
      console.error("Socket connection error", error);
      toast.error("Socket connection error");
    };
    const handleDisconnect = () => {
      setConnection((current) => current?.socket === socketClient ? null : current);
    };
    const handleInternalError = (error: unknown) => {
      console.error("Socket internal error", error);
      toast.error("Socket connection error");
    };

    socketClient.on("connect", handleConnect);
    socketClient.on("connect_error", handleConnectError);
    socketClient.on("disconnect", handleDisconnect);
    socketClient.on("internal_error", handleInternalError);

    return () => {
      socketClient.off("connect", handleConnect);
      socketClient.off("connect_error", handleConnectError);
      socketClient.off("disconnect", handleDisconnect);
      socketClient.off("internal_error", handleInternalError);
      socketClient.disconnect();
    };
  }, [userId]);

  const socket = connection && userId && connection.userId === userId ? connection.socket : null;

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};
