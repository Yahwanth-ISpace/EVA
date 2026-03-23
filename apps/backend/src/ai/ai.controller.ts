import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import axios from 'axios';
import { AiAskDto, AiIngestTextDto } from './dto/ai-proxy.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  private aiBase = process.env.AI_SERVER_URL || 'http://localhost:8001';

  @Post('ingest-text')
  @ApiOperation({
    summary: 'Proxy: ingest text into RAG',
    description:
      'Forwards JSON body to `POST {AI_SERVER_URL}/rag/ingest/text`. Set `AI_SERVER_URL` (default `http://localhost:8001`).',
  })
  @ApiBody({ type: AiIngestTextDto })
  async ingestText(@Body() body: AiIngestTextDto) {
    const { data } = await axios.post(`${this.aiBase}/rag/ingest/text`, body);
    return data;
  }

  @Post('ask')
  @ApiOperation({
    summary: 'Proxy: RAG query',
    description: 'Forwards to `POST {AI_SERVER_URL}/rag/query`.',
  })
  async ask(@Body() body: AiAskDto) {
    const { data } = await axios.post(`${this.aiBase}/rag/query`, body);
    return data;
  }
}
