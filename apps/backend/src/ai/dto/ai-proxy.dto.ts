import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

/** Body for `POST /ai/ingest-text` — forwarded to external RAG (`AI_SERVER_URL`). */
export class AiIngestTextDto {
  @ApiProperty()
  @IsString()
  text: string;

  @ApiProperty()
  @IsString()
  payerId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenant_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doc_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/** Body for `POST /ai/ask` — RAG query. */
export class AiAskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenant_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payerId?: string;

  @ApiProperty()
  @IsString()
  question: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  top_k?: number;

  @ApiPropertyOptional()
  @IsOptional()
  min_score?: number;
}
