export interface User {
  id: string;
  username: string;
  email: string;
  department_id: string | null;
  is_active: boolean;
  personal_rag_enabled: boolean;
  roles: RoleBrief[];
  created_at: string;
  updated_at: string;
}

export interface RoleBrief {
  id: string;
  name: string;
  description: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
  rating?: string | null;
  rating_reason?: string | null;
  created_at: string;
}

export interface RagSource {
  document_name: string;
  knowledge_base_name?: string;
  page_no: number | null;
  section_title: string | null;
  chunk_text: string;
  score: number;
  chunk_id?: string;
}

export interface Conversation {
  id: string;
  title: string;
  kb_type: "enterprise" | "personal";
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  kb_type: string;
  knowledge_base_ids: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}
