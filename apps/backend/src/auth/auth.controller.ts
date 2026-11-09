import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  EncryptedLoginDto,
  EncryptedRegisterDto,
  LoginDto,
  RegisterDto,
  type EncryptedCredentialsDto,
} from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { setCsrfCookie } from './cookies';
import { CredentialEncryptionService } from './credential-encryption.service';

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly credentials: CredentialEncryptionService,
  ) {}

  @Public()
  @Get('credential-key')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public key for encrypting login and registration credentials',
    description:
      'Returns an RSA-OAEP-256 SPKI public key. Clients encrypt credentials with a one-time AES-256-GCM key and wrap it with this key.',
  })
  credentialKey() {
    return this.credentials.publicKey();
  }

  @Public()
  @Post('register')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Request an operator account',
    description:
      'Creates a PENDING operator account that an administrator must approve before sign-in. The response is the same whether or not the email is already registered.',
  })
  @ApiResponse({ status: 202, description: 'Request received.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  async register(@Body() body: EncryptedRegisterDto, @Req() req: Request) {
    const dto = await this.decryptInto(RegisterDto, body.credentials);
    return this.authService.register(dto, req);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Login',
    description: 'Decrypts the credential envelope, checks the password and approval status, and sets HttpOnly session cookies.',
  })
  @ApiResponse({ status: 200, description: 'Session cookies set.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  @ApiResponse({ status: 403, description: 'Account awaiting approval or inactive.' })
  async login(
    @Body() body: EncryptedLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = await this.decryptInto(LoginDto, body.credentials, { rememberMe: body.rememberMe });
    return this.authService.login(dto, res, req);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh cookie and issue a new access cookie' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(req, res);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh session and clear cookies' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req, res);
  }

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Return a CSRF token when a refresh cookie is present' })
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.issueCsrf(req, res);
  }

  @Get('session')
  @ApiOperation({ summary: 'Current user from the access cookie' })
  async session(
    @Req() req: Request & { user?: { userId?: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user?.userId;
    if (!userId) return { profileToken: null };
    const result = await this.authService.session(userId);
    setCsrfCookie(res, result.setCsrf);
    return { profileToken: result.profileToken, csrfToken: result.csrfToken };
  }

  private async decryptInto<T extends object>(
    cls: ClassConstructor<T>,
    envelope: EncryptedCredentialsDto,
    extra: Record<string, unknown> = {},
  ): Promise<T> {
    const plain = await this.credentials.decrypt(envelope);
    const dto = plainToInstance(cls, { ...plain, ...extra });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})),
      );
    }
    return dto;
  }
}
