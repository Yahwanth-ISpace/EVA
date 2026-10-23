// src/auth/auth.service.ts

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Document } from 'mongodb';
import { Role } from '../mongo/enums';
import { MongoService } from '../mongo/mongo.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly mongoService: MongoService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const users = await this.mongoService.collection('User');
    const existingUser = await users.findOne({ email: dto.email });

    if (existingUser) {
      throw new BadRequestException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const role: Role = dto.role ? (dto.role as Role) : Role.OPERATOR;

    const created = {
      email: dto.email,
      password: hashedPassword,
      role,
      dob: dto.dob ? new Date(dto.dob) : null,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
    };
    const userResult = await users.insertOne(created);

    const payee =
      role === Role.OPERATOR
        ? await (async () => {
            const newPayee = {
              firstName: dto.firstName,
              lastName: dto.lastName,
              dob: dto.dob ? new Date(dto.dob) : null,
              ssn: null,
              userId: userResult.insertedId,
              payerId: null,
            };
            const result = await (
              await this.mongoService.collection('Payee')
            ).insertOne(newPayee);
            return {
              ...newPayee,
              _id: result.insertedId,
              id: String(result.insertedId),
            };
          })()
        : null;

    const user = this.mongoService.withIds({
      ...created,
      _id: userResult.insertedId,
      id: String(userResult.insertedId),
      payee,
    }) as Document & { id: string; payee: (Document & { id: string }) | null };

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
    const found = await (await this.mongoService.collection('User')).findOne({
      email: dto.email,
    });
    const foundPayee = found
      ? await (await this.mongoService.collection('Payee')).findOne({
          userId: found._id,
        })
      : null;
    const payee = foundPayee
      ? {
          ...foundPayee,
          _id: String(foundPayee._id),
          id: String(foundPayee._id),
        }
      : null;
    const user: (Document & {
      id: string;
      email: string;
      password: string;
      role: Role;
      firstName: string | null;
      lastName: string | null;
      dob: Date | null;
      payee: (Document & { id: string }) | null;
    }) | null = found
      ? {
          ...found,
          _id: String(found._id),
          email: found.email,
          password: found.password,
          role: found.role as Role,
          firstName: found.firstName ?? null,
          lastName: found.lastName ?? null,
          dob: found.dob ?? null,
          payee,
          id: String(found._id),
        }
      : null;

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
    const user = await (await this.mongoService.collection('User')).findOne(
      this.mongoService.idFilter(userId),
    );
    return user ? this.mongoService.withIds(user) : null;
  }
}