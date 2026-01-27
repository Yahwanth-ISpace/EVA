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
  // Updated to use a supported free tier model (eleven_monolingual_v1 is deprecated)
  private readonly modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5';

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
      // Parse error response properly
      let errorMessage = err.message;
      let errorDetails: any = null;

      if (err.response?.data) {
        // Handle buffer response (convert to string/JSON)
        if (Buffer.isBuffer(err.response.data)) {
          try {
            const errorText = err.response.data.toString('utf-8');
            errorDetails = JSON.parse(errorText);
            errorMessage = errorDetails?.detail?.message || 
                          errorDetails?.detail?.status || 
                          errorDetails?.message || 
                          errorText;
          } catch (parseErr) {
            errorMessage = err.response.data.toString('utf-8');
          }
        } else if (typeof err.response.data === 'object') {
          errorDetails = err.response.data;
          errorMessage = errorDetails?.detail?.message || 
                        errorDetails?.detail?.status || 
                        errorDetails?.message || 
                        JSON.stringify(errorDetails);
        } else {
          errorMessage = err.response.data;
        }
      }

      // Log the full error for debugging
      this.logger.error('ElevenLabs TTS failed:', {
        message: errorMessage,
        status: err.response?.status,
        details: errorDetails,
      });

      throw new HttpException(
        {
          statusCode: err.response?.status || 500,
          message: `ElevenLabs TTS failed: ${errorMessage}`,
          error: 'TTS_FAILED',
          details: errorDetails,
        },
        err.response?.status || 500,
      );
    }
  }
}
