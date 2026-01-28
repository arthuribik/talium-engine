import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '3600';
        // Ensure expiresIn has a unit suffix if it's just a number
        const expiresInFormatted = expiresIn.match(/^\d+$/) ? `${expiresIn}s` : expiresIn;
        return {
          secret: configService.get<string>('JWT_SECRET') || 'default-secret',
          signOptions: {
            expiresIn: expiresInFormatted,
          },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
  ],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class JwtAuthModule {}

