import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET') || 'default-secret';
    
    // Log warning if using default secret in production
    if (process.env.NODE_ENV === 'production' && jwtSecret === 'default-secret') {
      console.error('CRITICAL: Using default JWT_SECRET in production! This will cause authentication failures.');
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          adminProfile: true,
          organisation: true,
          professional: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Admin users can access regardless of status (except SUSPENDED)
      // Other users need to be ACTIVE, VERIFIED, or PENDING_INVITATION
      if (user.status === 'SUSPENDED') {
        throw new UnauthorizedException('Account is suspended');
      }

      if (user.userType !== 'ADMIN') {
        if (
          user.status !== 'ACTIVE' &&
          user.status !== 'VERIFIED' &&
          user.status !== 'PENDING_INVITATION'
        ) {
          throw new UnauthorizedException('Account not verified or active');
        }
      }

      return {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        adminProfile: user.adminProfile,
        organisation: user.organisation,
        professional: user.professional,
      };
    } catch (error) {
      // Log error for debugging
      console.error('JWT validation error:', error);
      throw error;
    }
  }
}
