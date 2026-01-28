import { Injectable, ForbiddenException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../utility/prisma/prisma.service';
import { InviteAdminDto } from './dto/invite-admin.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async inviteAdmin(userId: string, inviteAdminDto: InviteAdminDto) {
    // Check if requester is super_admin
    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminProfile: true },
    });

    if (!requester?.adminProfile || requester.adminProfile.role !== 'super_admin') {
      throw new ForbiddenException('Only super admins can invite other admins');
    }

    // Check if email exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: inviteAdminDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Generate invitation token
    const invitationToken = this.generateToken();
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: inviteAdminDto.email,
        firstName: inviteAdminDto.firstName,
        lastName: inviteAdminDto.lastName,
        password: '', // Will be set during onboarding
        userType: 'ADMIN',
        status: 'PENDING_INVITATION',
        emailVerified: false,
      },
    });

    // Create admin profile
    const admin = await this.prisma.admin.create({
      data: {
        userId: user.id,
        role: inviteAdminDto.role,
        invitationToken,
        invitationExpiresAt,
        invitationSentAt: new Date(),
      },
    });

    // TODO: Send invitation email
    console.log(`Invitation token: ${invitationToken}`);

    return {
      success: true,
      message: 'Admin invitation sent successfully',
      data: {
        userId: user.id,
        email: user.email,
        role: admin.role,
        invitationSentAt: admin.invitationSentAt,
        invitationExpiresAt: admin.invitationExpiresAt,
      },
    };
  }

  async completeOnboarding(completeOnboardingDto: CompleteOnboardingDto) {
    if (completeOnboardingDto.password !== completeOnboardingDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Find admin by invitation token
    const admin = await this.prisma.admin.findFirst({
      where: {
        invitationToken: completeOnboardingDto.invitationToken,
        invitationExpiresAt: {
          gt: new Date(),
        },
      },
      include: { user: true },
    });

    if (!admin) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(completeOnboardingDto.password, 10);

    // Update user
    const user = await this.prisma.user.update({
      where: { id: admin.userId },
      data: {
        password: hashedPassword,
        status: 'ACTIVE',
        emailVerified: true,
        firstLogin: false,
      },
    });

    // Delete invitation token
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: {
        invitationToken: null,
        invitationExpiresAt: null,
      },
    });

    // Generate tokens
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

    // TODO: Send welcome email

    return {
      success: true,
      message: 'Admin onboarding completed successfully',
      data: {
        user: {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: admin.role,
          status: user.status,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 3600,
        },
      },
    };
  }

  async createSuperAdmin(createSuperAdminDto: any) {
    // Check if any super admin exists
    const existingSuperAdmin = await this.prisma.admin.findFirst({
      where: { role: 'super_admin' },
    });

    if (existingSuperAdmin) {
      throw new ForbiddenException('Super admin already exists. Use invite endpoint instead.');
    }

    // Validate passwords match
    if (createSuperAdminDto.password !== createSuperAdminDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Check if email exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createSuperAdminDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createSuperAdminDto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: createSuperAdminDto.email,
        password: hashedPassword,
        firstName: createSuperAdminDto.firstName,
        lastName: createSuperAdminDto.lastName,
        userType: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        firstLogin: false,
      },
    });

    // Create admin profile
    const admin = await this.prisma.admin.create({
      data: {
        userId: user.id,
        role: 'super_admin',
      },
    });

    return {
      success: true,
      message: 'Super admin created successfully',
      data: {
        userId: user.id,
        email: user.email,
        role: admin.role,
      },
    };
  }

  async getDashboardStats() {
    const [totalUsers, totalOrganisations, totalProfessionals, totalJobs, totalApplications] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organisation.count(),
      this.prisma.professional.count(),
      this.prisma.job.count(),
      this.prisma.jobApplication.count(),
    ]);

    const verifiedProfessionals = await this.prisma.professional.count({
      where: { identityStatus: 'verified' },
    });

    const verifiedOrganisations = await this.prisma.organisation.count({
      where: { verificationStatus: 'verified' },
    });

    return {
      success: true,
      data: {
        totalUsers,
        totalOrganisations,
        totalProfessionals,
        totalJobs,
        totalApplications,
        verifiedProfessionals,
        verifiedOrganisations,
        pendingVerifications: totalProfessionals - verifiedProfessionals + totalOrganisations - verifiedOrganisations,
      },
    };
  }

  async getAllUsers(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        include: {
          adminProfile: true,
          organisation: true,
          professional: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return {
      success: true,
      data: {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          status: user.status,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          adminRole: user.adminProfile?.role,
          organisationName: user.organisation?.companyName,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getAllOrganisations(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [organisations, total] = await Promise.all([
      this.prisma.organisation.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organisation.count(),
    ]);

    return {
      success: true,
      data: {
        organisations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getAllProfessionals(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [professionals, total] = await Promise.all([
      this.prisma.professional.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
            },
          },
          identityVerification: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.professional.count(),
    ]);

    return {
      success: true,
      data: {
        professionals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getAllJobs(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        skip,
        take: limit,
        include: {
          organisation: {
            select: {
              id: true,
              companyName: true,
            },
          },
          applications: {
            select: {
              id: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.job.count(),
    ]);

    return {
      success: true,
      data: {
        jobs: jobs.map((job) => ({
          ...job,
          applicants: job.applications.length,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getAllTransactions(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    // TODO: Replace with actual Transaction model when it's added to Prisma schema
    // For now, return empty array with pagination structure
    // This allows the frontend to work while the Transaction model is being implemented
    
    const transactions: any[] = [];
    const total = 0;

    return {
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async createJob(userId: string, organisationId: string | undefined, createJobDto: any) {
    // If no organisationId provided, get the first available organisation
    let orgId = organisationId;
    
    if (!orgId) {
      const firstOrg = await this.prisma.organisation.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      
      if (!firstOrg) {
        throw new NotFoundException('No organisation found. Please create an organisation first.');
      }
      
      orgId = firstOrg.id;
    }

    // Verify organisation exists
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Create job
    const job = await this.prisma.job.create({
      data: {
        organisationId: orgId,
        jobTitle: createJobDto.jobTitle,
        location: createJobDto.location,
        workMode: createJobDto.workMode as any,
        employmentType: createJobDto.employmentType as any,
        experienceYears: createJobDto.experienceYears,
        jobLevel: createJobDto.jobLevel,
        pay: createJobDto.pay as any,
        closingDate: createJobDto.closingDate ? new Date(createJobDto.closingDate) : null,
        description: createJobDto.description,
        requirements: createJobDto.requirements || [],
        applyCTA: createJobDto.applyCTA as any,
        status: 'draft',
        postedBy: userId,
      },
    });

    return {
      success: true,
      message: 'Job created successfully',
      data: job,
    };
  }

  async updateJobStatus(jobId: string, status: string) {
    const validStatuses = ['draft', 'published', 'paused', 'closed'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: status as any,
      },
    });

    return {
      success: true,
      message: 'Job status updated successfully',
      data: updated,
    };
  }

  async activateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });

    return {
      success: true,
      message: 'User activated successfully',
      data: updated,
    };
  }

  async suspendUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    return {
      success: true,
      message: 'User suspended successfully',
      data: updated,
    };
  }

  async approveOrganisationVerification(orgId: string, adminUserId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        verificationStatus: 'verified',
      },
    });

    // Update verification request
    await this.prisma.organisationVerification.updateMany({
      where: {
        organisationId: orgId,
        status: 'under_review',
      },
      data: {
        status: 'verified',
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
      },
    });

    return {
      success: true,
      message: 'Organisation verification approved',
      data: updated,
    };
  }

  async updateOrganisationVerificationStatus(orgId: string, status: string, adminUserId: string) {
    const validStatuses = ['verified', 'under_review', 'pending', 'rejected', 'not_activated'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        verificationStatus: status as any,
      },
    });

    // Update verification request if it exists
    if (status === 'verified' || status === 'under_review' || status === 'rejected') {
      await this.prisma.organisationVerification.updateMany({
        where: {
          organisationId: orgId,
        },
        data: {
          status: status as any,
          reviewedAt: new Date(),
          reviewedBy: adminUserId,
        },
      });
    }

    return {
      success: true,
      message: 'Organisation verification status updated',
      data: updated,
    };
  }

  async approveProfessionalVerification(profId: string, type: 'identity' | 'education' | 'experience', verificationId: string, adminUserId: string) {
    if (type === 'identity') {
      await this.prisma.identityVerification.update({
        where: { id: verificationId },
        data: {
          status: 'verified',
          verifiedAt: new Date(),
          reviewedBy: adminUserId,
        },
      });

      await this.prisma.professional.update({
        where: { id: profId },
        data: {
          identityStatus: 'verified',
          identityVerified: true,
        },
      });
    } else if (type === 'education') {
      await this.prisma.education.update({
        where: { id: verificationId },
        data: {
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          reviewedBy: adminUserId,
        },
      });
    } else if (type === 'experience') {
      await this.prisma.workExperience.update({
        where: { id: verificationId },
        data: {
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          reviewedBy: adminUserId,
        },
      });
    }

    return {
      success: true,
      message: 'Verification approved successfully',
    };
  }

  private generateToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}


