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
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  async validate(payload: any) {
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
      if (user.status !== 'ACTIVE' && user.status !== 'VERIFIED' && user.status !== 'PENDING_INVITATION') {
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
  }
}

