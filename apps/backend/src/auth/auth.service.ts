// src/auth/auth.service.ts

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const role = dto.role || 'OPERATOR';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role,
        dob: dto.dob ? new Date(dto.dob) : null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        payee:
          role === 'OPERATOR'
            ? {
                create: {
                  firstName: dto.firstName,
                  lastName: dto.lastName,
                  dob: dto.dob ? new Date(dto.dob) : null,
                },
              }
            : undefined,
      },
      include: {
        payee: true,
      },
    });

    return {
      message: 'User registered successfully',
      user: {
        id: user.id,
        firstName:
          user.role === 'OPERATOR' ? user.payee?.firstName : user.firstName,
        lastName: user.role === 'OPERATOR' ? user.payee?.lastName : user.lastName,
        email: user.email,
        dob: user.dob,
        role: user.role,
        payeeId: user.payee?.id,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { payee: true }, // we include it, but conditionally expose it
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    // Prepare the token payload (clean and lean)
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      dob: user.dob ?? user.payee?.dob,
    });

    // Return cleaned response
    return {
      access_token: token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        dob: user.dob ?? user.payee?.dob,
        email: user.email,
        role: user.role,
        ...(user.role === 'OPERATOR' &&
          user.payee?.id && { payeeId: user.payee.id }),
        ...(user.role === 'OPERATOR' && { payee: user.payee }),
      },
    };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}
