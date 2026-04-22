export interface ChatSessionMessage {
  role: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
  generatingImage?: boolean;
}

export interface ChatSession {
  id: string;
  name: string;
  pinned: boolean;
  messages: ChatSessionMessage[];
  owner?: string;
  deleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;
  name: string;
  pinned: boolean;
  updatedAt: string;
}
