// src/auth/auth.service.ts

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '../prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const db = await this.prisma.client();
    const existingUser = await db.orm.User.where({ email: dto.email }).first();

    if (existingUser) {
      throw new BadRequestException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const role: Role = dto.role ? (dto.role as Role) : Role.OPERATOR;

    const created = await db.orm.User.create({
      email: dto.email,
      password: hashedPassword,
      role,
      dob: dto.dob ? new Date(dto.dob) : null,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
    });

    const payee =
      role === Role.OPERATOR
        ? await db.orm.Payee.create({
            firstName: dto.firstName,
            lastName: dto.lastName,
            dob: dto.dob ? new Date(dto.dob) : null,
            ssn: null,
            userId: created._id,
            payerId: null,
          })
        : null;

    const user = this.prisma.withIds({ ...created, payee });

    return {
      message: 'User registered successfully',
      user: {
        id: user.id,

        firstName:
          user.role === Role.OPERATOR
            ? user.payee?.firstName
            : user.firstName,

        lastName:
          user.role === Role.OPERATOR
            ? user.payee?.lastName
            : user.lastName,

        email: user.email,
        dob: user.dob,
        role: user.role,
        payeeId: user.payee?.id,
      },
    };
  }

  async login(dto: LoginDto) {
    const db = await this.prisma.client();
    const found = await db.orm.User.where({ email: dto.email })
      .include('payee')
      .first();
    const user = found ? this.prisma.withIds(found) : null;

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      dob: user.dob ?? user.payee?.dob,
    });

    return {
      access_token: token,

      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        dob: user.dob ?? user.payee?.dob,
        email: user.email,
        role: user.role,

        ...(user.role === Role.OPERATOR &&
          user.payee?.id && {
            payeeId: user.payee.id,
          }),

        ...(user.role === Role.OPERATOR && {
          payee: user.payee,
        }),
      },
    };
  }

  async validateUser(userId: string) {
    const db = await this.prisma.client();
    const user = await db.orm.User.where({ _id: userId }).first();
    return user ? this.prisma.withIds(user) : null;
  }
}