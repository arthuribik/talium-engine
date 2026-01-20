import { Injectable, ConflictException, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Validate passwords match
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Hash provided password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Generate verification token
    const verificationToken = this.generateToken();
    const verificationExpiry = new Date();
    verificationExpiry.setHours(verificationExpiry.getHours() + 24);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phoneNumber: registerDto.phoneNumber,
        userType: 'PROFESSIONAL',
        status: 'UNVERIFIED',
        emailVerifyToken: verificationToken,
        emailVerifyExpiry: verificationExpiry,
      },
    });

    // Create professional profile
    await this.prisma.professional.create({
      data: {
        userId: user.id,
        country: registerDto.country,
      },
    });

    // TODO: Send verification email with token
    console.log(`Verification token: ${verificationToken}`);

    return {
      status: 'success',
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  async createBusiness(createBusinessDto: CreateBusinessDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createBusinessDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Validate passwords match
    if (createBusinessDto.password !== createBusinessDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Hash provided password
    const hashedPassword = await bcrypt.hash(createBusinessDto.password, 10);

    // Generate verification token
    const verificationToken = this.generateToken();
    const verificationExpiry = new Date();
    verificationExpiry.setHours(verificationExpiry.getHours() + 24);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: createBusinessDto.email,
        password: hashedPassword,
        firstName: createBusinessDto.firstName,
        lastName: createBusinessDto.lastName,
        phoneNumber: createBusinessDto.phoneNumber,
        userType: 'ORGANISATION',
        status: 'UNVERIFIED',
        emailVerifyToken: verificationToken,
        emailVerifyExpiry: verificationExpiry,
      },
    });

    // Create organisation
    await this.prisma.organisation.create({
      data: {
        userId: user.id,
        companyName: createBusinessDto.companyName,
        country: createBusinessDto.country,
        isRegistered: false,
      },
    });

    // TODO: Send verification email with token
    console.log(`Verification token: ${verificationToken}`);

    return {
      status: 'success',
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        adminProfile: true,
        organisation: true,
        professional: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Allow admins to login even if email not verified (for initial setup)
    if (!user.emailVerified && user.userType !== 'ADMIN') {
      throw new ForbiddenException('Account not verified. Please check your email.');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account is suspended');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('REFRESH_TOKEN_SECRET') || 'refresh-secret',
      expiresIn: this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '7d',
    });

    return {
      status: 'success',
      token: accessToken,
      refreshToken,
      requiresPasswordChange: user.firstLogin,
      requires2FA: user.twoFactorEnabled,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        adminRole: user.adminProfile?.role,
        organisationId: user.organisation?.id,
        professionalId: user.professional?.id,
      },
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    if (!user) {
      // Don't reveal if email exists
      return {
        status: 'success',
        message: 'If the email exists, a password reset link has been sent.',
      };
    }

    const resetToken = this.generateToken();
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // TODO: Send reset email
    console.log(`Reset token: ${resetToken}`);

    return {
      status: 'success',
      message: 'If the email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    if (resetPasswordDto.password !== resetPasswordDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: resetPasswordDto.token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(resetPasswordDto.password, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        firstLogin: false,
      },
    });

    // TODO: Send confirmation email

    return {
      status: 'success',
      message: 'Password reset successfully',
    };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: 'VERIFIED',
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    return {
      status: 'success',
      message: 'Email verified successfully',
    };
  }

  private generateRandomPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$!%*?&';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  private generateToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

