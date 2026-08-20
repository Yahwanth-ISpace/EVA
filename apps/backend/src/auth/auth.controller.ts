// src/auth/auth.controller.ts

import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates ADMIN or OPERATOR user. OPERATOR requires `payer` object and typically `dob` / `ssn`. Returns JWT on success.',
  })
  @ApiResponse({ status: 201, description: 'User created; returns tokens and user payload.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login',
    description:
      'Returns `access_token` (JWT). Use **Authorize** → **jwt-auth** in Swagger with `Bearer <token>`.',
  })
  @ApiResponse({
    status: 200,
    description: 'JWT access_token and user info.',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: { id: '...', email: 'patient@example.com', role: 'OPERATOR' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
