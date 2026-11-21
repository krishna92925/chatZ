import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConversations } from "../hooks/useConversation";
import { useSocketContext } from "./SocketContext";
import { conversationContext, type Conversation } from "./ConversationContext";

const CONVERSATIONS_QUERY_KEY = ["conversations"];

export const ConversationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data, isLoading, isError } = useConversations();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const conversations = useMemo<Conversation[]>(() => data?.data ?? [], [data]);

  const updateConversations = useCallback(
    (update: (items: Conversation[]) => Conversation[]) => {
      queryClient.setQueryData<{ data: Conversation[] }>(CONVERSATIONS_QUERY_KEY, (current) =>
        current ? { ...current, data: update(current.data) } : current,
      );
    },
    [queryClient],
  );

  useEffect(() => {
    if (!socket) return;

    const handleConversationOnlineStatus = (event: {
      friendId: string;
      username: string;
      online: boolean;
    }) => {
      const friend = queryClient
        .getQueryData<{ data: Conversation[] }>(CONVERSATIONS_QUERY_KEY)
        ?.data.find((conversation) => conversation.friend.id === event.friendId);
      if (friend && friend.friend.online !== event.online) {
        toast.info(`${event.username} is ${event.online ? "online" : "offline"}`);
      }
      updateConversations((items) =>
        items.map((conversation) =>
          conversation.friend.id === event.friendId
            ? { ...conversation, friend: { ...conversation.friend, online: event.online } }
            : conversation,
        ),
      );
    };

    const handleNewConversation = (conversation: Conversation) => {
      let added = false;
      updateConversations((items) => {
        if (items.some((item) => item.conversationId === conversation.conversationId)) return items;
        added = true;
        return [...items, conversation];
      });
      if (added) toast.success(`You and ${conversation.friend.username} are now friends!`);
    };

    const handleUnreadCounts = (event: {
      conversationId: string;
      unreadCounts: Record<string, number>;
    }) => {
      updateConversations((items) =>
        items.map((conversation) =>
          conversation.conversationId === event.conversationId
            ? { ...conversation, unreadCounts: event.unreadCounts }
            : conversation,
        ),
      );
    };

    const handleConversationUpdate = (
      event: Pick<Conversation, "conversationId" | "lastMessage" | "unreadCounts">,
    ) => {
      updateConversations((items) =>
        items.map((conversation) =>
          conversation.conversationId === event.conversationId
            ? {
                ...conversation,
                lastMessage: event.lastMessage,
                unreadCounts: event.unreadCounts,
              }
            : conversation,
        ),
      );
    };

    const handleConversationError = () => toast.error("Unable to add conversation");
    const handleMarkAsReadError = () => toast.error("Unable to mark conversation as read");

    socket.on("conversation:online-status", handleConversationOnlineStatus);
    socket.on("conversation:accept", handleNewConversation);
    socket.on("conversation:update-unread-counts", handleUnreadCounts);
    socket.on("conversation:update-conversation", handleConversationUpdate);
    socket.on("conversation:request:error", handleConversationError);
    socket.on("conversation:mark-as-read:error", handleMarkAsReadError);

    return () => {
      socket.off("conversation:online-status", handleConversationOnlineStatus);
      socket.off("conversation:accept", handleNewConversation);
      socket.off("conversation:update-unread-counts", handleUnreadCounts);
      socket.off("conversation:update-conversation", handleConversationUpdate);
      socket.off("conversation:request:error", handleConversationError);
      socket.off("conversation:mark-as-read:error", handleMarkAsReadError);
    };
  }, [socket, queryClient, updateConversations]);

  const filteredConversations = conversations.filter((conversation) =>
    conversation.friend.username.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <conversationContext.Provider
      value={{ conversations, filteredConversations, searchTerm, setSearchTerm, isLoading, isError }}
    >
      {children}
    </conversationContext.Provider>
  );
};
