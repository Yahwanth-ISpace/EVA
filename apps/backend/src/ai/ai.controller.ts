import {
  Body,
  Controller,
  ForbiddenException,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import axios from 'axios';
import { AiAskDto, AiIngestTextDto } from './dto/ai-proxy.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { aiServiceAuthHeaders } from '../common/security/ai-client';

@ApiTags('ai')
@ApiBearerAuth('jwt-auth')
@Controller('ai')
export class AiController {
  private aiBase = process.env.AI_SERVER_URL || 'http://localhost:8000';

  @Post('ingest-text')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Proxy: ingest text into RAG',
    description:
      'ADMIN only. Forwards JSON body to `POST {AI_SERVER_URL}/rag/ingest/text` with the service token. Reserved metadata keys cannot override tenant.',
  })
  @ApiBody({ type: AiIngestTextDto })
  async ingestText(@Body() body: AiIngestTextDto) {
    const metadata = { ...(body.metadata ?? {}) };
    for (const key of ['tenant_id', 'doc_id', 'chunk_id', 'payerId']) {
      delete metadata[key];
    }
    const { data } = await axios.post(
      `${this.aiBase}/rag/ingest/text`,
      { ...body, metadata, payerId: body.payerId },
      { headers: aiServiceAuthHeaders(), timeout: 60_000 },
    );
    return data;
  }

  @Post('ask')
  @ApiOperation({
    summary: 'Proxy: RAG query',
    description:
      'Forwards to `POST {AI_SERVER_URL}/rag/query`. Administrators and operators both pass the payer id for the record they are reviewing.',
  })
  async ask(@Body() body: AiAskDto) {
    const payerId = this.payerIdFor(body.payerId);
    const { data } = await axios.post(
      `${this.aiBase}/rag/query`,
      { ...body, payerId },
      { headers: aiServiceAuthHeaders(), timeout: 60_000 },
    );
    return data;
  }

  private payerIdFor(requested?: string): string {
    if (!requested?.trim()) {
      throw new ForbiddenException('payerId is required');
    }
    return requested.trim();
  }
}
