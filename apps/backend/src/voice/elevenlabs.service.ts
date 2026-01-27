import { Injectable, HttpException, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  private readonly voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  private readonly modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1';

  constructor() {
    if (!this.apiKey) {
      this.logger.warn('ELEVENLABS_API_KEY is not set. Voice synthesis will fail.');
    }
    if (!this.voiceId) {
      this.logger.warn('ELEVENLABS_VOICE_ID is not set. Voice synthesis will fail.');
    }
  }

  /**
   * Synthesize text to speech using ElevenLabs API
   * All voice generation in the application uses this method instead of Twilio's voice
   */
  async synthesize(text: string): Promise<string> {
    if (!this.apiKey || !this.voiceId) {
      throw new HttpException(
        'ElevenLabs API key or Voice ID not configured',
        500,
      );
    }

    if (!text || text.trim().length === 0) {
      throw new HttpException('Text cannot be empty', 400);
    }

    try {
      // Ensure audio directory exists
      const audioDir = path.join(process.cwd(), 'public', 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      const fileName = `eva_${uuidv4()}.mp3`;
      const filePath = path.join(audioDir, fileName);

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        },
      );

      fs.writeFileSync(filePath, response.data);

      const audioUrl = `${process.env.BACKEND_PUBLIC_URL}/audio/${fileName}`;
      this.logger.debug(`Generated audio: ${audioUrl}`);
      
      return audioUrl;
    } catch (err) {
      this.logger.error('ElevenLabs TTS failed:', err.response?.data || err.message);
      throw new HttpException(
        `ElevenLabs TTS failed: ${err.response?.data?.detail?.message || err.message}`,
        500,
      );
    }
  }
}
