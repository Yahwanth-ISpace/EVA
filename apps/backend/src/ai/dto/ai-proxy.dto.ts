import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Body for `POST /ai/ingest-text` — forwarded to external RAG (`AI_SERVER_URL`). Shape matches your RAG `/rag/ingest/text` API. */
export class AiIngestTextDto {
  @ApiProperty({
    example: 'Plan covers preventive at 100%.',
    description: 'Example field; add fields your ingest endpoint expects.',
  })
  text?: string;
}

/** Body for `POST /ai/ask` — RAG query. */
export class AiAskDto {
  @ApiPropertyOptional({ example: 'tenant-uuid-123' })
  tenant_id?: string;

  @ApiProperty({
    example: 'What is the copay for specialist visits?',
    description: 'Natural language question for the RAG pipeline.',
  })
  question: string;

  @ApiPropertyOptional({ example: 5, description: 'Number of chunks to retrieve.' })
  top_k?: number;
}
