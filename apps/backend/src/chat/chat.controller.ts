// src/chat/chat.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatAskBodyDto } from './dto/chat-ask.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':userId')
  @ApiOperation({
    summary: 'Ask a question (session by userId)',
    description: 'Body `{ "question": "..." }` — returns `{ answer }` from chat/RAG service.',
  })
  @ApiParam({ name: 'userId', example: 'user-uuid-or-session-key' })
  @ApiBody({ type: ChatAskBodyDto })
  async ask(
    @Param('userId') userId: string,
    @Body() body: ChatAskBodyDto,
  ) {
    const answer = await this.chatService.askQuestion(userId, body.question);
    return { answer };
  }

  @Get('history/:userId')
  @ApiOperation({ summary: 'Chat session history for userId' })
  @ApiParam({ name: 'userId', example: 'user-uuid-or-session-key' })
  getHistory(@Param('userId') userId: string) {
    return this.chatService.getSessionHistory(userId);
  }

  @Post('clear/:userId')
  @ApiOperation({ summary: 'Clear chat session' })
  @ApiParam({ name: 'userId', example: 'user-uuid-or-session-key' })
  clear(@Param('userId') userId: string) {
    this.chatService.clearSession(userId);
    return { status: 'cleared' };
  }
}
