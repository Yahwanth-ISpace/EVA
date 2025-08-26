// src/chat/session-manager.ts
interface Session {
  userId: string;
  history: { question: string; answer: string }[];
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  getSession(userId: string): Session {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, { userId, history: [] });
    }
    return this.sessions.get(userId)!;
  }

  addMessage(userId: string, question: string, answer: string) {
    const session = this.getSession(userId);
    session.history.push({ question, answer });
  }

  clearSession(userId: string) {
    this.sessions.delete(userId);
  }
}
