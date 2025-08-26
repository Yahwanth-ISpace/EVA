// src/chat/chat.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':userId')
  async ask(
    @Param('userId') userId: string,
    @Body('question') question: string,
  ) {
    const answer = await this.chatService.askQuestion(userId, question);
    return { answer };
  }

  @Get('history/:userId')
  getHistory(@Param('userId') userId: string) {
    return this.chatService.getSessionHistory(userId);
  }

  @Post('clear/:userId')
  clear(@Param('userId') userId: string) {
    this.chatService.clearSession(userId);
    return { status: 'cleared' };
  }
}
