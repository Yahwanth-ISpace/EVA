// src/chat/chat.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { SessionManager } from './session/session.manager';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private sessionManager = new SessionManager();

  constructor() {}

  /**
   * Ask a question to the chat system
   */
  async askQuestion(userId: string, question: string): Promise<string> {
    this.logger.debug(`User ${userId} asked: ${question}`);

    // Step 1: Fetch relevant context from DB or vector store
    const relevantData = await this.fetchFromDatabase(question);

    // Step 2: Generate response (could plug in OpenAI, Ollama, or RAG here)
    const answer = await this.generateAnswer(question, relevantData);

    // Step 3: Save session history
    this.sessionManager.addMessage(userId, question, answer);

    return answer;
  }

  /**
   * Mock DB call — replace with Prisma, Mongo, or RAG
   */
  async fetchFromDatabase(question: string): Promise<string> {
    // Example: query DB by keywords or vector search
    return `Mocked DB info related to "${question}"`;
  }

  /**
   * Generate an answer (replace with actual LLM)
   */
  async generateAnswer(question: string, context: string): Promise<string> {
    // Right now just a stub
    return `Based on your question "${question}", here's context: ${context}`;
  }

  /**
   * Retrieve session history for a user
   */
  getSessionHistory(userId: string) {
    return this.sessionManager.getSession(userId).history;
  }

  /**
   * Clear session history
   */
  clearSession(userId: string) {
    this.logger.debug(`Clearing session for user ${userId}`);
    this.sessionManager.clearSession(userId);
  }
}
