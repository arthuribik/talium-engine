import {
  Injectable,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { BillingEntityType, Prisma, type AdminRole } from '@prisma/client';
import { PrismaService } from '../utility/prisma/prisma.service';
import {
  AdminInviteAccessExpiry,
  InviteAdminDto,
} from './dto/invite-admin.dto';
import {
  CreateAdminCustomRoleDto,
  UpdateAdminCustomRoleDto,
} from './dto/admin-custom-role.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import {
  ADMIN_PLATFORM_PERMISSION_CATALOG,
  BUILTIN_ADMIN_TEAM_ROLE_PERMISSION_PRESETS,
  formatAdminPlatformPermissionKey,
  isValidAdminPlatformPermissionList,
} from './admin-platform-permission-catalog.config';
import { CreateBillingPlanDto } from './dto/create-billing-plan.dto';
import { UpdateBillingPlanDto } from './dto/update-billing-plan.dto';
import { ensureDefaultBillingPlans } from '../app/billing/billing-plans.seed';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthServiceEvents } from '../app/auth/auth.service';

/** Display labels aligned with admin Team UI (Users table + Role Management). */
const ADMIN_TEAM_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Operations',
  support: 'Support Agent',
  auditor: 'Finance',
};

/** Permission pills shown on /admin/team → Role Management (product spec). */
const ADMIN_TEAM_ROLE_PERMISSIONS: Record<AdminRole, readonly string[]> = {
  super_admin: [
    'View All',
    'Manage Users',
    'Manage Roles',
    'Billing Access',
    'Verification Control',
    'Job Management',
    'Communications',
    'Settings',
  ],
  admin: [
    'View Professionals',
    'View Organisations',
    'Manage Verifications',
    'Manage Jobs',
    'View Transactions',
  ],
  support: [
    'View Professionals',
    'View Organisations',
    'Create Communications',
    'View Jobs',
  ],
  auditor: ['View Transactions', 'Manage Billing', 'Export Reports'],
};

/** Short copy for the role summary card on team member profile. */
const ADMIN_TEAM_ROLE_SUMMARY_DESCRIPTION: Record<AdminRole, string> = {
  super_admin:
    'Full platform access including billing, verification, jobs, team, and settings.',
  admin:
    'Can manage professionals, organisations, verifications, and jobs across the platform.',
  support:
    'Can manage professionals, organisations and run verification reviews.',
  auditor:
    'Can view and export financial data, manage billing plans, and issue refunds where permitted.',
};

function adminTeamDisplayStatus(status: string): {
  key: 'active' | 'deactivated' | 'suspended';
  label: string;
} {
  if (status === 'SUSPENDED') return { key: 'suspended', label: 'Suspended' };
  if (status === 'UNVERIFIED' || status === 'PENDING_INVITATION') {
    return { key: 'deactivated', label: 'Deactivated' };
  }
  return { key: 'active', label: 'Active' };
}

const REVIEWED_VERIFICATION_STATUSES = ['verified', 'rejected'] as const;

function activityLevelFromStatus(status: string): 'success' | 'error' | 'info' {
  if (status === 'verified') return 'success';
  if (status === 'rejected') return 'error';
  return 'info';
}

