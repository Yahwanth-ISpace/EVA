// src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import { SessionManager } from './session/session.manager';

@Injectable()
export class ChatService {
  private sessionManager = new SessionManager();

  constructor() {}

  async askQuestion(userId: string, question: string): Promise<string> {
    // Here you can fetch context from DB based on question
    // Example: fetch user-specific data or relevant documents
    const relevantData = await this.fetchFromDatabase(question);

    // Generate a response (mocked here, replace with LLM or custom logic)
    const answer = `Answer based on database: ${relevantData}`;

    // Save session history
    this.sessionManager.addMessage(userId, question, answer);

    return answer;
  }

  async fetchFromDatabase(question: string): Promise<string> {
    // Mock database call
    return `DB info for "${question}"`;
  }

  getSessionHistory(userId: string) {
    return this.sessionManager.getSession(userId).history;
  }

  clearSession(userId: string) {
    this.sessionManager.clearSession(userId);
  }
}
