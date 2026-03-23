import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChatAskBodyDto {
  @ApiProperty({
    example: 'What procedures are covered under my plan?',
    description: 'User question for the chat / RAG flow.',
  })
  @IsString()
  question: string;
}
