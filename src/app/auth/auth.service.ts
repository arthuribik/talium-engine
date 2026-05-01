import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RegistrationStepDto } from './dto/registration-step-unified.dto';
import { FinalizeRegistrationDto } from './dto/finalize-registration.dto';
import { ResendEntity } from '../../utility/mail';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

export enum AuthServiceEvents {
  SEND_VERIFICATION_EMAIL = 'send_verification_email',
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailer: ResendEntity,
    private eventEmitter: EventEmitter2,
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

    const emailKey = registerDto.email.trim().toLowerCase();
    const preSignupEmailVerified =
      this.emailVerificationCodes.get(emailKey)?.verified === true;

    // Generate verification token (only if email was not already verified via /join OTP flow)
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
        status: preSignupEmailVerified ? 'VERIFIED' : 'UNVERIFIED',
        emailVerified: preSignupEmailVerified,
        emailVerifyToken: preSignupEmailVerified ? null : verificationToken,
        emailVerifyExpiry: preSignupEmailVerified ? null : verificationExpiry,
      },
    });

    if (preSignupEmailVerified) {
      this.emailVerificationCodes.delete(emailKey);
    }

    // Create professional profile
    await this.prisma.professional.create({
      data: {
        userId: user.id,
        country: registerDto.country,
        profession: registerDto.profession?.trim() || undefined,
      },
    });

    if (!preSignupEmailVerified) {
      const html = `
      <h2>Welcome to taldium, ${user.firstName}!</h2>
      <p>Thank you for registering. Please verify your email by entering this OTP (One Time Password).:</p>
      <p><strong>${verificationToken}</strong></p>
      <p>This OTP will expire in 24 hours.</p>
    `;

      this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
        to: user.email,
        subject: 'Verify your email',
        html: html,
      });
    }

    return {
      status: 'success',
      message: preSignupEmailVerified
        ? 'Registration successful. Your email is verified — you can sign in.'
        : 'Registration successful. Please check your email to verify your account.',
    };
  }

  async createBusiness(createBusinessDto: CreateBusinessDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createBusinessDto.email },
      include: {
        organisation: {
          include: {
            user: true,
          },
        },
      },
    });

    if (existingUser) {
      // Check if this is a registration in progress that can be finalized
      if (existingUser.organisation) {
        const isTempEmail = existingUser.email.includes('@registration.temp');
        const isPendingRegistration = existingUser.organisation.companyName === 'Pending Registration';
        
        // If it's a registration in progress, suggest using finalize endpoint
        if (isTempEmail || isPendingRegistration) {
          throw new ConflictException(
            'This email is part of a registration in progress. Please continue your registration or use the finalize endpoint to complete it.'
          );
        }
      }
      
      // Check if this is a registration in progress
      let stepInfo = '';
      if (existingUser.organisation) {
        const currentStep = this.calculateCurrentStep(existingUser.organisation);
        const stepLabels: { [key: number]: string } = {
          1: 'Registration Status',
          2: 'Incorporation Details',
          3: 'Category',
          4: 'Organisation Details',
          5: 'Email Verification',
          6: 'Preview',
          7: 'Organisation Details',
          8: 'Category',
        };
        stepInfo = ` The email was created during the "${stepLabels[currentStep] || `Step ${currentStep}`}" step of the registration process.`;
      } else if (existingUser.userType === 'ORGANISATION') {
        stepInfo = ' The email belongs to an existing organisation account.';
      } else if (existingUser.userType === 'PROFESSIONAL') {
        stepInfo = ' The email belongs to an existing professional account.';
      } else {
        stepInfo = ' The email belongs to an existing account.';
      }
      throw new ConflictException(`Email already exists.${stepInfo}`);
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

    const html = `
      <h2>Welcome to taldium, ${user.firstName}!</h2>
      <p>Thank you for registering. Please verify your email by entering the OTP (One Time Password).:</p>
      <p><strong>${verificationToken}</strong></p>
      <p>This OTP will expire in 24 hours.</p>
    `;

    this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
      to: user.email,
      subject: 'Verify your email',
      html: html,
    });

    return {
      status: 'success',
      message:
        'Registration successful. Please check your email to verify your account.',
    };
  }

  async finalizeRegistration(finalizeDto: FinalizeRegistrationDto) {
    const { registrationId, password, confirmPassword } = finalizeDto;

    // Validate passwords match
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Find the organisation and user
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: registrationId },
      include: { user: true },
    });

    if (!organisation) {
      throw new NotFoundException('Registration not found');
    }

    if (!organisation.user) {
      throw new NotFoundException('User not found for this registration');
    }

    // Check if this is a registration in progress
    // A registration is in progress if:
    // 1. User status is UNVERIFIED (not yet activated)
    // 2. OR user has a temp email
    // 3. OR organisation setup is not completed
    const isTempEmail = organisation.user.email.includes('@registration.temp');
    const isUnverified = organisation.user.status === 'UNVERIFIED';
    const setupNotCompleted = !organisation.setupCompleted;
    
    // Check if password was already set by user (not the auto-generated one)
    // If user has a real email (not temp) and status is still UNVERIFIED, it's likely in progress
    const isInProgress = isTempEmail || (isUnverified && setupNotCompleted);
    
    if (!isInProgress) {
      // Check if user already has a proper account (verified or active status)
      if (organisation.user.status === 'VERIFIED' || organisation.user.status === 'ACTIVE') {
        throw new BadRequestException('This registration has already been finalized. Please log in with your credentials.');
      }
      throw new BadRequestException('This registration cannot be finalized. Please contact support.');
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user with password and finalize
    await this.prisma.user.update({
      where: { id: organisation.userId },
      data: {
        password: hashedPassword,
        firstName: finalizeDto.firstName || organisation.user.firstName,
        lastName: finalizeDto.lastName || organisation.user.lastName,
        status: 'VERIFIED', // Mark as verified after finalization
        emailVerified: true, // Mark email as verified
        firstLogin: false,
        // Email and phoneNumber should already be set from step 5
      },
    });

    // Update organisation to mark as finalized
    const orgName = finalizeDto.companyName || organisation.companyName;
    await this.prisma.organisation.update({
      where: { id: organisation.id },
      data: {
        companyName: orgName !== 'Pending Registration' ? orgName : organisation.companyName,
        setupCompleted: true, // Mark setup as completed
      },
    });

    return {
      status: 'success',
      message: 'Registration finalized successfully. You can now log in.',
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

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account is suspended');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
    };

    const expiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '30d';
    const expiresInFormatted = expiresIn.match(/^\d+$/)
      ? `${expiresIn}s`
      : expiresIn;
    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') || 'default-secret';

    if (!jwtSecret || jwtSecret === 'default-secret') {
      console.warn(
        'WARNING: Using default JWT_SECRET. This should be changed in production!',
      );
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: expiresInFormatted,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('REFRESH_TOKEN_SECRET') ||
        'refresh-secret',
      expiresIn:
        this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '60d',
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

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Refresh token is required');
    }
    const refreshSecret =
      this.configService.get<string>('REFRESH_TOKEN_SECRET') || 'refresh-secret';
    const refreshExpiresIn =
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '60d';
    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') || 'default-secret';
    const expiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '30d';
    const expiresInFormatted = expiresIn.match(/^\d+$/) ? `${expiresIn}s` : expiresIn;

    let payload: { sub: string; email: string; userType: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

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
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account is suspended');
    }

    const newPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
    };
    const accessToken = this.jwtService.sign(newPayload, {
      secret: jwtSecret,
      expiresIn: expiresInFormatted,
    });
    const newRefreshToken = this.jwtService.sign(newPayload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn.match(/^\d+$/) ? `${refreshExpiresIn}s` : refreshExpiresIn,
    });

    return {
      status: 'success',
      token: accessToken,
      refreshToken: newRefreshToken,
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
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/login?token=${encodeURIComponent(resetToken)}`;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    const html = `
      <h2>Hello ${user.firstName}!</h2>
      <p>We got a request to reset your account password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>If the button does not work, open this URL in your browser:</p>
      <p>${resetUrl}</p>
      <p>You can also enter this reset code on the login page:</p>
      <p><strong>${resetToken}</strong></p>
      <p>This reset link will expire in 1 hour.</p>
      <p>If you did not request a password reset, please ignore this email.</p>
    `;

    this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
      to: user.email,
      subject: 'Reset your password',
      html: html,
    });

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

    const html = `
      <h2>Hello ${user.firstName}!</h2>
      <p>Your password has been reset successfully. If you did not perform this action, please contact our support immediately.</p>
    `;

    this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
      to: user.email,
      subject: 'Password reset successful',
      html: html,
    });

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

  // Verify email with code for registration flow
  async verifyEmailWithCode(
    email: string,
    code: string,
  ): Promise<{ status: string; message: string; verified: boolean }> {
    // In a real implementation, you would:
    // 1. Check if a verification code was sent to this email
    // 2. Verify the code matches and hasn't expired
    // 3. Mark the email as verified in the registration store

    // For now, we'll use a simple in-memory store for verification codes
    // In production, this should be stored in a database or cache (Redis)
    const storedCode = this.emailVerificationCodes.get(email.toLowerCase());

    if (!storedCode) {
      throw new BadRequestException(
        'No verification code found for this email. Please request a new code.',
      );
    }

    if (storedCode.code !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (storedCode.expiresAt < new Date()) {
      this.emailVerificationCodes.delete(email.toLowerCase());
      throw new BadRequestException(
        'Verification code has expired. Please request a new code.',
      );
    }

    // Mark as verified
    this.emailVerificationCodes.set(email.toLowerCase(), {
      ...storedCode,
      verified: true,
    });

    return {
      status: 'success',
      message: 'Email verified successfully',
      verified: true,
    };
  }

  // Send verification code to email (for registration)
  async sendVerificationCode(
    email: string,
  ): Promise<{ status: string; message: string; code?: string }> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Verification code: ${code}`);

    // Store code with expiration (10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    this.emailVerificationCodes.set(email.toLowerCase(), {
      code,
      email: email.toLowerCase(),
      expiresAt,
      verified: false,
      createdAt: new Date(),
    });

    // TODO: Send email with verification code
    // In production, use an email service (SendGrid, AWS SES, etc.)
    console.log(`Verification code for ${email}: ${code}`);
    const html = `
      <h2>Welcome to taldium!</h2> 
      <p>Thank you for registering. Please verify your email by entering this OTP (One Time Password):</p>
      <p><strong>${code}</strong></p>
      <p>This OTP will expire in 10 minutes.</p>
    `;

    this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
      to: email.toLowerCase(),
      subject: 'Verify your email',
      html: html,
    });

    return {
      status: 'success',
      message: 'Verification code sent to email',
      // In development, return the code for testing. Remove in production
      code: process.env.NODE_ENV === 'development' ? code : undefined,
    };
  }

  // In-memory store for email verification codes
  // In production, use Redis or database
  private emailVerificationCodes: Map<
    string,
    {
      code: string;
      email: string;
      expiresAt: Date;
      verified: boolean;
      createdAt: Date;
    }
  > = new Map();

  private generateRandomPassword(): string {
    const length = 12;
    const charset =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$!%*?&';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  private generateToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  // In-memory store for registration progress
  // In production, this should be stored in a database table
  private registrationStore: Map<string, any> = new Map();

  // Unified method to save any registration step
  async saveRegistrationStep(
    dto: RegistrationStepDto,
  ): Promise<{ id: string; step: number; data: any }> {
    const { step, id, ...data } = dto;

    // Determine registration ID (use Organisation ID if provided, otherwise generate)
    let registrationId = id;
    let organisation: any = null;

    // If ID is provided, try to find existing organisation
    if (registrationId) {
      organisation = await this.prisma.organisation.findUnique({
        where: { id: registrationId },
        include: { user: true },
      });
    }

    // If ID not provided or organisation doesn't exist, create a new one
    if (!organisation) {
      // Create a temporary user and organisation for the registration
      const tempEmail = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@registration.temp`;
      const tempPassword = await bcrypt.hash(this.generateRandomPassword(), 10);

      const user = await this.prisma.user.create({
        data: {
          email: tempEmail,
          password: tempPassword,
          firstName: 'Temp',
          lastName: 'User',
          userType: 'ORGANISATION',
          status: 'UNVERIFIED',
          emailVerified: false,
        },
      });

      organisation = await this.prisma.organisation.create({
        data: {
          userId: user.id,
          companyName: 'Pending Registration',
          country: 'Unknown',
          isRegistered: false,
        },
      });

      registrationId = organisation.id;
    }

    // Prepare update data based on step
    const updateData: any = {};

    switch (step) {
      case 1:
        updateData.isRegistered = data.isRegistered;
        break;
      case 2:
        if (data.legalName) updateData.companyName = data.legalName;
        if (data.countryOfIncorporation)
          updateData.countryOfIncorporation = data.countryOfIncorporation;
        if (data.incorporationNumber)
          updateData.incorporationNumber = data.incorporationNumber;
        if (data.countryOfIncorporation)
          updateData.country = data.countryOfIncorporation;
        break;
      case 3:
        // Category data - store in description as JSON
        // Need to preserve any existing text description
        let existingCategoryData = {};
        let existingTextDescription = '';
        
        if (organisation.description) {
          try {
            // Try to parse as JSON first
            if (organisation.description.trim().startsWith('{')) {
              const parsed = JSON.parse(organisation.description);
              // Check if it has category data or is just text
              if (parsed.category || parsed.schoolType || parsed.religiousOrgType) {
                existingCategoryData = parsed;
              } else {
                // It's a text description, preserve it
                existingTextDescription = organisation.description;
              }
            } else {
              // It's a plain text description
              existingTextDescription = organisation.description;
            }
          } catch (e) {
            // Not valid JSON, treat as text description
            existingTextDescription = organisation.description;
          }
        }
        
        // Merge category data
        const categoryData = {
          ...existingCategoryData,
          category: data.category,
          schoolType: data.schoolType,
          religiousOrgType: data.religiousOrgType,
          internationalOrgType: data.internationalOrgType,
          politicalPartyCountry: data.politicalPartyCountry,
          associatedSchool: data.associatedSchool,
        };
        
        // Store both category data and text description
        updateData.description = JSON.stringify({
          ...categoryData,
          textDescription: existingTextDescription,
        });
        break;
      case 4:
        // Preserve category data when updating description
        let categoryDataToPreserve = {};
        if (organisation.description) {
          try {
            if (organisation.description.trim().startsWith('{')) {
              const parsed = JSON.parse(organisation.description);
              // Extract category data if it exists
              if (parsed.category || parsed.schoolType || parsed.religiousOrgType) {
                categoryDataToPreserve = {
                  category: parsed.category,
                  schoolType: parsed.schoolType,
                  religiousOrgType: parsed.religiousOrgType,
                  internationalOrgType: parsed.internationalOrgType,
                  politicalPartyCountry: parsed.politicalPartyCountry,
                  associatedSchool: parsed.associatedSchool,
                };
              }
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
        
        // Update description - preserve category data if it exists
        if (data.description) {
          if (Object.keys(categoryDataToPreserve).length > 0) {
            updateData.description = JSON.stringify({
              ...categoryDataToPreserve,
              textDescription: data.description,
            });
          } else {
            updateData.description = data.description;
          }
        }
        
        if (data.otherName) updateData.companyName = data.otherName;
        if (data.industry) updateData.industry = data.industry;
        if (data.headquartersCity || data.headquartersCountry) {
          updateData.address = {
            city: data.headquartersCity,
            country: data.headquartersCountry,
          };
        }
        if (data.foundedDate) {
          const year = new Date(data.foundedDate).getFullYear();
          updateData.yearOfCommencement = year;
        }
        if (data.address) {
          updateData.address = data.address;
        }
        break;
      case 5:
        // Update user email and phone number if provided
        if (organisation.user) {
          const userUpdateData: any = {};
          if (data.organisationEmail) {
            userUpdateData.email = data.organisationEmail;
          }
          if (data.phoneNumber) {
            userUpdateData.phoneNumber = data.phoneNumber;
          }
          
          if (Object.keys(userUpdateData).length > 0) {
            await this.prisma.user.update({
              where: { id: organisation.userId },
              data: userUpdateData,
            });
            // Refresh organisation to get updated user data
            organisation = await this.prisma.organisation.findUnique({
              where: { id: organisation.id },
              include: { user: true },
            });
          }
        }
        break;
      case 7:
        if (data.organisationName)
          updateData.companyName = data.organisationName;
        if (data.organisationCountry)
          updateData.country = data.organisationCountry;
        if (data.description) updateData.description = data.description;
        if (data.industry) updateData.industry = data.industry;
        if (data.foundedDate) {
          const year = new Date(data.foundedDate).getFullYear();
          updateData.yearOfCommencement = year;
        }
        if (data.address) {
          updateData.address = data.address;
        }
        break;
      case 8:
        // Category data for non-registered
        // Need to preserve any existing text description
        let existingCategoryData8 = {};
        let existingTextDescription8 = '';
        
        if (organisation.description) {
          try {
            // Try to parse as JSON first
            if (organisation.description.trim().startsWith('{')) {
              const parsed = JSON.parse(organisation.description);
              // Check if it has category data or is just text
              if (parsed.category || parsed.schoolType || parsed.religiousOrgType) {
                existingCategoryData8 = parsed;
                // Preserve text description if it exists
                if (parsed.textDescription) {
                  existingTextDescription8 = parsed.textDescription;
                }
              } else {
                // It's a text description, preserve it
                existingTextDescription8 = organisation.description;
              }
            } else {
              // It's a plain text description
              existingTextDescription8 = organisation.description;
            }
          } catch (e) {
            // Not valid JSON, treat as text description
            existingTextDescription8 = organisation.description;
          }
        }
        
        // Merge category data
        const categoryData8 = {
          ...existingCategoryData8,
          category: data.category,
          schoolType: data.schoolType,
          religiousOrgType: data.religiousOrgType,
          internationalOrgType: data.internationalOrgType,
          politicalPartyCountry: data.politicalPartyCountry,
          associatedSchool: data.associatedSchool,
        };
        
        // Store both category data and text description
        updateData.description = JSON.stringify({
          ...categoryData8,
          textDescription: existingTextDescription8,
        });
        break;
      default:
        throw new BadRequestException(`Invalid step number: ${step}`);
    }

    // Update organisation with step data
    if (Object.keys(updateData).length > 0) {
      organisation = await this.prisma.organisation.update({
        where: { id: organisation.id },
        data: updateData,
        include: { user: true },
      });
    } else if (step === 5) {
      // For step 5, refresh organisation even if no updateData (email was updated separately)
      organisation = await this.prisma.organisation.findUnique({
        where: { id: organisation.id },
        include: { user: true },
      });
    }

    // Calculate profile completeness
    let completeness = 0;
    if (
      organisation.companyName &&
      organisation.companyName !== 'Pending Registration'
    )
      completeness += 20;
    if (organisation.country && organisation.country !== 'Unknown')
      completeness += 10;
    if (organisation.isRegistered !== null) completeness += 10;
    if (organisation.description) completeness += 15;
    if (organisation.industry) completeness += 10;
    if (organisation.address) completeness += 10;
    if (organisation.yearOfCommencement) completeness += 10;
    if (organisation.countryOfIncorporation) completeness += 10;
    if (organisation.incorporationNumber) completeness += 5;

    await this.prisma.organisation.update({
      where: { id: organisation.id },
      data: { profileCompleteness: completeness },
    });

    // Prepare response data
    let stepData: any = {};
    switch (step) {
      case 1:
        stepData = { isRegistered: organisation.isRegistered };
        break;
      case 2:
        stepData = {
          legalName: organisation.companyName,
          countryOfIncorporation: organisation.countryOfIncorporation,
          incorporationNumber: organisation.incorporationNumber,
        };
        break;
      case 3:
      case 8:
        let desc: any = {};
        if (organisation.description) {
          try {
            if (organisation.description.trim().startsWith('{')) {
              desc = JSON.parse(organisation.description || '{}');
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
        stepData = {
          category: desc.category,
          schoolType: desc.schoolType,
          religiousOrgType: desc.religiousOrgType,
          internationalOrgType: desc.internationalOrgType,
          politicalPartyCountry: desc.politicalPartyCountry,
          associatedSchool: desc.associatedSchool,
        };
        break;
      case 4:
        // Extract text description from JSON if it exists
        let textDescription = organisation.description;
        if (organisation.description) {
          try {
            if (organisation.description.trim().startsWith('{')) {
              const parsed = JSON.parse(organisation.description);
              textDescription = parsed.textDescription || organisation.description;
            }
          } catch (e) {
            // Not JSON, use as is
          }
        }
        stepData = {
          description: textDescription,
          industry: organisation.industry,
          headquartersCity: organisation.address?.city,
          headquartersCountry: organisation.address?.country,
          foundedDate: organisation.yearOfCommencement
            ? `${organisation.yearOfCommencement}-01-01`
            : null,
          address: organisation.address,
        };
        break;
      case 5:
        const user = await this.prisma.user.findUnique({
          where: { id: organisation.userId },
        });
        stepData = {
          organisationEmail: user?.email,
          phoneNumber: user?.phoneNumber,
        };
        break;
      case 7:
        // Extract text description from JSON if it exists
        let textDescription7 = organisation.description;
        if (organisation.description) {
          try {
            if (organisation.description.trim().startsWith('{')) {
              const parsed = JSON.parse(organisation.description);
              textDescription7 = parsed.textDescription || organisation.description;
            }
          } catch (e) {
            // Not JSON, use as is
          }
        }
        stepData = {
          organisationName: organisation.companyName,
          organisationCountry: organisation.country,
          description: textDescription7,
          industry: organisation.industry,
          foundedDate: organisation.yearOfCommencement
            ? `${organisation.yearOfCommencement}-01-01`
            : null,
          address: organisation.address,
        };
        break;
    }

    return {
      id: organisation.id,
      step,
      data: stepData,
    };
  }

  // Get registration progress
  async getRegistration(registrationId: string): Promise<any> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: registrationId },
      include: { user: true },
    });

    if (!organisation) {
      throw new NotFoundException('Registration not found');
    }

    // Parse description if it contains JSON data
    let categoryData = {};
    let textDescription = null;
    if (organisation.description) {
      try {
        if (organisation.description.trim().startsWith('{')) {
          const parsed = JSON.parse(organisation.description);
          if (parsed.category || parsed.schoolType || parsed.religiousOrgType) {
            categoryData = parsed;
            textDescription = parsed.textDescription || null;
          } else {
            textDescription = organisation.description;
          }
        } else {
          textDescription = organisation.description;
        }
      } catch (e) {
        // Not JSON, use as regular description
        textDescription = organisation.description;
      }
    }

    return {
      id: organisation.id,
      step1: { isRegistered: organisation.isRegistered },
      step2: {
        legalName: organisation.companyName,
        countryOfIncorporation: organisation.countryOfIncorporation,
        incorporationNumber: organisation.incorporationNumber,
      },
      step3: categoryData,
      step4: {
        description: textDescription,
        industry: organisation.industry,
        headquartersCity: (organisation.address as any)?.city,
        headquartersCountry: (organisation.address as any)?.country,
        foundedDate: organisation.yearOfCommencement
          ? `${organisation.yearOfCommencement}-01-01`
          : null,
        address: organisation.address,
      },
      step5: {
        organisationEmail: organisation.user?.email,
        phoneNumber: organisation.user?.phoneNumber,
      },
      step7: {
        organisationName: organisation.companyName,
        organisationCountry: organisation.country,
        description: textDescription,
        industry: organisation.industry,
        foundedDate: organisation.yearOfCommencement
          ? `${organisation.yearOfCommencement}-01-01`
          : null,
        address: organisation.address,
      },
      step8: categoryData,
      currentStep: this.calculateCurrentStep(organisation),
      profileCompleteness: organisation.profileCompleteness,
      updatedAt: organisation.updatedAt,
    };
  }

  private calculateCurrentStep(organisation: any): number {
    if (
      !organisation.isRegistered &&
      organisation.companyName &&
      organisation.companyName !== 'Pending Registration'
    ) {
      return 8;
    }
    if (
      organisation.user?.email &&
      !organisation.user.email.includes('@registration.temp')
    ) {
      return 5;
    }
    if (
      organisation.description &&
      typeof organisation.description === 'string' &&
      organisation.description.startsWith('{')
    ) {
      return organisation.isRegistered ? 3 : 8;
    }
    if (organisation.industry || organisation.address) {
      return 4;
    }
    if (
      organisation.countryOfIncorporation ||
      organisation.incorporationNumber
    ) {
      return 2;
    }
    return 1;
  }

  private generateRegistrationId(): string {
    return `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get all registrations (for admin)
  async getAllRegistrations(): Promise<
    Array<{ id: string; [key: string]: any }>
  > {
    const organisations = await this.prisma.organisation.findMany({
      include: { user: true },
      orderBy: { updatedAt: 'desc' },
    });

    return organisations.map((org) => {
      let categoryData = {};
      if (org.description) {
        try {
          const parsed =
            typeof org.description === 'string'
              ? JSON.parse(org.description)
              : org.description;
          if (parsed.category) {
            categoryData = parsed;
          }
        } catch (e) {
          // Not JSON
        }
      }

      return {
        id: org.id,
        step1: { isRegistered: org.isRegistered },
        step2: {
          legalName: org.companyName,
          countryOfIncorporation: org.countryOfIncorporation,
          incorporationNumber: org.incorporationNumber,
        },
        step3: categoryData,
        step4: {
          description:
            typeof org.description === 'string' &&
            !org.description.startsWith('{')
              ? org.description
              : null,
          industry: org.industry,
          headquartersCity: (org.address as any)?.city,
          headquartersCountry: (org.address as any)?.country,
          foundedDate: org.yearOfCommencement
            ? `${org.yearOfCommencement}-01-01`
            : null,
          address: org.address,
        },
        step5: {
          organisationEmail: org.user?.email,
        },
        step7: {
          organisationName: org.companyName,
          organisationCountry: org.country,
          description:
            typeof org.description === 'string' &&
            !org.description.startsWith('{')
              ? org.description
              : null,
          industry: org.industry,
          foundedDate: org.yearOfCommencement
            ? `${org.yearOfCommencement}-01-01`
            : null,
          address: org.address,
        },
        step8: categoryData,
        currentStep: this.calculateCurrentStep(org),
        profileCompleteness: org.profileCompleteness,
        updatedAt: org.updatedAt,
        createdAt: org.createdAt,
      };
    });
  }

  // Get single registration (for admin)
  async getRegistrationForAdmin(registrationId: string): Promise<any> {
    return this.getRegistration(registrationId);
  }

  @OnEvent(AuthServiceEvents.SEND_VERIFICATION_EMAIL)
  async handleSendVerificationEmailEvent(data: any) {
    const sendEmailResult = await this.mailer.send(data, data.html);
    console.log('Verification email sent:', sendEmailResult?.data?.id);
  }
}
