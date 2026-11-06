import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { MongoModule } from '../mongo/mongo.module';
import { JwtStrategy } from './jwt.strategy';
import { AccountApprovalService } from './account-approval.service';
import { CredentialEncryptionService } from './credential-encryption.service';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, jwtSecret } from '../config/jwt-config';

@Module({
  imports: [
    PrismaModule,
    MongoModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: {
          algorithm: JWT_ALGORITHM,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: '15m',
        },
        verifyOptions: {
          algorithms: [JWT_ALGORITHM],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, AccountApprovalService, CredentialEncryptionService],
  controllers: [AuthController],
  exports: [AuthService, AccountApprovalService],
})
export class AuthModule {}
