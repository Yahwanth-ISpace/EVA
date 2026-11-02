import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { setCsrfCookie } from './cookies';

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates an OPERATOR account from email, password, and full name. Patient records are linked by an administrator. Role cannot be chosen here.',
  })
  @ApiResponse({ status: 201, description: 'User created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Login',
    description:
      'Checks the password and sets HttpOnly session cookies.',
  })
  @ApiResponse({ status: 200, description: 'Session cookies set.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res);
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
    if (!userId) return { user: null };
    const result = await this.authService.session(userId);
    setCsrfCookie(res, result.setCsrf);
    return { user: result.user, csrfToken: result.csrfToken };
  }
}