function formatProUserName(
  u: { firstName: string; lastName: string } | null | undefined,
): string {
  if (!u) return 'Professional';
  const n = `${u.firstName} ${u.lastName}`.trim();
  return n || 'Professional';
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  async inviteAdmin(userId: string, inviteAdminDto: InviteAdminDto) {
    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminProfile: true },
    });

    if (
      !requester?.adminProfile ||
      requester.adminProfile.role !== 'super_admin'
    ) {
      throw new ForbiddenException('Only super admins can invite other admins');
    }

    if (inviteAdminDto.role === 'super_admin') {
      throw new BadRequestException(
        'Super admin role cannot be assigned via invitation',
      );
    }

    const full = inviteAdminDto.fullName?.trim();
    let firstName = inviteAdminDto.firstName?.trim() ?? '';
    let lastName = inviteAdminDto.lastName?.trim() ?? '';
    if (full) {
      const parts = full.split(/\s+/).filter(Boolean);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ').trim() || 'Member';
    }
    if (!firstName || !lastName) {
      throw new BadRequestException('Please provide the invitee full name');
    }

    const email = inviteAdminDto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const invitationToken = this.generateToken();
    const expirySetting =
      inviteAdminDto.accessExpiry ?? AdminInviteAccessExpiry.days_7;
    let invitationExpiresAt: Date | null = null;
    if (expirySetting !== AdminInviteAccessExpiry.none) {
      const days =
        expirySetting === AdminInviteAccessExpiry.days_14
          ? 14
          : expirySetting === AdminInviteAccessExpiry.days_30
            ? 30
            : 7;
      invitationExpiresAt = new Date();
      invitationExpiresAt.setDate(invitationExpiresAt.getDate() + days);
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: '',
        userType: 'ADMIN',
        status: 'PENDING_INVITATION',
        emailVerified: false,
      },
    });

    const adminRole = inviteAdminDto.role || 'admin';
    const admin = await this.prisma.admin.create({
      data: {
        userId: user.id,
        role: adminRole as AdminRole,
        invitationToken,
        invitationExpiresAt,
        invitationSentAt: new Date(),
      },
    });

    const baseUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const acceptUrl = `${baseUrl.replace(/\/$/, '')}/admin/accept-invite?token=${encodeURIComponent(invitationToken)}`;
    const roleLabel = ADMIN_TEAM_ROLE_LABELS[admin.role] ?? admin.role;
    const personal = inviteAdminDto.personalMessage?.trim();
    const inviterName = `${requester.firstName} ${requester.lastName}`.trim();

    const html = this.buildAdminInviteEmailHtml({
      firstName,
      acceptUrl,
      roleLabel,
      inviterName,
      personalMessage: personal,
      expiresAt: invitationExpiresAt,
    });

    this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
      to: email,
      subject: `You’re invited to the Taldium admin team (${roleLabel})`,
      html,
    });

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

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildAdminInviteEmailHtml(params: {
    firstName: string;
    acceptUrl: string;
    roleLabel: string;
    inviterName: string;
    personalMessage?: string;
    expiresAt: Date | null;
  }): string {
    const expiryLine = params.expiresAt
      ? `This invitation expires on <strong>${params.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.`
      : 'This invitation does not expire until it is used or revoked.';

    const noteBlock = params.personalMessage
      ? `<table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#cfe8ff" style="margin:16px 0;background:#f0f8ff;">
          <tr><td><strong>Message from ${this.escapeHtml(params.inviterName)}</strong><br/><span style="white-space:pre-wrap;">${this.escapeHtml(params.personalMessage)}</span></td></tr>
        </table>`
      : '';

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:system-ui,-apple-system,sans-serif;color:#111;">
  <tr><td align="center" style="padding:24px 12px;">
    <table width="560" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding-bottom:8px;"><h1 style="font-size:20px;margin:0;">Hi ${this.escapeHtml(params.firstName)},</h1></td></tr>
      <tr><td style="padding-bottom:16px;line-height:1.5;">
        <p style="margin:0 0 12px;">${this.escapeHtml(params.inviterName)} has invited you to join the <strong>Taldium</strong> platform admin team as <strong>${this.escapeHtml(params.roleLabel)}</strong>.</p>
        <p style="margin:0 0 12px;">Use the button below to set your password and complete onboarding before you can sign in.</p>
        <p style="margin:0;font-size:14px;color:#444;">${expiryLine}</p>
      </td></tr>
      ${noteBlock}
      <tr><td style="padding:8px 0 24px;">
        <a href="${params.acceptUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Accept invitation</a>
      </td></tr>
      <tr><td style="font-size:13px;color:#666;line-height:1.5;">
        If the button does not work, copy and paste this link into your browser:<br/>
        <span style="word-break:break-all;">${this.escapeHtml(params.acceptUrl)}</span>
      </td></tr>
    </table>
  </td></tr>
</table>`;
  }

  async completeOnboarding(completeOnboardingDto: CompleteOnboardingDto) {
    if (
      completeOnboardingDto.password !== completeOnboardingDto.confirmPassword
    ) {
      throw new BadRequestException('Passwords do not match');
    }

    const admin = await this.prisma.admin.findFirst({
      where: {
        invitationToken: completeOnboardingDto.invitationToken,
        OR: [
          { invitationExpiresAt: null },
          { invitationExpiresAt: { gt: new Date() } },
        ],
      },
      include: { user: true },
    });

    if (!admin) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      completeOnboardingDto.password,
      10,
    );

    // Update user - ensure they are activated with proper status
    const user = await this.prisma.user.update({
      where: { id: admin.userId },
      data: {
        password: hashedPassword,
        status: 'ACTIVE', // Explicitly set to ACTIVE (not PENDING_INVITATION)
        emailVerified: true,
        firstLogin: false,
      },
    });

    // Ensure admin role is properly maintained (safeguard)
    // The role should already be set from invitation, but ensure it's correct
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: {
        invitationToken: null,
        invitationExpiresAt: null,
        // Role is already set from invitation, no need to update
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
      secret:
        this.configService.get<string>('REFRESH_TOKEN_SECRET') ||
        'refresh-secret',
      expiresIn:
        this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '7d',
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
      throw new ForbiddenException(
        'Super admin already exists. Use invite endpoint instead.',
      );
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
    try {
      // Overall Stats
      const [
        totalUsers,
        totalOrganisations,
        totalProfessionals,
        totalJobs,
        totalApplications,
      ] = await Promise.all([
        this.prisma.user.count().catch(() => 0),
        this.prisma.organisation.count().catch(() => 0),
        this.prisma.professional.count().catch(() => 0),
        this.prisma.job.count().catch(() => 0),
        this.prisma.jobApplication.count().catch(() => 0),
      ]);

      const verifiedProfessionals = await this.prisma.professional
        .count({
          where: { identityStatus: 'verified' },
        })
        .catch(() => 0);

      const verifiedOrganisations = await this.prisma.organisation
        .count({
          where: { verificationStatus: 'verified' },
        })
        .catch(() => 0);

      // Organisation Entities Analytics
      const activeOrganisations = await this.prisma.organisation
        .count({
          where: {
            user: {
              status: 'ACTIVE',
            },
          },
        })
        .catch(() => 0);

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(today);
      thisWeek.setDate(today.getDate() - 7);
      const thisMonth = new Date(today);
      thisMonth.setMonth(today.getMonth() - 1);
      const thisYear = new Date(today);
      thisYear.setFullYear(today.getFullYear() - 1);

      const newOrganisationsToday = await this.prisma.organisation
        .count({
          where: {
            createdAt: { gte: today },
          },
        })
        .catch(() => 0);

      const newOrganisationsThisWeek = await this.prisma.organisation
        .count({
          where: {
            createdAt: { gte: thisWeek },
          },
        })
        .catch(() => 0);

      const newOrganisationsThisMonth = await this.prisma.organisation
        .count({
          where: {
            createdAt: { gte: thisMonth },
          },
        })
        .catch(() => 0);

      const newOrganisationsThisYear = await this.prisma.organisation
        .count({
          where: {
            createdAt: { gte: thisYear },
          },
        })
        .catch(() => 0);

      const pendingActivationOrganisations = await this.prisma.organisation
        .count({
          where: {
            verificationStatus: {
              in: ['pending', 'under_review', 'not_activated'],
            },
          },
        })
        .catch(() => 0);

      // Professional Entities Analytics
      const activatedProfessionals = await this.prisma.professional
        .count({
          where: {
            user: {
              status: 'ACTIVE',
            },
          },
        })
        .catch(() => 0);

      const verifiedGovernmentIds = await this.prisma.identityVerification
        .count({
          where: {
            status: 'verified',
          },
        })
        .catch(() => 0);

      const totalAddressInfo = await this.prisma.professional
        .count({
          where: {
            country: { not: null },
          },
        })
        .catch(() => 0);

      const verifiedAddressInfo = await this.prisma.professional
        .count({
          where: {
            country: { not: null },
            identityStatus: 'verified',
          },
        })
        .catch(() => 0);

      const graduateCertificates = await this.prisma.education
        .count({
          where: {
            levelOfEducation: {
              in: ['bachelor', 'master', 'doctorate', 'degree'],
            },
          },
        })
        .catch(() => 0);

      // Jobs Analytics
      const activeJobRoles = await this.prisma.job
        .count({
          where: {
            status: 'published',
          },
        })
        .catch(() => 0);

      const totalHires = await this.prisma.jobApplication
        .count({
          where: {
            status: 'hired',
          },
        })
        .catch(() => 0);

      // Verifications - Professional Entity
      const professionalIdVerificationRequests =
        await this.prisma.identityVerification.count().catch(() => 0);
      const professionalVerifiedIds = await this.prisma.identityVerification
        .count({
          where: { status: 'verified' },
        })
        .catch(() => 0);

      const professionalAddressVerificationRequests =
        await this.prisma.professional
          .count({
            where: {
              country: { not: null },
            },
          })
          .catch(() => 0);
      const professionalVerifiedAddress = await this.prisma.professional
        .count({
          where: {
            country: { not: null },
            identityStatus: 'verified',
          },
        })
        .catch(() => 0);

      const professionalEducationVerificationRequests =
        await this.prisma.education.count().catch(() => 0);
      const professionalVerifiedEducation = await this.prisma.education
        .count({
          where: { verificationStatus: 'verified' },
        })
        .catch(() => 0);

      const professionalWorkExperienceVerificationRequests =
        await this.prisma.workExperience.count().catch(() => 0);
      const professionalVerifiedWorkExperience =
        await this.prisma.workExperience
          .count({
            where: { verificationStatus: 'verified' },
          })
          .catch(() => 0);

      // Verifications - Organisation Entity
      const organisationVerificationRequests =
        await this.prisma.organisationVerification.count().catch(() => 0);
      const organisationVerifiedIds = await this.prisma.organisationVerification
        .count({
          where: { status: 'verified' },
        })
        .catch(() => 0);

      // For organisation address verification, we'll use organisations with address field
      const organisationAddressVerificationRequests =
        await this.prisma.organisation
          .count({
            where: {
              address: { not: null },
            },
          })
          .catch(() => 0);
      const organisationVerifiedAddress = await this.prisma.organisation
        .count({
          where: {
            address: { not: null },
            verificationStatus: 'verified',
          },
        })
        .catch(() => 0);

      // Organisation education and work experience verifications (if they exist in future)
      const organisationEducationVerificationRequests = 0;
      const organisationVerifiedEducation = 0;
      const organisationWorkExperienceVerificationRequests = 0;
      const organisationVerifiedWorkExperience = 0;

      // Billing - Professional Entity (placeholder - no billing model yet)
      const professionalTotalRevenue = 0;
      const professionalTaldiumExpress = 0;
      const professionalTaldiumBloom = 0;
      const professionalTaldiumPrime = 0;

      // Billing - Organisation Entity (placeholder - no billing model yet)
      const organisationTotalRevenue = 0;
      const organisationTaldiumStarter = 0;
      const organisationTaldiumStandard = 0;
      const organisationTaldiumPremium = 0;
      const organisationTaldiumEnterprise = 0;

      return {
        success: true,
        data: {
          // Overall
          totalUsers: totalUsers || 0,
          totalOrganisations: totalOrganisations || 0,
          totalProfessionals: totalProfessionals || 0,
          totalJobs: totalJobs || 0,
          totalApplications: totalApplications || 0,
          verifiedProfessionals: verifiedProfessionals || 0,
          verifiedOrganisations: verifiedOrganisations || 0,
          pendingVerifications:
            totalProfessionals -
              verifiedProfessionals +
              totalOrganisations -
              verifiedOrganisations || 0,

          // Organisation Entities
          organisationEntities: {
            totalCreated: totalOrganisations || 0,
            totalActive: activeOrganisations || 0,
            newOrganisations: {
              today: newOrganisationsToday || 0,
              thisWeek: newOrganisationsThisWeek || 0,
              thisMonth: newOrganisationsThisMonth || 0,
              yearToDate: newOrganisationsThisYear || 0,
            },
            pendingActivation: pendingActivationOrganisations || 0,
          },

          // Professional Entities
          professionalEntities: {
            totalCreated: totalProfessionals || 0,
            totalActivated: activatedProfessionals || 0,
            totalVerifiedGovernmentId: verifiedGovernmentIds || 0,
            totalAddressInfoCreated: totalAddressInfo || 0,
            verifiedAddressInfo: verifiedAddressInfo || 0,
            graduateCertificatesAdded: graduateCertificates || 0,
          },

          // Jobs
          jobs: {
            totalCreated: totalJobs || 0,
            activeJobRoles: activeJobRoles || 0,
            totalApplications: totalApplications || 0,
            totalHires: totalHires || 0,
          },

          // Verifications - Professional Entity
          professionalVerifications: {
            idVerificationRequests: professionalIdVerificationRequests || 0,
            verifiedIds: professionalVerifiedIds || 0,
            addressVerificationRequests:
              professionalAddressVerificationRequests || 0,
            verifiedAddress: professionalVerifiedAddress || 0,
            educationVerificationRequests:
              professionalEducationVerificationRequests || 0,
            verifiedEducation: professionalVerifiedEducation || 0,
            workExperienceVerificationRequests:
              professionalWorkExperienceVerificationRequests || 0,
            verifiedWorkExperience: professionalVerifiedWorkExperience || 0,
          },

          // Verifications - Organisation Entity
          organisationVerifications: {
            idVerificationRequests: organisationVerificationRequests || 0,
            verifiedIds: organisationVerifiedIds || 0,
            addressVerificationRequests:
              organisationAddressVerificationRequests || 0,
            verifiedAddress: organisationVerifiedAddress || 0,
            educationVerificationRequests:
              organisationEducationVerificationRequests || 0,
            verifiedEducation: organisationVerifiedEducation || 0,
            workExperienceVerificationRequests:
              organisationWorkExperienceVerificationRequests || 0,
            verifiedWorkExperience: organisationVerifiedWorkExperience || 0,
          },

          // Billing - Professional Entity
          professionalBilling: {
            totalRevenue: professionalTotalRevenue || 0,
            taldiumExpress: professionalTaldiumExpress || 0,
            taldiumBloom: professionalTaldiumBloom || 0,
            taldiumPrime: professionalTaldiumPrime || 0,
          },

          // Billing - Organisation Entity
          organisationBilling: {
            totalRevenue: organisationTotalRevenue || 0,
            taldiumStarter: organisationTaldiumStarter || 0,
            taldiumStandard: organisationTaldiumStandard || 0,
            taldiumPremium: organisationTaldiumPremium || 0,
            taldiumEnterprise: organisationTaldiumEnterprise || 0,
          },
        },
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Return all zeros on error
      return {
        success: true,
        data: {
          totalUsers: 0,
          totalOrganisations: 0,
          totalProfessionals: 0,
          totalJobs: 0,
          totalApplications: 0,
          verifiedProfessionals: 0,
          verifiedOrganisations: 0,
          pendingVerifications: 0,
          organisationEntities: {
            totalCreated: 0,
            totalActive: 0,
            newOrganisations: {
              today: 0,
              thisWeek: 0,
              thisMonth: 0,
              yearToDate: 0,
            },
            pendingActivation: 0,
          },
          professionalEntities: {
            totalCreated: 0,
            totalActivated: 0,
            totalVerifiedGovernmentId: 0,
            totalAddressInfoCreated: 0,
            verifiedAddressInfo: 0,
            graduateCertificatesAdded: 0,
          },
          jobs: {
            totalCreated: 0,
            activeJobRoles: 0,
            totalApplications: 0,
            totalHires: 0,
          },
          professionalVerifications: {
            idVerificationRequests: 0,
            verifiedIds: 0,
            addressVerificationRequests: 0,
            verifiedAddress: 0,
            educationVerificationRequests: 0,
            verifiedEducation: 0,
            workExperienceVerificationRequests: 0,
            verifiedWorkExperience: 0,
          },
          organisationVerifications: {
            idVerificationRequests: 0,
            verifiedIds: 0,
            addressVerificationRequests: 0,
            verifiedAddress: 0,
            educationVerificationRequests: 0,
            verifiedEducation: 0,
            workExperienceVerificationRequests: 0,
            verifiedWorkExperience: 0,
          },
          professionalBilling: {
            totalRevenue: 0,
            taldiumExpress: 0,
            taldiumBloom: 0,
            taldiumPrime: 0,
          },
          organisationBilling: {
            totalRevenue: 0,
            taldiumStarter: 0,
            taldiumStandard: 0,
            taldiumPremium: 0,
            taldiumEnterprise: 0,
          },
        },
      };
    }
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

  /**
   * Platform admin team directory (users with ADMIN type and an admin profile).
   * Supports search by name/email and filters by account status and admin role.
   */
  async getAdminTeam(
    page: number = 1,
    limit: number = 20,
    search?: string,
    statusFilter: string = 'all',
    roleFilter: string = 'all',
  ) {
    const skip = (page - 1) * limit;
    const q = search?.trim();
    const andClauses: Prisma.UserWhereInput[] = [
      { userType: 'ADMIN' },
      { adminProfile: { isNot: null } },
    ];

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'active') {
        andClauses.push({ status: { in: ['ACTIVE', 'VERIFIED'] } });
      } else if (statusFilter === 'deactivated') {
        andClauses.push({
          status: { in: ['UNVERIFIED', 'PENDING_INVITATION'] },
        });
      } else if (statusFilter === 'suspended') {
        andClauses.push({ status: 'SUSPENDED' });
      }
    }

    if (roleFilter && roleFilter !== 'all') {
      andClauses.push({
        adminProfile: { is: { role: roleFilter as AdminRole } },
      });
    }

    if (q) {
      andClauses.push({
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.UserWhereInput = { AND: andClauses };

    const adminRoles: AdminRole[] = [
      'super_admin',
      'admin',
      'support',
      'auditor',
    ];

    const [users, total, roleSummaries] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          adminProfile: { select: { role: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
      Promise.all(
        adminRoles.map(async (role) => ({
          key: role,
          label: ADMIN_TEAM_ROLE_LABELS[role],
          memberCount: await this.prisma.user.count({
            where: {
              userType: 'ADMIN',
              adminProfile: { is: { role } },
            },
          }),
        })),
      ),
    ]);

    return {
      success: true,
      data: {
        members: users.map((u) => {
          const role = u.adminProfile?.role as AdminRole | undefined;
          const roleLabel = role ? ADMIN_TEAM_ROLE_LABELS[role] : '—';
          const displayStatus = adminTeamDisplayStatus(u.status);
          return {
            id: u.id,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            adminRole: role ?? null,
            roleLabel,
            status: u.status,
            displayStatus,
            dateJoined: u.createdAt,
            lastActive: u.updatedAt,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        roleSummaries: roleSummaries.map((r) => ({
          ...r,
          permissions: [...ADMIN_TEAM_ROLE_PERMISSIONS[r.key as AdminRole]],
        })),
        customRoles: await this.listAdminCustomRolesForTeam(),
      },
    };
  }

  /**
   * Single platform admin team member for profile / permissions UI.
   */
  async getAdminTeamMember(memberUserId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: memberUserId,
        userType: 'ADMIN',
        adminProfile: { isNot: null },
      },
      include: { adminProfile: true },
    });

    if (!user?.adminProfile) {
      throw new NotFoundException('Team member not found');
    }

    const role = user.adminProfile.role as AdminRole;
    const presetKeys = BUILTIN_ADMIN_TEAM_ROLE_PERMISSION_PRESETS[role] ?? [];
    const preset = new Set(presetKeys);

    const permissionSections = ADMIN_PLATFORM_PERMISSION_CATALOG.map((section) => ({
      id: section.id,
      title: section.title,
      icon: section.icon,
      items: section.items.map((item) => ({
        key: item.key,
        label: item.label,
        enabled: preset.has(item.key),
      })),
    }));

    const displayStatus = adminTeamDisplayStatus(user.status);
    const roleLabel = ADMIN_TEAM_ROLE_LABELS[role];

    let accessExpiryLabel = 'No expiry';
    if (
      user.status === 'PENDING_INVITATION' &&
      user.adminProfile.invitationExpiresAt
    ) {
      accessExpiryLabel = user.adminProfile.invitationExpiresAt.toLocaleDateString(
        'en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' },
      );
    }

    const activity = await this.buildAdminTeamMemberActivity(memberUserId);

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        adminRole: role,
        roleLabel,
        status: user.status,
        displayStatus,
        dateJoined: user.createdAt,
        lastActive: user.updatedAt,
        twoFactorEnabled: user.twoFactorEnabled,
        accessExpiryLabel,
        roleSummary: {
          key: role,
          label: roleLabel,
          description: ADMIN_TEAM_ROLE_SUMMARY_DESCRIPTION[role],
        },
        permissionSections,
        activityLog: activity.activityLog,
        activitySummary: activity.activitySummary,
        sessionInfo: {
          activeSessions: 0,
          lastIp: null as string | null,
          device: null as string | null,
          location: null as string | null,
        },
      },
    };
  }

  /**
   * Activity log + summary derived from verification / review tables where `reviewedBy`
   * matches the admin user. Empty when they have not reviewed anything yet.
   */
  private async buildAdminTeamMemberActivity(memberUserId: string) {
    const reviewedWhere = { reviewedBy: memberUserId };
    const statusIn = { in: [...REVIEWED_VERIFICATION_STATUSES] };

    const [
      identityRows,
      educationRows,
      workRows,
      projectRows,
      orgVerRows,
      profileEditRows,
      idTot,
      idApr,
      idRej,
      eduTot,
      eduApr,
      eduRej,
      workTot,
      workApr,
      workRej,
      projTot,
      projApr,
      projRej,
      orgTot,
      orgApr,
      orgRej,
      editTot,
      editApr,
      editRej,
    ] = await Promise.all([
      this.prisma.identityVerification.findMany({
        where: { ...reviewedWhere, status: statusIn },
        orderBy: { verifiedAt: 'desc' },
        take: 20,
        include: {
          professional: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.education.findMany({
        where: { ...reviewedWhere, verificationStatus: statusIn },
        orderBy: { verifiedAt: 'desc' },
        take: 20,
        include: {
          professional: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.workExperience.findMany({
        where: { ...reviewedWhere, verificationStatus: statusIn },
        orderBy: { verifiedAt: 'desc' },
        take: 20,
        include: {
          professional: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.professionalProject.findMany({
        where: { ...reviewedWhere, verificationStatus: statusIn },
        orderBy: { verifiedAt: 'desc' },
        take: 20,
        include: {
          professional: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.organisationVerification.findMany({
        where: { ...reviewedWhere, status: statusIn },
        orderBy: { reviewedAt: 'desc' },
        take: 20,
        include: { organisation: { select: { companyName: true } } },
      }),
      this.prisma.professionalProfileEditRequest.findMany({
        where: { ...reviewedWhere, status: statusIn },
        orderBy: { reviewedAt: 'desc' },
        take: 20,
        include: {
          professional: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.identityVerification.count({
        where: { ...reviewedWhere, status: statusIn },
      }),
      this.prisma.identityVerification.count({
        where: { ...reviewedWhere, status: 'verified' },
      }),
      this.prisma.identityVerification.count({
        where: { ...reviewedWhere, status: 'rejected' },
      }),
      this.prisma.education.count({
        where: { ...reviewedWhere, verificationStatus: statusIn },
      }),
      this.prisma.education.count({
        where: { ...reviewedWhere, verificationStatus: 'verified' },
      }),
      this.prisma.education.count({
        where: { ...reviewedWhere, verificationStatus: 'rejected' },
      }),
      this.prisma.workExperience.count({
        where: { ...reviewedWhere, verificationStatus: statusIn },
      }),
      this.prisma.workExperience.count({
        where: { ...reviewedWhere, verificationStatus: 'verified' },
      }),
      this.prisma.workExperience.count({
        where: { ...reviewedWhere, verificationStatus: 'rejected' },
      }),
      this.prisma.professionalProject.count({
        where: { ...reviewedWhere, verificationStatus: statusIn },
      }),
      this.prisma.professionalProject.count({
        where: { ...reviewedWhere, verificationStatus: 'verified' },
      }),
      this.prisma.professionalProject.count({
        where: { ...reviewedWhere, verificationStatus: 'rejected' },
      }),
      this.prisma.organisationVerification.count({
        where: { ...reviewedWhere, status: statusIn },
      }),
      this.prisma.organisationVerification.count({
        where: { ...reviewedWhere, status: 'verified' },
      }),
      this.prisma.organisationVerification.count({
        where: { ...reviewedWhere, status: 'rejected' },
      }),
      this.prisma.professionalProfileEditRequest.count({
        where: { ...reviewedWhere, status: statusIn },
      }),
      this.prisma.professionalProfileEditRequest.count({
        where: { ...reviewedWhere, status: 'verified' },
      }),
      this.prisma.professionalProfileEditRequest.count({
        where: { ...reviewedWhere, status: 'rejected' },
      }),
    ]);

    type LogItem = {
      id: string;
      level: 'success' | 'error' | 'info';
      title: string;
      at: string;
    };

    const items: LogItem[] = [];

    for (const r of identityRows) {
      const name = formatProUserName(r.professional?.user);
      const at = (r.verifiedAt ?? r.updatedAt).toISOString();
      items.push({
        id: `identity-${r.id}`,
        level: activityLevelFromStatus(r.status),
        title: `Identity verification for ${name} — ${r.status}`,
        at,
      });
    }
    for (const r of educationRows) {
      const name = formatProUserName(r.professional?.user);
      const st = r.verificationStatus;
      const at = (r.verifiedAt ?? r.updatedAt).toISOString();
      items.push({
        id: `education-${r.id}`,
        level: activityLevelFromStatus(st),
        title: `Education: ${r.institutionName} — ${name} — ${st}`,
        at,
      });
    }
    for (const r of workRows) {
      const name = formatProUserName(r.professional?.user);
      const st = r.verificationStatus;
      const at = (r.verifiedAt ?? r.updatedAt).toISOString();
      items.push({
        id: `work-${r.id}`,
        level: activityLevelFromStatus(st),
        title: `Work experience at ${r.organisationName} — ${name} — ${st}`,
        at,
      });
    }
    for (const r of projectRows) {
      const name = formatProUserName(r.professional?.user);
      const st = r.verificationStatus;
      const at = (r.verifiedAt ?? r.updatedAt).toISOString();
      items.push({
        id: `project-${r.id}`,
        level: activityLevelFromStatus(st),
        title: `Project “${r.title}” — ${name} — ${st}`,
        at,
      });
    }
    for (const r of orgVerRows) {
      const company = r.organisation?.companyName ?? 'Organisation';
      const st = r.status;
      const at = (r.reviewedAt ?? r.updatedAt).toISOString();
      items.push({
        id: `org-kyb-${r.id}`,
        level: activityLevelFromStatus(st),
        title: `Organisation verification (KYB) — ${company} — ${st}`,
        at,
      });
    }
    for (const r of profileEditRows) {
      const name = formatProUserName(r.professional?.user);
      const st = r.status;
      const at = (r.reviewedAt ?? r.updatedAt).toISOString();
      items.push({
        id: `profile-edit-${r.id}`,
        level: activityLevelFromStatus(st),
        title: `Profile edit request — ${name} — ${st}`,
        at,
      });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const limited = items.slice(0, 50);

    const verificationsReviewed =
      idTot + eduTot + workTot + projTot + orgTot + editTot;
    const approvals =
      idApr + eduApr + workApr + projApr + orgApr + editApr;
    const rejections =
      idRej + eduRej + workRej + projRej + orgRej + editRej;

    return {
      activityLog: {
        items: limited,
        total: verificationsReviewed,
      },
      activitySummary: {
        verificationsReviewed,
        approvals,
        rejections,
        kybChecksRun: orgTot,
        profilesEdited: editTot,
        logins30d: 0,
      },
    };
  }

  private async assertSuperAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminProfile: true },
    });
    if (!user?.adminProfile || user.adminProfile.role !== 'super_admin') {
      throw new ForbiddenException('Only super admins can manage platform roles');
    }
    return user;
  }

  getAdminPlatformPermissionCatalog() {
    const builtinRolePresets = Object.fromEntries(
      Object.entries(BUILTIN_ADMIN_TEAM_ROLE_PERMISSION_PRESETS).map(([k, v]) => [
        k,
        [...v],
      ]),
    );
    return {
      success: true,
      data: {
        sections: ADMIN_PLATFORM_PERMISSION_CATALOG,
        builtinRolePresets,
      },
    };
  }

  async listAdminCustomRolesForTeam() {
    const rows = await this.prisma.adminCustomRole.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => {
      const keys = Array.isArray(r.permissions)
        ? (r.permissions as unknown as string[])
        : [];
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        permissionCount: keys.length,
        permissions: keys.map((k) => formatAdminPlatformPermissionKey(k)),
      };
    });
  }

  async listAdminCustomRoles() {
    return {
      success: true,
      data: { roles: await this.listAdminCustomRolesForTeam() },
    };
  }

  async getAdminCustomRole(roleId: string) {
    const row = await this.prisma.adminCustomRole.findUnique({
      where: { id: roleId },
    });
    if (!row) {
      throw new NotFoundException('Role not found');
    }
    const keys = Array.isArray(row.permissions)
      ? (row.permissions as unknown as string[])
      : [];
    return {
      success: true,
      data: {
        id: row.id,
        name: row.name,
        description: row.description,
        permissions: keys,
      },
    };
  }

  async createAdminCustomRole(userId: string, dto: CreateAdminCustomRoleDto) {
    await this.assertSuperAdmin(userId);
    if (!isValidAdminPlatformPermissionList(dto.permissions)) {
      throw new BadRequestException('Invalid permission keys for custom role');
    }
    const created = await this.prisma.adminCustomRole.create({
      data: {
        name: dto.name.trim(),
        description: (dto.description ?? '').trim(),
        permissions: dto.permissions,
      },
    });
    return {
      success: true,
      message: 'Role created',
      data: { id: created.id },
    };
  }

  async updateAdminCustomRole(
    userId: string,
    roleId: string,
    dto: UpdateAdminCustomRoleDto,
  ) {
    await this.assertSuperAdmin(userId);
    const existing = await this.prisma.adminCustomRole.findUnique({
      where: { id: roleId },
    });
    if (!existing) {
      throw new NotFoundException('Role not found');
    }
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.permissions === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }
    if (
      dto.permissions !== undefined &&
      !isValidAdminPlatformPermissionList(dto.permissions)
    ) {
      throw new BadRequestException('Invalid permission keys for custom role');
    }
    await this.prisma.adminCustomRole.update({
      where: { id: roleId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: (dto.description ?? '').trim() }
          : {}),
        ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
      },
    });
    return { success: true, message: 'Role updated' };
  }

  async getAllOrganisations(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Filter out pending registrations (temp emails or "Pending Registration" company name)
    const whereClause: any = {
      AND: [
        {
          user: {
            email: {
              not: {
                contains: '@registration.temp',
              },
            },
            status: {
              not: 'UNVERIFIED',
            },
          },
        },
        {
          companyName: {
            not: 'Pending Registration',
          },
        },
      ],
    };

    const [organisations, total] = await Promise.all([
      this.prisma.organisation.findMany({
        where: whereClause,
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
          jobs: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organisation.count({ where: whereClause }),
    ]);

    // Parse description and add job counts
    const organisationsWithData = organisations.map((org) => {
      // Parse description - can be JSON or plain text
      let descriptionText = '';
      let categoryData: any = {};

      if (org.description) {
        try {
          if (
            typeof org.description === 'string' &&
            org.description.trim().startsWith('{')
          ) {
            // It's JSON, parse it
            const parsed = JSON.parse(org.description);
            // Extract text description
            descriptionText = parsed.textDescription || '';
            // Extract category data
            if (
              parsed.category ||
              parsed.schoolType ||
              parsed.religiousOrgType
            ) {
              categoryData = {
                category: parsed.category || null,
                schoolType: parsed.schoolType || null,
                religiousOrgType: parsed.religiousOrgType || null,
                internationalOrgType: parsed.internationalOrgType || null,
                politicalPartyCountry: parsed.politicalPartyCountry || null,
                associatedSchool: parsed.associatedSchool || null,
              };
            }
          } else {
            // It's plain text
            descriptionText = org.description;
          }
        } catch (e) {
          // Not valid JSON, treat as plain text
          descriptionText = org.description;
        }
      }

      // Count published jobs
      const publishedJobsCount =
        (org as any).jobs?.filter((job: any) => job.status === 'published')
          .length || 0;

      return {
        ...org,
        description: descriptionText,
        category: categoryData,
        jobCount: publishedJobsCount,
      };
    });

    return {
      success: true,
      data: {
        organisations: organisationsWithData,
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

    const whereClause: any = {
      user: {
        email: {
          not: { contains: '@registration.temp' },
        },
      },
    };

    const [professionals, total] = await Promise.all([
      this.prisma.professional.findMany({
        where: whereClause,
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
      this.prisma.professional.count({ where: whereClause }),
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

  async getProfessionalById(id: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            phoneNumber: true,
            phoneVerified: true,
            emailVerified: true,
          },
        },
        identityVerification: true,
        education: {
          orderBy: { createdAt: 'desc' },
        },
        workExperience: {
          orderBy: { createdAt: 'desc' },
        },
        professionalProjects: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Type assertion to include description and socialMedia fields
    const professionalWithExtras = professional as any;
    const { professionalProjects, ...professionalRest } = professional as any;

    return {
      success: true,
      data: {
        ...professionalRest,
        professionalProjects,
        projects: professionalProjects ?? [],
        description: professionalWithExtras.description || null,
        socialMedia: professionalWithExtras.socialMedia || {},
        profileImageUrl: professionalWithExtras.profileImageUrl || null,
        profileImage:
          professionalWithExtras.profileImageUrl ||
          professionalWithExtras.profileImage ||
          null,
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

  async getAllTransactions(
    page: number = 1,
    limit: number = 20,
    status: string = 'all',
    type: string = 'all',
    entityType: string = 'all',
    search: string = '',
  ) {
    const skip = (page - 1) * limit;

    // Fetch all organisations with payment data
    const organisations = await this.prisma.organisation.findMany({
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
    });

    // Fetch all professionals with payment data
    const professionals = await this.prisma.professional.findMany({
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
    });

    const allTransactions: any[] = [];
    const statusMatches = (transactionStatus: string) =>
      status === 'all' ||
      status === transactionStatus ||
      (status === 'success' && transactionStatus === 'completed') ||
      (status === 'completed' && transactionStatus === 'success') ||
      (status === 'failed' && transactionStatus === 'declined');
    const typeMatches = (transactionType: string) =>
      type === 'all' || type === transactionType;

    const ledgerRows =
      await this.prisma.organisationBillingTransaction.findMany({
        include: {
          organisation: {
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
          },
        },
      });

    for (const row of ledgerRows) {
      if (!statusMatches(row.status) || !typeMatches(row.type)) continue;
      allTransactions.push({
        id: row.reference || row.id,
        amount: row.amountNgn,
        amountNgn: row.amountNgn,
        currency: 'NGN',
        status: row.status === 'completed' ? 'success' : row.status,
        type: row.type,
        description: row.description,
        entityType: 'organisation',
        entityId: row.organisationId,
        entityName:
          row.organisation.companyName ||
          `${row.organisation.user.firstName} ${row.organisation.user.lastName}`,
        createdAt: row.occurredAt,
        reference: row.reference,
        user: {
          email: row.organisation.user.email,
          firstName: row.organisation.user.firstName,
          lastName: row.organisation.user.lastName,
        },
      });
    }

    // Extract transactions from organisations
    for (const org of organisations) {
      const addressData = (org.address as any) || {};
      const subscriptionPlan = addressData.subscriptionPlan || 'starter';
      const pendingPayment = addressData.pendingPayment;

      // If there's an unresolved pending/declined payment, add it as a transaction
      if (pendingPayment && pendingPayment.status !== 'completed') {
        const transactionStatus = pendingPayment.status || 'pending';
        const kind = pendingPayment.kind || 'subscription';
        const isWallet = kind === 'wallet_topup';

        // Only include if status matches filter
        if (
          statusMatches(transactionStatus) &&
          typeMatches(isWallet ? 'wallet_topup' : 'subscription')
        ) {
          allTransactions.push({
            id: pendingPayment.reference || `org-${org.id}-${Date.now()}`,
            amount:
              pendingPayment.amountNgn ??
              Math.round(Number(pendingPayment.amount || 0) * 1550),
            amountNgn:
              pendingPayment.amountNgn ??
              Math.round(Number(pendingPayment.amount || 0) * 1550),
            currency: 'NGN',
            status:
              transactionStatus === 'completed' ? 'success' : transactionStatus,
            type: isWallet ? 'wallet_topup' : 'subscription',
            description: isWallet
              ? `Wallet top-up (${pendingPayment.ttkAmount ?? 0} TTK)`
              : `Subscription payment for ${pendingPayment.plan || subscriptionPlan} plan`,
            entityType: 'organisation',
            entityId: org.id,
            entityName:
              org.companyName || `${org.user.firstName} ${org.user.lastName}`,
            plan: pendingPayment.plan || subscriptionPlan,
            billingCycle: pendingPayment.billingCycle || 'monthly',
            createdAt: pendingPayment.initiatedAt || org.createdAt,
            user: {
              email: org.user.email,
              firstName: org.user.firstName,
              lastName: org.user.lastName,
            },
          });
        }
      }

      // If subscription plan is set and not starter, consider it a successful transaction
      if (subscriptionPlan !== 'starter' && !pendingPayment) {
        const transactionStatus = 'success';

        if (statusMatches(transactionStatus) && typeMatches('subscription')) {
          // Get plan pricing
          const planPricing: { [key: string]: number } = {
            standard: 99,
            recruiter: 299,
            enterprise: 999,
          };
          const amount = planPricing[subscriptionPlan] || 0;

          allTransactions.push({
            id: `org-success-${org.id}`,
            amount,
            currency: 'USD',
            status: 'success',
            type: 'subscription',
            description: `Active subscription: ${subscriptionPlan} plan`,
            entityType: 'organisation',
            entityId: org.id,
            entityName:
              org.companyName || `${org.user.firstName} ${org.user.lastName}`,
            plan: subscriptionPlan,
            billingCycle: 'monthly',
            createdAt: org.updatedAt || org.createdAt,
            user: {
              email: org.user.email,
              firstName: org.user.firstName,
              lastName: org.user.lastName,
            },
          });
        }
      }
    }

    // Extract transactions from professionals
    // Professional payments would be stored in a similar way if implemented
    // For now, we focus on organisation transactions which are actively used

    let filtered = allTransactions;
    const q = (search || '').trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((t) => {
        const parts = [
          t.id,
          t.description,
          t.entityName,
          t.user?.email,
          t.type,
          t.plan,
          t.reference,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return parts.includes(q);
      });
    }
    if (entityType === 'organisation' || entityType === 'professional') {
      filtered = filtered.filter((t) => t.entityType === entityType);
    }

    // Sort by creation date (newest first)
    filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Apply pagination
    const total = filtered.length;
    const paginatedTransactions = filtered.slice(skip, skip + limit);

    return {
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getTransaction(transactionId: string) {
    const ledgerRow =
      await this.prisma.organisationBillingTransaction.findFirst({
        where: {
          OR: [{ id: transactionId }, { reference: transactionId }],
        },
        include: {
          organisation: {
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
          },
        },
      });

    if (ledgerRow) {
      const meta = (ledgerRow.metadata as any) || null;
      return {
        success: true,
        data: {
          id: ledgerRow.reference || ledgerRow.id,
          amount: ledgerRow.amountNgn,
          amountNgn: ledgerRow.amountNgn,
          currency: 'NGN',
          status:
            ledgerRow.status === 'completed' ? 'success' : ledgerRow.status,
          type: ledgerRow.type,
          description: ledgerRow.description,
          entityType: 'organisation',
          entityId: ledgerRow.organisationId,
          entityName:
            ledgerRow.organisation.companyName ||
            `${ledgerRow.organisation.user.firstName} ${ledgerRow.organisation.user.lastName}`,
          createdAt: ledgerRow.occurredAt,
          user: {
            email: ledgerRow.organisation.user.email,
            firstName: ledgerRow.organisation.user.firstName,
            lastName: ledgerRow.organisation.user.lastName,
          },
          validation: meta
            ? {
                adminName: meta.adminName || 'Admin',
                reason: meta.reason || '',
                proofOfPayment: meta.proofOfPayment || null,
                validatedAt:
                  meta.validatedAt || meta.declinedAt || ledgerRow.occurredAt,
                outcome:
                  ledgerRow.status === 'failed' ? 'declined' : 'validated',
              }
            : null,
        },
      };
    }

    // Fetch all organisations to find the transaction
    const organisations = await this.prisma.organisation.findMany({
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
    });

    // Search for the transaction in organisations
    for (const org of organisations) {
      const addressData = (org.address as any) || {};
      const pendingPayment = addressData.pendingPayment;
      const subscriptionPlan = addressData.subscriptionPlan || 'starter';
      const validationData = addressData.paymentValidation;

      // Check if this is the transaction we're looking for
      if (pendingPayment && pendingPayment.reference === transactionId) {
        const transactionStatus = pendingPayment.status || 'pending';
        const kind = pendingPayment.kind || 'subscription';
        const isWallet = kind === 'wallet_topup';

        return {
          success: true,
          data: {
            id: transactionId,
            amount:
              pendingPayment.amountNgn ??
              Math.round(Number(pendingPayment.amount || 0) * 1550),
            amountNgn:
              pendingPayment.amountNgn ??
              Math.round(Number(pendingPayment.amount || 0) * 1550),
            currency: 'NGN',
            status:
              transactionStatus === 'completed' ? 'success' : transactionStatus,
            type: isWallet ? 'wallet_topup' : 'subscription',
            kind,
            description: isWallet
              ? `Wallet top-up (${pendingPayment.ttkAmount ?? 0} TTK)`
              : `Subscription payment for ${pendingPayment.plan || subscriptionPlan} plan`,
            entityType: 'organisation',
            entityId: org.id,
            entityName:
              org.companyName || `${org.user.firstName} ${org.user.lastName}`,
            plan: pendingPayment.plan || subscriptionPlan,
            billingCycle: pendingPayment.billingCycle || 'monthly',
            ttkAmount: pendingPayment.ttkAmount,
            paymentLink: pendingPayment.paymentLink,
            createdAt: pendingPayment.initiatedAt || org.createdAt,
            user: {
              email: org.user.email,
              firstName: org.user.firstName,
              lastName: org.user.lastName,
            },
            validation: pendingPayment.declinedAt
              ? {
                  adminName: pendingPayment.declinedBy || 'Admin',
                  reason: pendingPayment.declineReason || 'Payment declined',
                  validatedAt: pendingPayment.declinedAt,
                  outcome: 'declined',
                }
              : validationData || null,
          },
        };
      }

      // Check for successful transactions (when subscriptionPlan is set)
      if (subscriptionPlan !== 'starter' && !pendingPayment) {
        const planPricing: { [key: string]: number } = {
          standard: 99,
          recruiter: 299,
          enterprise: 999,
        };
        const amount = planPricing[subscriptionPlan] || 0;
        const successTransactionId = `org-success-${org.id}`;

        if (successTransactionId === transactionId) {
          return {
            success: true,
            data: {
              id: transactionId,
              amount,
              currency: 'USD',
              status: 'success',
              type: 'subscription',
              description: `Active subscription: ${subscriptionPlan} plan`,
              entityType: 'organisation',
              entityId: org.id,
              entityName:
                org.companyName || `${org.user.firstName} ${org.user.lastName}`,
              plan: subscriptionPlan,
              billingCycle: 'monthly',
              createdAt: org.updatedAt || org.createdAt,
              user: {
                email: org.user.email,
                firstName: org.user.firstName,
                lastName: org.user.lastName,
              },
              validation: validationData || null,
            },
          };
        }
      }
    }

    throw new NotFoundException('Transaction not found');
  }

  async validatePayment(
    adminUserId: string,
    transactionId: string,
    reason: string,
    proofOfPayment?: string,
  ) {
    // Fetch admin user to get name
    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: {
        firstName: true,
        lastName: true,
      },
    });

    const adminName = adminUser
      ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() ||
        'Admin'
      : 'Admin';
    // Find the transaction
    const transaction = await this.getTransaction(transactionId);

    if (!transaction.data) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.data.status !== 'pending') {
      throw new BadRequestException(
        'Only pending transactions can be validated',
      );
    }

    const entityId = transaction.data.entityId;
    const entityType = transaction.data.entityType;

    if (entityType === 'organisation') {
      const organisation = await this.prisma.organisation.findUnique({
        where: { id: entityId },
      });

      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }

      const addressData = (organisation.address as any) || {};
      const pendingPayment = addressData.pendingPayment;

      if (!pendingPayment || pendingPayment.reference !== transactionId) {
        throw new NotFoundException('Transaction not found');
      }

      const kind = pendingPayment.kind || 'subscription';
      const validatedAt = new Date().toISOString();

      if (kind === 'wallet_topup') {
        const ttk = Number(pendingPayment.ttkAmount) || 0;
        if (ttk < 1) {
          throw new BadRequestException(
            'Invalid token amount on pending payment',
          );
        }
        const amtNgn = Number(pendingPayment.amountNgn) || Math.round(ttk * 35);
        const balance = Number(addressData.walletTokenBalance ?? 0);
        const nextBal = balance + ttk;
        const nextAddr: Record<string, unknown> = { ...addressData };
        delete nextAddr.pendingPayment;
        nextAddr.walletTokenBalance = nextBal;
        nextAddr.walletApproxNgn = Math.round(nextBal * 35);
        nextAddr.walletApproxUsd = Math.round(nextBal * 0.05 * 100) / 100;
        nextAddr.lastWalletTopUp = {
          adminUserId,
          adminName,
          reason,
          validatedAt,
          ttkAmount: ttk,
        };

        await this.prisma.organisation.update({
          where: { id: entityId },
          data: { address: nextAddr as any },
        });

        const invNo = `INV-${Date.now().toString(36).toUpperCase()}`;
        await this.prisma.organisationBillingTransaction.create({
          data: {
            organisationId: entityId,
            occurredAt: new Date(),
            status: 'completed',
            type: 'credit',
            amountNgn: amtNgn,
            ttkDelta: ttk,
            ttkColor: 'teal',
            description: `Wallet top-up — ${ttk} TTK`,
            reference: transactionId,
            metadata: {
              adminUserId,
              adminName,
              reason,
              proofOfPayment: proofOfPayment || null,
              validatedAt,
            },
          },
        });
        await this.prisma.organisationInvoice.create({
          data: {
            organisationId: entityId,
            invoiceNumber: invNo,
            issuedAt: new Date(),
            amountNgn: amtNgn,
            status: 'paid',
            description: `Token purchase — ${ttk} TTK`,
          },
        });

        return {
          success: true,
          message: 'Wallet top-up validated successfully',
          data: {
            transactionId,
            status: 'success',
            validation: {
              adminUserId,
              adminName,
              reason,
              proofOfPayment: proofOfPayment || null,
              validatedAt,
            },
          },
        };
      }

      await this.prisma.organisation.update({
        where: { id: entityId },
        data: {
          address: {
            ...addressData,
            pendingPayment: {
              ...pendingPayment,
              status: 'completed',
              validatedAt,
            },
            paymentValidation: {
              adminUserId,
              adminName,
              reason,
              proofOfPayment: proofOfPayment || null,
              validatedAt,
            },
            subscriptionPlan:
              pendingPayment.plan || addressData.subscriptionPlan,
          },
        },
      });

      const planSlug = String(
        pendingPayment.plan || addressData.subscriptionPlan || 'starter',
      );
      const billingCycle = String(pendingPayment.billingCycle || 'monthly');
      const planRow = await this.prisma.billingSubscriptionPlan.findFirst({
        where: {
          entityType: BillingEntityType.organisation,
          planSlug,
          isActive: true,
        },
      });
      const cycle = billingCycle.toLowerCase();
      const isAnnual = cycle === 'yearly' || cycle === 'annual';
      let amountNgn = 0;
      if (planRow) {
        amountNgn =
          isAnnual && planRow.priceAnnualNgn != null
            ? planRow.priceAnnualNgn
            : (planRow.priceMonthlyNgn ??
              Math.round(Number(planRow.priceMonthlyUsd) * 1550));
      } else {
        amountNgn = Math.round(Number(pendingPayment.amount || 0) * 1550);
      }
      if (planSlug === 'recruiter' && !isAnnual && !planRow?.priceMonthlyNgn) {
        amountNgn = 35000;
      }

      const invNoSub = `INV-${Date.now().toString(36).toUpperCase()}`;
      await this.prisma.organisationBillingTransaction.create({
        data: {
          organisationId: entityId,
          occurredAt: new Date(),
          status: 'completed',
          type: 'subscription',
          amountNgn,
          description: `${planSlug} plan — ${billingCycle}`,
          reference: transactionId,
          metadata: {
            adminUserId,
            adminName,
            reason,
            proofOfPayment: proofOfPayment || null,
            validatedAt,
          },
        },
      });
      await this.prisma.organisationInvoice.create({
        data: {
          organisationId: entityId,
          invoiceNumber: invNoSub,
          issuedAt: new Date(),
          amountNgn,
          status: 'paid',
          description: `Subscription — ${planSlug} (${billingCycle})`,
        },
      });

      return {
        success: true,
        message: 'Payment validated successfully',
        data: {
          transactionId,
          status: 'success',
          validation: {
            adminUserId,
            adminName,
            reason,
            proofOfPayment: proofOfPayment || null,
            validatedAt,
          },
        },
      };
    }

    throw new BadRequestException('Unsupported entity type');
  }

  async declinePayment(
    adminUserId: string,
    transactionId: string,
    reason: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Decline reason is required');
    }

    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: {
        firstName: true,
        lastName: true,
      },
    });

    const adminName = adminUser
      ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() ||
        'Admin'
      : 'Admin';

    const transaction = await this.getTransaction(transactionId);
    if (!transaction.data) {
      throw new NotFoundException('Transaction not found');
    }
    if (transaction.data.status !== 'pending') {
      throw new BadRequestException(
        'Only pending transactions can be declined',
      );
    }

    if (transaction.data.entityType !== 'organisation') {
      throw new BadRequestException('Unsupported entity type');
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { id: transaction.data.entityId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const addressData = (organisation.address as any) || {};
    const pendingPayment = addressData.pendingPayment;
    if (!pendingPayment || pendingPayment.reference !== transactionId) {
      throw new NotFoundException('Transaction not found');
    }

    const declinedAt = new Date().toISOString();
    await this.prisma.organisation.update({
      where: { id: transaction.data.entityId },
      data: {
        address: {
          ...addressData,
          pendingPayment: {
            ...pendingPayment,
            status: 'declined',
            declinedAt,
            declinedBy: adminName,
            declineReason: reason.trim(),
          },
        },
      },
    });

    await this.prisma.organisationBillingTransaction.create({
      data: {
        organisationId: transaction.data.entityId,
        occurredAt: new Date(),
        status: 'failed',
        type: transaction.data.type || 'payment',
        amountNgn:
          Number(transaction.data.amountNgn) ||
          Math.round(Number(transaction.data.amount || 0) * 1550),
        ttkDelta: null,
        ttkColor: null,
        description: `${transaction.data.description || 'Payment'} — declined`,
        reference: transactionId,
        metadata: {
          adminUserId,
          adminName,
          reason: reason.trim(),
          declinedAt,
        },
      },
    });

    return {
      success: true,
      message: 'Payment declined successfully',
      data: {
        transactionId,
        status: 'declined',
        validation: {
          adminUserId,
          adminName,
          reason: reason.trim(),
          declinedAt,
        },
      },
    };
  }

  async createJob(
    userId: string,
    organisationId: string | undefined,
    createJobDto: any,
  ) {
    // If no organisationId provided, get the first available organisation
    let orgId = organisationId;

    if (!orgId) {
      const firstOrg = await this.prisma.organisation.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      if (!firstOrg) {
        throw new NotFoundException(
          'No organisation found. Please create an organisation first.',
        );
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
        department: createJobDto.department ?? null,
        location: createJobDto.location,
        workMode: createJobDto.workMode as any,
        employmentType: createJobDto.employmentType as any,
        experienceYears: createJobDto.experienceYears,
        jobLevel: createJobDto.jobLevel ?? null,
        pay: createJobDto.pay as any,
        startDate: createJobDto.startDate
          ? new Date(createJobDto.startDate)
          : null,
        endDate: createJobDto.endDate ? new Date(createJobDto.endDate) : null,
        closingDate: createJobDto.closingDate
          ? new Date(createJobDto.closingDate)
          : null,
        description: createJobDto.description ?? '',
        requirements: createJobDto.requirements || [],
        applyCTA: createJobDto.applyCTA as any,
        qualifyingQuestions: createJobDto.qualifyingQuestions ?? null,
        requiredApplicantData:
          createJobDto.requiredApplicantData?.length > 0
            ? createJobDto.requiredApplicantData
            : ['full_name', 'email'],
        distributionChannels:
          createJobDto.distributionChannels?.length > 0
            ? createJobDto.distributionChannels
            : ['taldium_network'],
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

  private mapBillingPlanToAdmin(row: {
    id: string;
    planSlug: string;
    entityType: BillingEntityType;
    name: string;
    description: string;
    priceMonthlyUsd: unknown;
    priceAnnualUsd: unknown | null;
    priceMonthlyNgn: number | null;
    priceAnnualNgn: number | null;
    features: unknown;
    displayOrder: number;
    isActive: boolean;
  }) {
    const feats = Array.isArray(row.features) ? (row.features as string[]) : [];
    return {
      recordId: row.id,
      id: row.planSlug,
      name: row.name,
      description: row.description,
      price: Number(row.priceMonthlyUsd),
      priceAnnualUsd:
        row.priceAnnualUsd != null ? Number(row.priceAnnualUsd) : null,
      priceMonthlyNgn: row.priceMonthlyNgn,
      priceAnnualNgn: row.priceAnnualNgn,
      features: feats,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      entityType:
        row.entityType === BillingEntityType.organisation
          ? 'organisation'
          : 'professional',
    };
  }

  async getSubscriptionPlans(entityType?: 'professional' | 'organisation') {
    await ensureDefaultBillingPlans(this.prisma);

    const listFor = async (et: BillingEntityType) => {
      const rows = await this.prisma.billingSubscriptionPlan.findMany({
        where: { entityType: et },
        orderBy: { displayOrder: 'asc' },
      });
      return rows.map((r) => this.mapBillingPlanToAdmin(r));
    };

    if (entityType === 'professional') {
      return {
        success: true,
        data: await listFor(BillingEntityType.professional),
      };
    }
    if (entityType === 'organisation') {
      return {
        success: true,
        data: await listFor(BillingEntityType.organisation),
      };
    }

    const [professional, organisation] = await Promise.all([
      listFor(BillingEntityType.professional),
      listFor(BillingEntityType.organisation),
    ]);

    return {
      success: true,
      data: {
        professional,
        organisation,
      },
    };
  }

  async createBillingPlan(dto: CreateBillingPlanDto) {
    await ensureDefaultBillingPlans(this.prisma);
    const planSlug = dto.planSlug.trim().toLowerCase().replace(/\s+/g, '-');
    const existing = await this.prisma.billingSubscriptionPlan.findUnique({
      where: {
        entityType_planSlug: {
          entityType: dto.entityType,
          planSlug,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'A plan with this slug already exists for this entity type',
      );
    }
    const row = await this.prisma.billingSubscriptionPlan.create({
      data: {
        planSlug,
        entityType: dto.entityType,
        name: dto.name,
        description: dto.description,
        priceMonthlyUsd: dto.priceMonthlyUsd,
        priceAnnualUsd: dto.priceAnnualUsd ?? null,
        priceMonthlyNgn: dto.priceMonthlyNgn ?? null,
        priceAnnualNgn: dto.priceAnnualNgn ?? null,
        features: dto.features ?? [],
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return {
      success: true,
      message: 'Billing plan created',
      data: this.mapBillingPlanToAdmin(row),
    };
  }

  async updateBillingPlan(planRecordId: string, dto: UpdateBillingPlanDto) {
    await ensureDefaultBillingPlans(this.prisma);
    const existing = await this.prisma.billingSubscriptionPlan.findUnique({
      where: { id: planRecordId },
    });
    if (!existing) {
      throw new NotFoundException('Billing plan not found');
    }
    const row = await this.prisma.billingSubscriptionPlan.update({
      where: { id: planRecordId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priceMonthlyUsd !== undefined && {
          priceMonthlyUsd: dto.priceMonthlyUsd,
        }),
        ...(dto.priceAnnualUsd !== undefined && {
          priceAnnualUsd: dto.priceAnnualUsd,
        }),
        ...(dto.priceMonthlyNgn !== undefined && {
          priceMonthlyNgn: dto.priceMonthlyNgn,
        }),
        ...(dto.priceAnnualNgn !== undefined && {
          priceAnnualNgn: dto.priceAnnualNgn,
        }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    return {
      success: true,
      message: 'Billing plan updated',
      data: this.mapBillingPlanToAdmin(row),
    };
  }

  async updateJobStatus(jobId: string, status: string) {
    const validStatuses = ['draft', 'published', 'paused', 'closed'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
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

    // Send verification email
    const html = `
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0">
     
              <!-- Greeting -->
              <tr>
                <td style="padding-bottom: 4px;">
                  <h2>Hi ${user.firstName},</h2>
                </td>
              </tr>
     
              <!-- Intro text -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <p>Your Taldium profile has been fully verified and activated. You now have access to the complete Taldium network — a trusted space where professionals and organisations interact with confidence.</p>
                </td>
              </tr>
     
               <!-- Verified Banner -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <table width="100%" cellpadding="16" cellspacing="0" border="1" bordercolor="#c3e6cb">
                    <tr>
                      <td>
                        ✅ <strong>Profile Active on Taldium Network</strong><br />
                        Identity · Location · Work · Education — all verified
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
              <!-- What You Can Do Now Label -->
              <tr>
                <td style="padding-bottom: 12px;">
                  <p><small>WHAT YOU CAN DO NOW</small></p>
                </td>
              </tr>
    
              <!-- Feature Grid Row 1 -->
              <tr>
                <td style="padding-bottom: 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              🧳 <strong>Apply for Jobs</strong><br />
                              Discover and apply to roles at verified organisations
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              🏢 <strong>Connect with Orgs</strong><br />
                              Interact directly with verified organisations
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
              <!-- Feature Grid Row 2 -->
              <tr>
                <td style="padding-bottom: 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              💡 <strong>Share Ideas</strong><br />
                              Post thoughts, insights and professional updates
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              🔒 <strong>Manage Your Data</strong><br />
                              Control your identity data and privacy settings
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
              <!-- Feature Grid Row 3 -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              ⚡ <strong>Enjoy Services</strong><br />
                              Access trust-gated services for verified professionals
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              🌐 <strong>Verified Network</strong><br />
                              Engage with professionals across the network
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
              <!-- CTA Button -->
              <tr>
                <td style="padding-bottom: 32px;">
                  <a href="#">Go to My Dashboard →</a>
                </td>
              </tr>
     
            </table>
          </td>
        </tr>
      </table>
        `;

    this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
      to: user.email.toLowerCase(),
      subject: `Congratulations, ${user.firstName}. You're verified`,
      html: html,
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

  async updateOrganisationVerificationStatus(
    orgId: string,
    status: string,
    adminUserId: string,
  ) {
    const validStatuses = [
      'verified',
      'under_review',
      'pending',
      'rejected',
      'not_activated',
    ];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      include: {
        user: {
          select: { email: true },
        },
      },
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
    if (
      status === 'verified' ||
      status === 'under_review' ||
      status === 'rejected'
    ) {
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

    if (status === 'verified') {
      // Send email
      const html = `
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0">
     
              <!-- Greeting -->
              <tr>
                <td style="padding-bottom: 4px;">
                  <h2>Hello ${organisation.companyName},</h2>
                </td>
              </tr>
     
              <!-- Intro text -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <p>Your Taldium organisation account has been fully verified and activated. Your profile is now live and discoverable by verified professionals across the network.</p>
                </td>
              </tr>
     
               <!-- Verified Banner -->
              <tr>
                <td style="padding-bottom: 24px;">
                  <table width="100%" cellpadding="16" cellspacing="0" border="1" bordercolor="#c3e6cb">
                    <tr>
                      <td>
                        ✅ <strong>${organisation.companyName} — Verified Organisation</strong><br />
                        Active and discoverable on the Taldium network
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
              <!-- What You Can Do Now Label -->
              <tr>
                <td style="padding-bottom: 12px;">
                  <p><small>WHAT TALDIUM UNLOCKS FOR YOUR ORGANISATION</small></p>
                </td>
              </tr>
    
              <!-- Feature Grid Row 1 -->
              <tr>
                <td style="padding-bottom: 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              📋 <strong>Create Job Roles</strong><br />
                              Post positions and receive verified applicants
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              📂 <strong>Manage Applicants</strong><br />
                              Review, track and manage all job applicants
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              📣 <strong>Brand Communication</strong><br />
                              Manage your organisation's voice on Taldium
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
              <!-- Feature Grid Row 2 -->
              <tr>
                <td style="padding-bottom: 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              🔍 <strong>Scout Talent</strong><br />
                              Discover and reach out to verified professionals
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              👥 <strong>Invite Your Team</strong><br />
                              Add team members and delegate access securely
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top">
                        <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                          <tr>
                            <td>
                              🤝 <strong>Interact with Orgs</strong><br />
                              Connect with other verified organisations
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
            
              <!-- CTA Button -->
              <tr>
                <td style="padding-bottom: 32px;">
                  <a href="#">Go to Organisation Dashboard →</a>
                </td>
              </tr>


            <tr>
            <td style="padding-bottom: 16px;">
              <table width="100%" cellpadding="12" cellspacing="0" border="1" bordercolor="#e0e0e0">
                <tr>
                  <td>
                    <strong>ℹ Your verified badge:</strong> The Taldium verification mark on your profile signals to all professionals that Bramble Inc is a legitimate, trusted organisation — giving your postings and outreach a credibility edge.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

     
            </table>
          </td>
        </tr>
      </table>
        `;
      this.eventEmitter.emit(AuthServiceEvents.SEND_VERIFICATION_EMAIL, {
        to: organisation.user.email.toLowerCase(),
        subject: `Congratulations, ${organisation.companyName}.`,
        html: html,
      });
    }

    return {
      success: true,
      message: 'Organisation verification status updated',
      data: updated,
    };
  }

  async approveProfessionalVerification(
    profId: string,
    type: 'identity' | 'education' | 'experience' | 'project',
    verificationId: string,
    adminUserId: string,
    status: 'verified' | 'rejected' = 'verified',
  ) {
    const isVerified = status === 'verified';
    const verifiedAt = isVerified ? new Date() : null;

    if (type === 'identity') {
      await this.prisma.identityVerification.update({
        where: { id: verificationId },
        data: {
          status: status as any,
          verifiedAt,
          reviewedBy: adminUserId,
        },
      });

      await this.prisma.professional.update({
        where: { id: profId },
        data: {
          identityStatus: (status as any) || undefined,
          identityVerified: isVerified,
        },
      });
    } else if (type === 'education') {
      await this.prisma.education.update({
        where: { id: verificationId },
        data: {
          verificationStatus: status as any,
          verifiedAt,
          reviewedBy: adminUserId,
        },
      });
    } else if (type === 'experience') {
      await this.prisma.workExperience.update({
        where: { id: verificationId },
        data: {
          verificationStatus: status as any,
          verifiedAt,
          reviewedBy: adminUserId,
        },
      });
    } else if (type === 'project') {
      await this.prisma.professionalProject.update({
        where: { id: verificationId },
        data: {
          verificationStatus: status as any,
          verifiedAt,
          reviewedBy: adminUserId,
        },
      });
    }

    return {
      success: true,
      message:
        status === 'verified'
          ? 'Verification approved successfully'
          : 'Verification rejected',
    };
  }

  async approveProfessionalLocation(
    profId: string,
    locationIndex: number,
    adminUserId: string,
    status: 'verified' | 'rejected' = 'verified',
  ) {
    if (!Number.isInteger(locationIndex) || locationIndex < 0) {
      throw new BadRequestException('Invalid location index');
    }

    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const prof = professional as Record<string, unknown>;
    const locationsJson = prof['locations'];
    const locationsArr: unknown[] = Array.isArray(locationsJson)
      ? [...locationsJson]
      : locationsJson != null && typeof locationsJson === 'object'
        ? [{ ...(locationsJson as object) }]
        : [];

    if (locationIndex >= locationsArr.length) {
      throw new BadRequestException('Invalid location index');
    }

    const next = locationsArr.map((loc, i) => {
      if (i !== locationIndex) return loc;
      if (!loc || typeof loc !== 'object') {
        throw new BadRequestException('Invalid location entry');
      }
      return {
        ...(loc as object),
        verificationStatus: status,
        locationReviewedBy: adminUserId,
        locationReviewedAt: new Date().toISOString(),
      };
    });

    await this.prisma.professional.update({
      where: { id: profId },
      data: { locations: next as any },
    });

    return {
      success: true,
      message:
        status === 'verified'
          ? 'Location verification approved'
          : 'Location verification rejected',
    };
  }

  async markProfessionalVerificationComplete(
    profId: string,
    adminUserId: string,
  ) {
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
      include: {
        identityVerification: true,
        education: true,
        workExperience: true,
        professionalProjects: true,
      },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const identityOk =
      professional.identityStatus === 'verified' &&
      professional.identityVerification?.status === 'verified';
    const educationOk =
      professional.education.length === 0 ||
      professional.education.every(
        (e) =>
          e.verificationStatus === 'verified' ||
          e.verificationStatus === 'rejected',
      );
    const workOk =
      professional.workExperience.length === 0 ||
      professional.workExperience.every(
        (w) =>
          w.verificationStatus === 'verified' ||
          w.verificationStatus === 'rejected',
      );
    const projectsOk =
      professional.professionalProjects.length === 0 ||
      professional.professionalProjects.every(
        (p) =>
          p.verificationStatus === 'verified' ||
          p.verificationStatus === 'rejected',
      );

    if (!identityOk || !educationOk || !workOk || !projectsOk) {
      throw new BadRequestException(
        'Cannot verify professional: identity must be verified and all education/work/project items must be verified or rejected (no pending).',
      );
    }

    const updated = await this.prisma.professional.update({
      where: { id: profId },
      data: { verifiedByAdminAt: new Date() },
    });

    return {
      success: true,
      message: 'Professional marked as fully verified',
      data: { verifiedByAdminAt: updated.verifiedByAdminAt },
    };
  }

  private generateToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}
