import { createHash, createHmac, randomBytes, randomInt } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { jwtSecret } from '../config/jwt-config';
import { secretsEqual } from '../common/security/timing-safe';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 5 * 60 * 1000;
const used = new Map<string, number>();

function prune(now: number) {
  for (const [nonce, exp] of used) {
    if (exp <= now) used.delete(nonce);
  }
}

@Injectable()
export class CaptchaService {
  issue(): { token: string; image: string } {
    const answer = Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const exp = Date.now() + TTL_MS;
    const nonce = randomBytes(16).toString('base64url');
    const answerHash = createHash('sha256').update(answer).digest('base64url');
    const body = Buffer.from(JSON.stringify({ exp, nonce, answerHash })).toString('base64url');
    const sig = createHmac('sha256', jwtSecret()).update(body).digest('base64url');
    return { token: `${body}.${sig}`, image: this.svg(answer) };
  }

  assert(token: string | undefined, answer: string | undefined): void {
    if (!token || !answer?.trim()) throw new BadRequestException('Captcha is required');
    const dot = token.lastIndexOf('.');
    if (dot <= 0) throw new BadRequestException('Captcha is invalid');
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', jwtSecret()).update(body).digest('base64url');
    if (!secretsEqual(sig, expected)) throw new BadRequestException('Captcha is invalid');

    let payload: { exp?: number; nonce?: string; answerHash?: string };
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Captcha is invalid');
    }
    const now = Date.now();
    prune(now);
    if (!payload.exp || !payload.nonce || !payload.answerHash || payload.exp <= now || used.has(payload.nonce)) {
      throw new BadRequestException('Captcha expired');
    }
    const given = createHash('sha256').update(answer.trim().toUpperCase()).digest('base64url');
    if (!secretsEqual(given, payload.answerHash)) {
      throw new BadRequestException('Captcha does not match');
    }
    used.set(payload.nonce, payload.exp);
  }

  private svg(answer: string): string {
    const letters = answer
      .split('')
      .map((ch, i) => {
        const x = 16 + i * 28;
        const y = 34 + randomInt(-4, 5);
        const rot = randomInt(-16, 17);
        return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="monospace" font-size="26" font-weight="700" fill="#1e1b4b">${ch}</text>`;
      })
      .join('');
    const noise = Array.from({ length: 5 }, () => {
      return `<line x1="${randomInt(0, 160)}" y1="${randomInt(0, 52)}" x2="${randomInt(0, 160)}" y2="${randomInt(0, 52)}" stroke="#6366f1" stroke-width="1" opacity="0.65"/>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="52" viewBox="0 0 160 52"><rect width="160" height="52" fill="#eef2ff"/>${noise}${letters}</svg>`;
  }
}
