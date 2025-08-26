import { Body, Controller, Post } from '@nestjs/common';
import axios from 'axios';

@Controller('ai')
export class AiController {
  private aiBase = process.env.AI_SERVER_URL || 'http://localhost:8001';

  @Post('ingest-text')
  async ingestText(@Body() body: any) {
    const { data } = await axios.post(`${this.aiBase}/ingest/text`, body);
    return data;
  }

  @Post('ask')
  async ask(@Body() body: { tenant_id?: string; question: string; top_k?: number }) {
    const { data } = await axios.post(`${this.aiBase}/query`, body);
    return data;
  }
}
