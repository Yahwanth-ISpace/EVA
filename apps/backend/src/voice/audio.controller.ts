import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('audio')
@Controller('audio')
export class AudioController {
  @Get(':filename')
  @ApiOperation({
    summary: 'Serve static audio file',
    description: 'Streams `public/audio/{filename}` as `audio/mpeg`. Path traversal blocked.',
  })
  @ApiParam({ name: 'filename', example: 'greeting.mp3' })
  @ApiProduces('audio/mpeg')
  serveAudio(@Param('filename') filename: string, @Res() res: Response) {
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new NotFoundException('Invalid filename');
    }
    const audioDir = path.join(process.cwd(), 'public', 'audio');
    const filePath = path.join(audioDir, filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new NotFoundException('Audio file not found');
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.sendFile(path.resolve(filePath));
  }
}
