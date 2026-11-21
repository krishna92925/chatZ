import { createContext, useContext } from "react";
import type { User } from "../store/authStore";

export type Conversation = {
  conversationId: string;
  friend: User & { online: boolean };
  unreadCounts: Record<string, number>;
  lastMessage: {
    content: string;
    timestamp: Date;
  } | null;
};

export type ConversationContextType = {
  conversations: Conversation[];
  filteredConversations: Conversation[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isLoading: boolean;
  isError: boolean;
};

export const conversationContext = createContext<ConversationContextType | undefined>(undefined);

export const useConversationsContext = () => {
  const context = useContext(conversationContext);
  if (!context) {
    throw new Error("useConversationsContext must be used within a ConversationsProvider");
  }
  return context;
};
