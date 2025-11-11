
export interface DocumentFile {
  name: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}
