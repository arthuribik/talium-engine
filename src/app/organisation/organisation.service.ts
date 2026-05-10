import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';
import { KybIncorporationDto } from './dto/kyb-incorporation.dto';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';
import { BillingEntityType, Prisma } from '@prisma/client';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { InitiateWalletFundDto } from './dto/initiate-wallet-fund.dto';
import { ensureDefaultBillingPlans } from '../billing/billing-plans.seed';
import { CreateJobDto } from '../job/dto/create-job.dto';
import { ResendEntity } from '../../utility/mail';
import { S3Service } from '../../utility/s3/s3.service';
import {
  SETTINGS_ORG_ROLE_ORDER,
  SYSTEM_ROLE_DEFINITIONS,
  formatPermissionLabel,
} from './organisation-roles.config';
import {
  PERMISSION_CATALOG_SECTIONS,
  formatPermissionKeyForDisplay,
  isValidCustomRolePermissionList,
  isValidGranularPermissionList,
} from './organisation-granular-permissions.config';
import {
  INTEGRATION_CATALOG,
  isIntegrationProvider,
} from './organisation-integrations.config';
import {
  CreateOrganisationCustomRoleDto,
  UpdateOrganisationCustomRoleDto,
} from './dto/organisation-custom-role.dto';

@Injectable()
export class OrganisationService {
  /** Accept pasted LinkedIn URLs without a scheme. */
  private normalizeLinkedInUrl(raw: string | undefined | null): string | null {
    if (raw == null || typeof raw !== 'string') return null;
    const t = raw.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    return `https://${t}`;
  }

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly mailService: ResendEntity,
    private readonly s3: S3Service,
  ) {}

  async getOrganisationProfile(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
      },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Extract address and social media from address JSON
    const addressData = (organisation.address as any) || {};
    const socialMedia = addressData.socialMedia || {};

    // Parse description field - can be plain text or JSON with category data
    let descriptionText = '';
    let categoryData: any = {};

    if (organisation.description) {
      try {
        if (organisation.description.trim().startsWith('{')) {
          // It's JSON, parse it
          const parsed = JSON.parse(organisation.description);
          // Extract text description
          descriptionText = parsed.textDescription || '';
          // Extract category data
          if (parsed.category || parsed.schoolType || parsed.religiousOrgType) {
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
          descriptionText = organisation.description;
        }
      } catch (e) {
        // Not valid JSON, treat as plain text
        descriptionText = organisation.description;
      }
    }

    // Extract headquarters - check for separate fields first, then fall back to address city/country
    // Headquarters might be stored separately or might be the same as address location
    const headquartersCity =
      addressData.headquartersCity || addressData.city || null;
    const headquartersCountry =
      addressData.headquartersCountry || addressData.country || null;

    // Format founded date from yearOfCommencement
    const foundedDate = organisation.yearOfCommencement
      ? `${organisation.yearOfCommencement}-01-01`
      : null;

    // Determine legalName and organisationName based on registration status
    // For registered: companyName is the legalName
    // For non-registered: companyName is the organisationName
    const legalName = organisation.isRegistered
      ? organisation.companyName
      : null;
    const organisationName = !organisation.isRegistered
      ? organisation.companyName
      : null;

    // otherName might be stored separately or in a different field
    // For now, we'll check if there's a separate field, otherwise it might be in description JSON
    const otherName = (organisation as any).otherName || null;

    // Format the response to include all fields
    const profileData = {
      ...organisation,
      // Basic Information
      companyName: organisation.companyName || null,
      legalName: legalName,
      organisationName: organisationName,
      otherName: otherName,
      description: descriptionText,

      // Registration Status
      isRegistered: organisation.isRegistered ?? null,

      // Incorporation Details (for registered)
      countryOfIncorporation: organisation.countryOfIncorporation || null,
      incorporationNumber: organisation.incorporationNumber || null,

      // Organisation Details (for non-registered)
      organisationCountry: !organisation.isRegistered
        ? organisation.country
        : null,

      // User contact info
      user: {
        email: organisation.user?.email || null,
        phoneNumber: organisation.user?.phoneNumber || null,
      },

      // Category (extracted from description JSON)
      category: categoryData.category || null,
      schoolType: categoryData.schoolType || null,
      religiousOrgType: categoryData.religiousOrgType || null,
      internationalOrgType: categoryData.internationalOrgType || null,
      politicalPartyCountry: categoryData.politicalPartyCountry || null,
      associatedSchool: categoryData.associatedSchool || null,

      // Business Details
      industry: organisation.industry || null,
      companySize: organisation.companySize || null,
      headquartersCity: headquartersCity,
      headquartersCountry: headquartersCountry,
      foundedDate: foundedDate,

      // Contact & Online
      website: organisation.website || null,
      logoUrl: organisation.logoUrl || null,
      socialMedia: {
        facebook: socialMedia.facebook || null,
        twitter: socialMedia.twitter || null,
        linkedin: socialMedia.linkedin || null,
        instagram: socialMedia.instagram || null,
        youtube: socialMedia.youtube || null,
      },

      // Address (full address structure)
      address: {
        buildingName: addressData.buildingName || null,
        streetNumber: addressData.streetNumber || null,
        street: addressData.street || null,
        city: addressData.city || null,
        state: addressData.state || null,
        country: addressData.country || null,
        zipCode: addressData.zipCode || null,
      },
    };

    return {
      success: true,
      data: profileData,
    };
  }

  async uploadOrganisationLogo(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const mime = file.mimetype || '';
    if (!mime.startsWith('image/')) {
      throw new BadRequestException(
        'File must be an image (e.g. JPEG, PNG, WebP)',
      );
    }
    const maxBytes = 5 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException('Logo must be at most 5 MB');
    }
    const safeName = (file.originalname || 'logo').replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );
    const filename = `${organisation.id}-${Date.now()}-${safeName}`;
    const url = await this.s3.upload(file.buffer, filename, {
      prefix: 'organisation-logos',
      contentType: file.mimetype,
    });
    await this.prisma.organisation.update({
      where: { userId },
      data: { logoUrl: url },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Logo Updated',
      details: 'Organisation logo was uploaded or replaced.',
      level: 'info',
    });
    return {
      success: true,
      message: 'Logo uploaded successfully',
      data: { logoUrl: url },
    };
  }

  async deleteOrganisationLogo(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    await this.prisma.organisation.update({
      where: { userId },
      data: { logoUrl: null },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Logo Removed',
      details: 'Organisation logo was removed.',
      level: 'info',
    });
    return {
      success: true,
      message: 'Logo removed',
      data: { logoUrl: null as string | null },
    };
  }

  async updateOrganisationProfile(
    userId: string,
    updateDto: UpdateOrganisationProfileDto,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Get current address and merge with new address
    const currentAddress = (organisation.address as any) || {};
    const updatedAddress = updateDto.address
      ? { ...currentAddress, ...updateDto.address }
      : currentAddress;

    // Get current social media and merge with new social media
    const currentSocialMedia = (organisation.address as any)?.socialMedia || {};
    const updatedSocialMedia = updateDto.socialMedia
      ? { ...currentSocialMedia, ...updateDto.socialMedia }
      : currentSocialMedia;

    // Store social media in address JSON (or create a separate field if preferred)
    if (updateDto.socialMedia) {
      updatedAddress.socialMedia = updatedSocialMedia;
    }

    // Calculate profile completeness
    let completeness = 0;
    const orgData = organisation as any;
    const fields = {
      companyName: organisation.companyName || updateDto.companyName,
      legalName: orgData.legalName || updateDto.legalName,
      industry: organisation.industry || updateDto.industry,
      companySize: organisation.companySize || updateDto.companySize,
      website: organisation.website || updateDto.website,
      description: organisation.description || updateDto.description,
      address: updatedAddress,
      category: orgData.category || updateDto.category,
      foundedDate: orgData.foundedDate || updateDto.foundedDate,
    };

    if (fields.companyName || fields.legalName) completeness += 10;
    if (fields.industry) completeness += 10;
    if (fields.companySize) completeness += 10;
    if (fields.website) completeness += 10;
    if (fields.description) completeness += 10;
    if (fields.address && Object.keys(fields.address).length > 0)
      completeness += 20;
    if (fields.category) completeness += 10;
    if (fields.foundedDate) completeness += 10;
    if (organisation.incorporationStatus) completeness += 10;
    if (organisation.countryOfIncorporation || updateDto.countryOfIncorporation)
      completeness += 10;

    const updateData: any = {
      ...(updateDto.companyName && { companyName: updateDto.companyName }),
      ...(updateDto.legalName && { legalName: updateDto.legalName }),
      ...(updateDto.otherName && { otherName: updateDto.otherName }),
      ...(updateDto.industry && { industry: updateDto.industry }),
      ...(updateDto.companySize && { companySize: updateDto.companySize }),
      ...(updateDto.website && { website: updateDto.website }),
      ...(updateDto.description && { description: updateDto.description }),
      ...(updateDto.category && { category: updateDto.category }),
      ...(updateDto.schoolType && { schoolType: updateDto.schoolType }),
      ...(updateDto.religiousOrgType && {
        religiousOrgType: updateDto.religiousOrgType,
      }),
      ...(updateDto.internationalOrgType && {
        internationalOrgType: updateDto.internationalOrgType,
      }),
      ...(updateDto.politicalPartyCountry && {
        politicalPartyCountry: updateDto.politicalPartyCountry,
      }),
      ...(updateDto.associatedSchool && {
        associatedSchool: updateDto.associatedSchool,
      }),
      ...(updateDto.countryOfIncorporation && {
        countryOfIncorporation: updateDto.countryOfIncorporation,
      }),
      ...(updateDto.incorporationNumber && {
        incorporationNumber: updateDto.incorporationNumber,
      }),
      ...(updateDto.organisationCountry && {
        organisationCountry: updateDto.organisationCountry,
      }),
      ...(updateDto.headquartersCity && {
        headquartersCity: updateDto.headquartersCity,
      }),
      ...(updateDto.headquartersCountry && {
        headquartersCountry: updateDto.headquartersCountry,
      }),
      ...(updateDto.foundedDate && {
        foundedDate: new Date(updateDto.foundedDate),
      }),
      ...(updateDto.isRegistered !== undefined && {
        isRegistered: updateDto.isRegistered,
      }),
      ...(updateDto.address && { address: updatedAddress as any }),
      profileCompleteness: completeness,
    };

    const updated = await this.prisma.organisation.update({
      where: { userId },
      data: updateData,
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Profile Updated',
      details: 'Organisation profile fields were saved.',
      level: 'info',
    });

    return {
      success: true,
      message: 'Organisation profile updated successfully',
      data: updated,
    };
  }

  async getDashboardStats(
    userId: string,
    filters?: { country?: string; workMode?: string; status?: string },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const baseWhere: any = { organisationId: organisation.id };
    if (filters?.country) {
      baseWhere.location = { contains: filters.country, mode: 'insensitive' };
    }
    if (filters?.workMode) {
      baseWhere.workMode = filters.workMode;
    }
    if (filters?.status) {
      baseWhere.status = filters.status;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // All jobs (filtered) with applications
    const jobs = await this.prisma.job.findMany({
      where: baseWhere,
      include: {
        applications: {
          select: {
            id: true,
            status: true,
            professionalId: true,
            createdAt: true,
          },
        },
      },
    });

    // Previous period jobs (same filters, created 30–60 days ago) for % change
    const previousPeriodWhere = {
      ...baseWhere,
      createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
    };
    const currentPeriodWhere = {
      ...baseWhere,
      createdAt: { gte: thirtyDaysAgo },
    };

    const [previousJobs, currentPeriodJobs] = await Promise.all([
      this.prisma.job.findMany({
        where: previousPeriodWhere,
        include: {
          applications: {
            select: { id: true, status: true, professionalId: true },
          },
        },
      }),
      this.prisma.job.findMany({
        where: currentPeriodWhere,
        include: {
          applications: {
            select: { id: true, status: true, professionalId: true },
          },
        },
      }),
    ]);

    const totalJobs = jobs.length;
    const publishedJobs = jobs.filter((j) => j.status === 'published').length;
    const activeJobs = jobs.filter(
      (j) => j.status === 'published' || j.status === 'paused',
    ).length;

    let totalApplications = 0;
    let pendingApplications = 0;
    let hiredProfessionals = 0;
    const hiredProfessionalIds = new Set<string>();

    for (const job of jobs) {
      totalApplications += job.applications.length;
      for (const app of job.applications) {
        if (app.status === 'pending' || app.status === 'under_review') {
          pendingApplications++;
        }
        if (app.status === 'hired' || app.status === 'accepted') {
          hiredProfessionals++;
          if (app.professionalId) {
            hiredProfessionalIds.add(app.professionalId);
          }
        }
      }
    }

    const prevTotalJobs = previousJobs.length;
    const currTotalJobs = currentPeriodJobs.length;
    let prevApplications = 0;
    let currApplications = 0;
    let prevHires = 0;
    let currHires = 0;
    const prevHiredIds = new Set<string>();
    const currHiredIds = new Set<string>();

    for (const job of previousJobs) {
      prevApplications += job.applications.length;
      job.applications.forEach((a) => {
        if (a.status === 'hired' || a.status === 'accepted') {
          prevHiredIds.add(a.professionalId);
        }
      });
    }
    prevHires = prevHiredIds.size;
    for (const job of currentPeriodJobs) {
      currApplications += job.applications.length;
      job.applications.forEach((a) => {
        if (a.status === 'hired' || a.status === 'accepted') {
          currHiredIds.add(a.professionalId);
        }
      });
    }
    currHires = currHiredIds.size;

    const percent = (curr: number, prev: number) =>
      prev === 0
        ? curr > 0
          ? 100
          : 0
        : Math.round(((curr - prev) / prev) * 100);
    const totalJobsChange = percent(currTotalJobs, prevTotalJobs);
    const activeJobsPrev = previousJobs.filter(
      (j) => j.status === 'published' || j.status === 'paused',
    ).length;
    const activeJobsCurr = currentPeriodJobs.filter(
      (j) => j.status === 'published' || j.status === 'paused',
    ).length;
    const activeJobsChange = percent(activeJobsCurr, activeJobsPrev);
    const totalApplicationsChange = percent(currApplications, prevApplications);
    const totalHiresChange = percent(currHires, prevHires);

    // Recent job postings (filtered, ordered by createdAt desc)
    const recentJobs = await this.prisma.job.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        applications: { select: { id: true } },
      },
    });

    const recentJobPostings = recentJobs.map((job) => ({
      id: job.id,
      jobTitle: job.jobTitle,
      applicants: job.applications.length,
      postedDate: job.createdAt,
      status: job.status,
    }));

    return {
      success: true,
      data: {
        totalJobs,
        activeJobs,
        publishedJobs,
        totalApplications,
        pendingApplications,
        hiredProfessionals: hiredProfessionalIds.size,
        totalJobsChange,
        activeJobsChange,
        totalApplicationsChange,
        totalHiresChange,
        recentJobPostings,
      },
    };
  }

  private formatSalaryRange(pay: any): string {
    if (!pay || typeof pay !== 'object') return '—';
    const sym =
      pay.currency === 'USD'
        ? '$'
        : pay.currency === 'GBP'
          ? '£'
          : pay.currency === 'EUR'
            ? '€'
            : pay.currency || '';
    const period =
      pay.period === 'Per annum'
        ? 'yearly'
        : pay.period === 'Per month'
          ? 'monthly'
          : pay.period || '';
    const periodStr = period ? ` / ${period}` : '';
    const fmt = (n: number) =>
      Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (pay.min != null && pay.max != null) {
      return `${sym}${fmt(Number(pay.min))} - ${sym}${fmt(Number(pay.max))}${periodStr}`;
    }
    const amount = pay.amount != null ? Number(pay.amount) : null;
    if (amount == null) return '—';
    return `${sym}${fmt(amount)}${periodStr}`;
  }

  private workModeLabel(mode: string): string {
    const map: Record<string, string> = {
      global_remote: 'Global Remote',
      remote: 'Location Remote',
      hybrid: 'Hybrid',
      on_site: 'Onsite',
      location: 'Location Remote',
    };
    return map[mode] || mode;
  }

  private employmentTypeLabel(type: string): string {
    const map: Record<string, string> = {
      full_time: 'Full Time',
      part_time: 'Part Time',
      contract: 'Contract',
      internship: 'Internship',
      volunteering: 'Volunteering',
      consultancy: 'Consultancy',
    };
    return map[type] || type;
  }

  async getOrganisationJobs(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where: { organisationId: organisation.id },
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
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.job.count({
        where: { organisationId: organisation.id },
      }),
    ]);

    const payJson = (job: any) =>
      (typeof job.pay === 'string'
        ? (() => {
            try {
              return JSON.parse(job.pay);
            } catch {
              return {};
            }
          })()
        : job.pay) || {};

    return {
      success: true,
      data: {
        jobs: jobs.map((job) => {
          const pay = payJson(job);
          return {
            id: job.id,
            jobTitle: job.jobTitle,
            category: job.department ?? null,
            jobLevel: job.jobLevel ?? null,
            employmentType: job.employmentType,
            workMode: job.workMode,
            workModeLabel: this.workModeLabel(job.workMode),
            employmentTypeLabel: this.employmentTypeLabel(job.employmentType),
            location: job.location,
            salaryRange: this.formatSalaryRange(pay),
            applicantsCount: job.applications.length,
            applicants: job.applications.length,
            status: job.status,
            postedDate: job.createdAt,
            createdAt: job.createdAt,
            organisation: job.organisation,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getJobById(userId: string, jobId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organisationId: organisation.id,
      },
      include: {
        organisation: {
          select: { id: true, companyName: true },
        },
        applications: { select: { id: true, status: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    const payRaw =
      typeof job.pay === 'string'
        ? (() => {
            try {
              return JSON.parse(job.pay as string);
            } catch {
              return {};
            }
          })()
        : (job.pay as object) || {};
    return {
      success: true,
      data: {
        id: job.id,
        jobTitle: job.jobTitle,
        department: job.department ?? null,
        jobLevel: job.jobLevel ?? null,
        employmentType: job.employmentType,
        workMode: job.workMode,
        workModeLabel: this.workModeLabel(job.workMode),
        employmentTypeLabel: this.employmentTypeLabel(job.employmentType),
        experienceYears: job.experienceYears ?? null,
        location: job.location,
        pay: payRaw,
        salaryRange: this.formatSalaryRange(payRaw),
        startDate: job.startDate ?? null,
        endDate: job.endDate ?? null,
        closingDate: job.closingDate ?? null,
        description: job.description ?? '',
        requirements: job.requirements ?? [],
        qualifyingQuestions: (job.qualifyingQuestions as any) ?? [],
        requiredApplicantData: job.requiredApplicantData ?? [],
        distributionChannels: job.distributionChannels ?? [],
        status: job.status,
        createdAt: job.createdAt,
        applicantsCount: job.applications.length,
        organisation: job.organisation,
      },
    };
  }

  async getApplications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    jobId?: string,
    status?: string,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const where: any = {
      job: {
        organisationId: organisation.id,
      },
    };

    if (jobId) {
      where.jobId = jobId;
    }

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              jobTitle: true,
              location: true,
              experienceYears: true,
              jobLevel: true,
              requirements: true,
            },
          },
          professional: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              education: {
                take: 1,
                orderBy: {
                  createdAt: 'desc',
                },
              },
              workExperience: {
                take: 1,
                orderBy: {
                  createdAt: 'desc',
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    // Calculate role match score for each application
    const applicationsWithScore = applications.map((app) => {
      let matchScore = 0;
      const factors = [];

      // Check experience match
      if (app.job.experienceYears && app.professional.workExperience?.[0]) {
        const professionalExp = app.professional.workExperience[0];
        const startDate = new Date(professionalExp.startDate);
        const endDate = professionalExp.currentlyWorking
          ? new Date()
          : new Date(professionalExp.endDate);
        const yearsOfExp =
          (endDate.getTime() - startDate.getTime()) /
          (1000 * 60 * 60 * 24 * 365);

        if (yearsOfExp >= app.job.experienceYears) {
          matchScore += 30;
          factors.push('Experience');
        } else if (yearsOfExp >= app.job.experienceYears * 0.7) {
          matchScore += 20;
          factors.push('Experience (Partial)');
        }
      }

      // Check education match
      if (app.professional.education?.[0]) {
        matchScore += 20;
        factors.push('Education');
      }

      // Check location match (if professional has location data)
      const workLocation = app.professional.workExperience?.[0]?.location;
      if (workLocation) {
        matchScore += 15;
        factors.push('Location');
      }

      // Check if professional has identity verification
      if (app.professional.identityStatus === 'verified') {
        matchScore += 15;
        factors.push('Verified');
      }

      // Check if professional has relevant work experience
      if (app.professional.workExperience?.[0]) {
        matchScore += 20;
        factors.push('Work History');
      }

      // Cap at 100
      matchScore = Math.min(100, matchScore);

      return {
        id: app.id,
        jobId: app.jobId,
        professionalId: app.professionalId,
        status: app.status,
        applicationData: app.applicationData,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        job: app.job,
        professional: app.professional,
        applicantName: `${app.professional.user.firstName} ${app.professional.user.lastName}`,
        email: app.professional.user.email,
        roleApplied: app.job.jobTitle,
        dateApplied: app.createdAt,
        roleMatchScore: matchScore,
        location: workLocation
          ? typeof workLocation === 'object' && !Array.isArray(workLocation)
            ? (workLocation as any).city ||
              (workLocation as any).country ||
              JSON.stringify(workLocation)
            : String(workLocation)
          : app.professional.country || 'Not specified',
        hiringStatus: app.status,
      };
    });

    return {
      success: true,
      data: {
        applications: applicationsWithScore,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async updateApplicationStatus(
    userId: string,
    applicationId: string,
    status: string,
    reason?: string,
  ) {
    const validStatuses = [
      'pending',
      'shortlisted',
      'under_review',
      'rejected',
      'accepted',
      'hired',
    ];

    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Verify the application belongs to this organisation
    const application = await this.prisma.jobApplication.findFirst({
      where: {
        id: applicationId,
        job: {
          organisationId: organisation.id,
        },
      },
      include: { job: { select: { jobTitle: true } } },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const updateData: { status: string; applicationData?: any } = { status };
    if (status === 'rejected' && reason != null && String(reason).trim()) {
      const existing = (application.applicationData as any) || {};
      updateData.applicationData = {
        ...existing,
        rejectionReason: String(reason).trim(),
      };
    }

    // Update application status
    const updated = await this.prisma.jobApplication.update({
      where: { id: applicationId },
      data: updateData,
    });

    const jobTitle = application.job?.jobTitle ?? 'Job';
    const level =
      status === 'hired' || status === 'accepted'
        ? ('success' as const)
        : status === 'rejected'
          ? ('warning' as const)
          : ('info' as const);
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Application Status Changed',
      details: `Application for "${jobTitle}" set to ${status}.`,
      level,
    });

    return {
      success: true,
      message: `Application status updated to ${status} successfully`,
      data: updated,
    };
  }

  async updateJobStatus(userId: string, jobId: string, status: string) {
    const validStatuses = ['draft', 'published', 'paused', 'closed'];

    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Verify the job belongs to this organisation
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organisationId: organisation.id,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Update job status
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: status as any },
    });

    const level =
      status === 'published'
        ? ('success' as const)
        : status === 'closed'
          ? ('warning' as const)
          : ('info' as const);
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Job Status Updated',
      details: `"${job.jobTitle}" is now ${status}.`,
      level,
    });

    return {
      success: true,
      message: `Job status updated to ${status} successfully`,
      data: updated,
    };
  }

  async getAvailablePlans() {
    await ensureDefaultBillingPlans(this.prisma);
    const rows = await this.prisma.billingSubscriptionPlan.findMany({
      where: { entityType: BillingEntityType.organisation, isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    const data = rows.map((row) => ({
      id: row.planSlug,
      name: row.name,
      price: Number(row.priceMonthlyUsd),
      description: row.description,
      features: Array.isArray(row.features) ? (row.features as string[]) : [],
      priceAnnualUsd:
        row.priceAnnualUsd != null ? Number(row.priceAnnualUsd) : null,
      priceMonthlyNgn: row.priceMonthlyNgn,
      priceAnnualNgn: row.priceAnnualNgn,
    }));
    return { success: true, data };
  }

  /** NGN amount shown on org billing (from catalog; recruiter NGN default when unset). */
  private async resolveOrganisationPlanMonthlyNgn(
    planSlug: string,
  ): Promise<number> {
    await ensureDefaultBillingPlans(this.prisma);
    if (planSlug === 'starter') return 0;
    const row = await this.prisma.billingSubscriptionPlan.findFirst({
      where: {
        entityType: BillingEntityType.organisation,
        planSlug,
        isActive: true,
      },
    });
    if (!row) {
      return this.fallbackMonthlyPlanNgn(planSlug);
    }
    if (row.priceMonthlyNgn != null) return row.priceMonthlyNgn;
    const usd = Number(row.priceMonthlyUsd);
    if (planSlug === 'recruiter') return 35000;
    return Math.round(usd * 1550);
  }

  private fallbackMonthlyPlanNgn(plan: string): number {
    const usdByPlan: Record<string, number> = {
      standard: 99,
      recruiter: 299,
      enterprise: 999,
    };
    if (plan === 'starter' || !usdByPlan[plan]) return 0;
    if (plan === 'recruiter') return 35000;
    return Math.round(usdByPlan[plan] * 1550);
  }

  private planDashboardDisplayName(plan: string): string {
    const names: Record<string, string> = {
      starter: 'Taldium Starter',
      standard: 'Taldium Standard',
      recruiter: 'Taldium Recruiter',
      enterprise: 'Taldium Enterprise',
    };
    return names[plan] || `Taldium ${plan}`;
  }

  /**
   * Plan usage rows for billing UI (limits are product defaults; `used` merged from stored stats).
   */
  private buildOrganisationPlanUsage(
    plan: string,
    stats: Record<string, number>,
  ): Array<{
    key: string;
    feature: string;
    limit: string;
    used: number;
    remaining: number | null;
  }> {
    const u = (k: string, def = 0) =>
      typeof stats[k] === 'number' ? stats[k] : def;

    const templates: Record<
      string,
      Array<{ key: string; feature: string; limit: string; cap: number | null }>
    > = {
      recruiter: [
        { key: 'jobPosts', feature: 'Job Posts', limit: '10 / month', cap: 10 },
        {
          key: 'applicantsPerPost',
          feature: 'Applicants per Post',
          limit: '20',
          cap: 20,
        },
        { key: 'emails', feature: 'Emails / month', limit: '200', cap: 200 },
        {
          key: 'interviews',
          feature: 'Interview Schedules / month',
          limit: '20',
          cap: 20,
        },
        {
          key: 'scoutWorkflows',
          feature: 'Talent Scout Workflows',
          limit: '2 / month',
          cap: 2,
        },
        {
          key: 'teamMembers',
          feature: 'Team Members',
          limit: '3 additional',
          cap: 3,
        },
        {
          key: 'dataRetention',
          feature: 'Data Retention',
          limit: '2 months',
          cap: null,
        },
        {
          key: 'calendarIntegration',
          feature: 'Calendar Integration',
          limit: '1',
          cap: 1,
        },
        {
          key: 'verifiedProfiles',
          feature: 'Verified Candidate Profiles',
          limit: '50',
          cap: null,
        },
      ],
      standard: [
        { key: 'jobPosts', feature: 'Job Posts', limit: '5 / month', cap: 5 },
        {
          key: 'applicantsPerPost',
          feature: 'Applicants per Post',
          limit: '10',
          cap: 10,
        },
        { key: 'emails', feature: 'Emails / month', limit: '100', cap: 100 },
        {
          key: 'interviews',
          feature: 'Interview Schedules / month',
          limit: '10',
          cap: 10,
        },
        {
          key: 'scoutWorkflows',
          feature: 'Talent Scout Workflows',
          limit: '1 / month',
          cap: 1,
        },
        {
          key: 'teamMembers',
          feature: 'Team Members',
          limit: '1 additional',
          cap: 1,
        },
      ],
      enterprise: [
        {
          key: 'jobPosts',
          feature: 'Job Posts',
          limit: 'Unlimited',
          cap: null,
        },
        {
          key: 'applicantsPerPost',
          feature: 'Applicants per Post',
          limit: 'Unlimited',
          cap: null,
        },
        {
          key: 'emails',
          feature: 'Emails / month',
          limit: 'Unlimited',
          cap: null,
        },
        {
          key: 'interviews',
          feature: 'Interview Schedules / month',
          limit: 'Unlimited',
          cap: null,
        },
        {
          key: 'scoutWorkflows',
          feature: 'Talent Scout Workflows',
          limit: 'Unlimited',
          cap: null,
        },
        {
          key: 'teamMembers',
          feature: 'Team Members',
          limit: 'Unlimited',
          cap: null,
        },
      ],
      starter: [
        { key: 'jobPosts', feature: 'Job Posts', limit: '2 / month', cap: 2 },
        {
          key: 'applicantsPerPost',
          feature: 'Applicants per Post',
          limit: '5',
          cap: 5,
        },
        { key: 'emails', feature: 'Emails / month', limit: '20', cap: 20 },
      ],
    };

    const rows = templates[plan] || templates.starter;
    return rows.map((row) => {
      const used = u(row.key, 0);
      let remaining: number | null = null;
      if (row.cap != null) {
        remaining = Math.max(0, row.cap - used);
      }
      return {
        key: row.key,
        feature: row.feature,
        limit: row.limit,
        used,
        remaining,
      };
    });
  }

  private buildOrganisationTokenUsage(
    _plan: string,
    stats: Record<string, number>,
  ): Array<{
    key: string;
    feature: string;
    limit: string;
    used: number;
    remaining: number | null;
  }> {
    const u = (k: string, def = 0) =>
      typeof stats[k] === 'number' ? stats[k] : def;
    return [
      {
        key: 'tokensPurchased',
        feature: 'Tokens purchased',
        limit: 'Wallet balance',
        used: u('ttkTokensPurchased', 0),
        remaining: null,
      },
      {
        key: 'tokensSpent',
        feature: 'Tokens spent',
        limit: 'Per use',
        used: u('ttkTotalDebits', 0),
        remaining: null,
      },
      {
        key: 'profileViews',
        feature: 'Profile views (TTK)',
        limit: 'Per use',
        used: u('ttkProfileViews', 0),
        remaining: null,
      },
      {
        key: 'verificationBoost',
        feature: 'Verification boosts',
        limit: 'Per use',
        used: u('ttkVerificationBoost', 0),
        remaining: null,
      },
      {
        key: 'exports',
        feature: 'Data exports',
        limit: 'Per use',
        used: u('ttkExports', 0),
        remaining: null,
      },
    ];
  }

  private usageMonthRange(period?: string) {
    const now = new Date();
    const offset = period === 'last_month' ? -1 : 0;
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return { start, end };
  }

  private async buildOrganisationUsageStats(
    organisationId: string,
    storedPlanStats: Record<string, number>,
    storedTokenStats: Record<string, number>,
    period?: string,
  ) {
    const { start, end } = this.usageMonthRange(period);
    const monthFilter = { gte: start, lt: end };

    const [
      jobPosts,
      jobsWithApplications,
      teamMembers,
      teamInvitations,
      directScoutApplications,
      billingTransactions,
    ] = await Promise.all([
      this.prisma.job.count({
        where: {
          organisationId,
          createdAt: monthFilter,
        },
      }),
      this.prisma.job.findMany({
        where: { organisationId, createdAt: monthFilter },
        select: {
          _count: {
            select: { applications: true },
          },
        },
      }),
      this.prisma.organisationMember.count({
        where: { organisationId },
      }),
      this.prisma.organisationInvitation.count({
        where: {
          organisationId,
          createdAt: monthFilter,
        },
      }),
      this.prisma.jobApplication.count({
        where: {
          createdAt: monthFilter,
          job: { organisationId },
          applicationData: {
            path: ['isDirectScout'],
            equals: true,
          },
        },
      }),
      this.prisma.organisationBillingTransaction.findMany({
        where: {
          organisationId,
          occurredAt: monthFilter,
        },
        select: {
          type: true,
          ttkDelta: true,
          metadata: true,
        },
      }),
    ]);

    const applicantsPerPost = jobsWithApplications.reduce(
      (max, job) => Math.max(max, job._count.applications),
      0,
    );

    const ledgerTokenDebits = billingTransactions
      .filter((row) => Number(row.ttkDelta) < 0)
      .reduce((sum, row) => sum + Math.abs(Number(row.ttkDelta) || 0), 0);
    const ledgerTokenCredits = billingTransactions
      .filter((row) => Number(row.ttkDelta) > 0)
      .reduce((sum, row) => sum + Math.abs(Number(row.ttkDelta) || 0), 0);

    const tokenStats = period === 'last_month' ? {} : { ...storedTokenStats };
    for (const row of billingTransactions) {
      const metadata = (row.metadata as any) || {};
      const usageKey = metadata.usageKey || metadata.tokenUsageKey;
      if (usageKey && Number(row.ttkDelta) < 0) {
        tokenStats[usageKey] =
          (tokenStats[usageKey] || 0) + Math.abs(Number(row.ttkDelta) || 0);
      }
    }
    tokenStats.ttkTotalDebits =
      (tokenStats.ttkTotalDebits || 0) + ledgerTokenDebits;
    tokenStats.ttkTokensPurchased =
      (tokenStats.ttkTokensPurchased || 0) + ledgerTokenCredits;

    return {
      planUsageStats: {
        ...(period === 'last_month' ? {} : storedPlanStats),
        jobPosts,
        applicantsPerPost,
        emails:
          (storedPlanStats.emails || 0) +
          teamInvitations +
          directScoutApplications,
        interviews: storedPlanStats.interviews || 0,
        scoutWorkflows:
          storedPlanStats.scoutWorkflows || directScoutApplications,
        teamMembers,
        dataRetention: storedPlanStats.dataRetention || 0,
        calendarIntegration: storedPlanStats.calendarIntegration || 0,
        verifiedProfiles: storedPlanStats.verifiedProfiles || 0,
      },
      tokenUsageStats: tokenStats,
    };
  }

  async searchProfessionals(
    userId: string,
    filters: {
      page: number;
      limit: number;
      search?: string;
      jobTitle?: string;
      searchType?: 'strict' | 'partial' | 'fuzzy';
      country?: string;
      city?: string;
      /** Full domicile string from scout form; when searchType is fuzzy, all tokens must match location corpus. */
      domicileFull?: string;
      verified?: boolean;
      minExperience?: number;
    },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const {
      page,
      limit,
      search,
      jobTitle,
      searchType,
      country,
      city,
      domicileFull,
      verified,
      minExperience,
    } = filters;
    const skip = (page - 1) * limit;
    const effectiveSearchType = searchType || 'partial';
    const domicileTrimmed = domicileFull?.trim() || '';
    const fuzzyLocationActive =
      effectiveSearchType === 'fuzzy' &&
      (!!domicileTrimmed ||
        (!!country?.trim() && country.trim().toLowerCase() !== 'global'));

    // Job title, domicile city, free-text search, and min experience are applied *after* the row
    // is mapped to "latest work experience" role. Paginating in SQL first would only scan the
    // newest `limit` profiles — older matches (and newly added ones once they appear in any
    // slice) would be missing from Direct Scout results.
    const needsFullScanBeforePagination =
      !!jobTitle?.trim() ||
      !!city?.trim() ||
      !!fuzzyLocationActive ||
      !!search?.trim() ||
      minExperience !== undefined;

    /** Cap for in-memory filter path (Direct Scout / filtered directory). */
    const FILTER_CANDIDATE_CAP = 10_000;

    // Build where clause for filtering
    const where: any = {
      user: {
        status: {
          in: ['ACTIVE', 'VERIFIED'],
        },
      },
    };

    // Search by name, email, country, or profession (role in work experience)
    if (search) {
      where.OR = [
        {
          user: {
            firstName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          user: {
            lastName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          user: {
            email: { contains: search, mode: 'insensitive' },
          },
        },
        { country: { contains: search, mode: 'insensitive' } },
        {
          workExperience: {
            some: {
              role: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    // Filter by country (scout "location"). For fuzzy search, apply tokens in-memory against location corpus instead.
    if (country?.trim() && country.trim().toLowerCase() !== 'global') {
      if (effectiveSearchType !== 'fuzzy') {
        where.country = {
          contains: country.trim(),
          mode: 'insensitive',
        };
      }
    }

    // Filter by verified status
    if (verified !== undefined) {
      if (verified) {
        where.identityStatus = 'verified';
      } else {
        where.identityStatus = {
          not: 'verified',
        };
      }
    }

    const include: Prisma.ProfessionalInclude = {
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
      workExperience: {
        orderBy: {
          startDate: 'asc',
        },
      },
      education: {
        take: 1,
        orderBy: {
          createdAt: 'desc',
        },
      },
    };

    const professionals = needsFullScanBeforePagination
      ? await this.prisma.professional.findMany({
          where,
          take: FILTER_CANDIDATE_CAP,
          orderBy: { createdAt: 'desc' },
          include,
        })
      : await this.prisma.professional.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include,
        });

    const dbCount = needsFullScanBeforePagination
      ? 0
      : await this.prisma.professional.count({ where });

    const extractNestedSearchTerms = (
      input: unknown,
      terms: string[],
      depth = 0,
    ) => {
      if (depth > 4 || input === null || input === undefined) return;
      if (typeof input === 'string') {
        const v = input.trim().toLowerCase();
        if (v) terms.push(v);
        return;
      }
      if (typeof input === 'number' || typeof input === 'boolean') {
        terms.push(String(input).toLowerCase());
        return;
      }
      if (Array.isArray(input)) {
        input.forEach((item) =>
          extractNestedSearchTerms(item, terms, depth + 1),
        );
        return;
      }
      if (typeof input === 'object') {
        Object.values(input as Record<string, unknown>).forEach((value) =>
          extractNestedSearchTerms(value, terms, depth + 1),
        );
      }
    };

    const getVerificationProfileSearchTerms = (prof: any): string[] => {
      const terms: string[] = [];
      const push = (value?: unknown) => {
        if (typeof value !== 'string') return;
        const v = value.trim().toLowerCase();
        if (v) terms.push(v);
      };

      // Core professional/user identity fields displayed in verification/profile views.
      push(prof.profession);
      push(prof.description);
      push(prof.country);
      push(prof.nationality);
      push(prof.gender);
      push(prof.middleName);
      push(prof?.user?.firstName);
      push(prof?.user?.lastName);
      push(prof?.user?.email);

      const iv = prof.identityVerification;
      if (iv) {
        push(iv.firstName);
        push(iv.lastName);
        push(iv.middleName);
        push(iv.email);
        push(iv.phoneNumber);
        push(iv.nationality);
        push(iv.country);
        push(iv.dateOfBirth);
        push(iv.idType);
      }

      // Work verification data.
      (prof.workExperience || []).forEach((exp: any) => {
        push(exp.role);
        push(exp.companyName);
        push(exp.location as unknown as string);
        push(exp.employmentType);
        push(exp.workType);
        push(exp.description);
        push(exp.responsibilities);
        push(exp.achievements);
        extractNestedSearchTerms(exp.skills, terms);
        extractNestedSearchTerms(exp.location, terms);
      });

      // Education verification data.
      (prof.education || []).forEach((edu: any) => {
        push(edu.institutionName);
        push(edu.schoolType);
        push(edu.levelOfEducation);
        push(edu.qualification);
        push(edu.fieldOfStudy);
        push(edu.grade);
        push(edu.country);
        push(edu.programDescription);
        push(edu.courseworkResponsibilities);
        push(edu.honorsAchievements);
        push(edu.associatedSkills);
        push(edu.studentVerificationEmail);
      });

      // Project verification data.
      (prof.professionalProjects || []).forEach((proj: any) => {
        push(proj.title);
        push(proj.description);
        push(proj.projectLink);
        push(proj.role);
        extractNestedSearchTerms(proj.teamMembers, terms);
      });

      // JSON sections shown on verification screens.
      extractNestedSearchTerms(prof.certifications, terms);
      extractNestedSearchTerms(prof.familyInfo, terms);
      extractNestedSearchTerms(prof.locations, terms);
      extractNestedSearchTerms(prof.socialMedia, terms);

      return terms;
    };

    // Calculate years of experience and filter by it
    const professionalsWithExperience = professionals
      .map((prof) => {
        let yearsOfExperience = 0;
        if (prof.workExperience && prof.workExperience.length > 0) {
          const earliestStart = prof.workExperience.reduce(
            (earliest, exp) => {
              const startDate = new Date(exp.startDate);
              return !earliest || startDate < earliest ? startDate : earliest;
            },
            null as Date | null,
          );

          if (earliestStart) {
            const endDate = prof.workExperience.some(
              (exp) => exp.currentlyWorking,
            )
              ? new Date()
              : prof.workExperience.reduce(
                  (latest, exp) => {
                    const endDate = exp.endDate
                      ? new Date(exp.endDate)
                      : new Date();
                    return !latest || endDate > latest ? endDate : latest;
                  },
                  null as Date | null,
                ) || new Date();

            yearsOfExperience = Math.floor(
              (endDate.getTime() - earliestStart.getTime()) /
                (1000 * 60 * 60 * 24 * 365),
            );
          }
        }

        // Get profession from most recent work experience
        const profession =
          prof.workExperience && prof.workExperience.length > 0
            ? prof.workExperience[prof.workExperience.length - 1].role
            : null;

        return {
          ...prof,
          yearsOfExperience,
          profession,
        };
      })
      .filter((prof) => {
        // Single search box: match name, email, profession, or location
        if (search) {
          const term = search.toLowerCase();
          const name =
            `${(prof as any).user?.firstName || ''} ${(prof as any).user?.lastName || ''}`
              .trim()
              .toLowerCase();
          const email = ((prof as any).user?.email || '').toLowerCase();
          const professionMatch = prof.profession?.toLowerCase().includes(term);
          const countryMatch = (prof.country || '')
            .toLowerCase()
            .includes(term);
          const cityMatch = prof.workExperience?.some((exp) => {
            const loc = (exp as any).location;
            const c = (loc?.city || '').toLowerCase();
            return c && c.includes(term);
          });
          if (
            !(
              name.includes(term) ||
              email.includes(term) ||
              professionMatch ||
              countryMatch ||
              cityMatch
            )
          ) {
            return false;
          }
        }

        // Filter by minimum experience
        if (
          minExperience !== undefined &&
          prof.yearsOfExperience < minExperience
        ) {
          return false;
        }

        // Filter by job title (profession) - strict = exact match, partial = contains, fuzzy = all words in title appear in role
        if (jobTitle?.trim()) {
          const title = jobTitle.toLowerCase().trim();
          const role = (prof.profession || '').toLowerCase();
          const searchTerms = getVerificationProfileSearchTerms(prof);
          // const profileCorpus = searchTerms.join(' ');
          if (effectiveSearchType === 'strict') {
            if (!(role === title || searchTerms.some((term) => term === title)))
              return false;
          } else if (effectiveSearchType === 'fuzzy') {
            const words = title.split(/\s+/).filter(Boolean);

            const roleFields = [
              prof.profession,
              ...(prof.workExperience || []).map((e: any) => e.role),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            const anyWordMatches = words.some((word) =>
              roleFields.includes(word),
            );
            if (!anyWordMatches) return false;
          } else {
            const roleFields = [
              prof.profession,
              ...(prof.workExperience || []).map((e: any) => e.role),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            if (!roleFields.includes(title)) return false;
          }
        }

        // Scout region (organisation "location" criterion): fuzzy = each token must appear in location corpus
        const locCorpus = (): string =>
          this.professionalLocationCorpusLower(prof);
        if (
          country?.trim() &&
          country.trim().toLowerCase() !== 'global' &&
          effectiveSearchType === 'fuzzy'
        ) {
          if (!this.domicilePhraseMatchesFuzzy(locCorpus(), country.trim())) {
            return false;
          }
        }

        // Domicile: fuzzy = token-match full phrase against corpus; partial/strict = first-segment city substring (existing)
        if (domicileTrimmed) {
          if (effectiveSearchType === 'fuzzy') {
            if (
              !this.domicilePhraseMatchesFuzzy(locCorpus(), domicileTrimmed)
            ) {
              return false;
            }
          } else if (city) {
            const hasCityMatch = prof.workExperience?.some((exp) => {
              const location = exp.location as any;
              return location?.city?.toLowerCase().includes(city.toLowerCase());
            });
            if (
              !hasCityMatch &&
              prof.country?.toLowerCase() !== city.toLowerCase()
            ) {
              return false;
            }
          }
        }

        return true;
      });

    const totalFiltered = professionalsWithExperience.length;
    const pageSlice = needsFullScanBeforePagination
      ? professionalsWithExperience.slice(skip, skip + limit)
      : professionalsWithExperience;

    // Get verification status (percentage + label for badges)
    const getVerificationStatus = (prof: any) => {
      const completeness = Math.min(100, prof.profileCompleteness || 0);
      if (prof.identityStatus === 'verified') {
        return {
          percentage: Math.max(completeness, 100),
          status: 'Verified with Gov ID',
        };
      } else if (completeness >= 30) {
        return { percentage: completeness, status: 'Self Declared' };
      } else {
        return { percentage: completeness || 20, status: 'Pending' };
      }
    };

    // Nationality display: use professional.nationality or derive from country
    const getNationality = (prof: any) => {
      if (prof.nationality) return prof.nationality;
      const c = (prof.country || '').trim();
      if (!c) return null;
      const map: Record<string, string> = {
        Nigeria: 'Nigerian',
        'United States': 'American',
        USA: 'American',
        Germany: 'German',
        'United Kingdom': 'British',
        UK: 'British',
        India: 'Indian',
        Japan: 'Japanese',
        Mexico: 'Mexican',
        'United Arab Emirates': 'Emirati',
        UAE: 'Emirati',
      };
      return map[c] || c;
    };

    const totalForPagination = needsFullScanBeforePagination
      ? totalFiltered
      : dbCount;
    const totalPages = Math.max(1, Math.ceil(totalForPagination / limit));

    return {
      success: true,
      data: {
        professionals: pageSlice.map((prof) =>
          this.mapProfessionalToOrganisationDirectoryRow(
            prof,
            getNationality,
            getVerificationStatus,
          ),
        ),
        pagination: {
          page,
          limit,
          total: totalForPagination,
          totalPages,
        },
      },
    };
  }

  /** Lowercase string of country / work cities / work location countries / education countries for fuzzy scout matching. */
  private professionalLocationCorpusLower(prof: any): string {
    const parts: string[] = [];
    const push = (v: unknown) => {
      if (typeof v !== 'string') return;
      const t = v.trim().toLowerCase();
      if (t) parts.push(t);
    };
    push(prof.country);
    push(prof.nationality);
    for (const exp of prof.workExperience || []) {
      const loc = exp?.location as Record<string, unknown> | null | undefined;
      if (loc && typeof loc === 'object') {
        push(loc.city);
        push(loc.country);
        push(loc.state);
        push(loc.region);
      }
    }
    for (const edu of prof.education || []) {
      push(edu.country);
    }
    return parts.join(' ');
  }

  /** Every whitespace/comma-separated token must appear as a substring of the corpus (same idea as fuzzy job title). */
  private domicilePhraseMatchesFuzzy(
    corpusLower: string,
    phrase: string,
  ): boolean {
    const tokens = phrase
      .toLowerCase()
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) return true;
    return tokens.every((t) => corpusLower.includes(t));
  }

  private mapProfessionalToOrganisationDirectoryRow(
    prof: any,
    getNationality: (p: any) => string | null,
    getVerificationStatus: (p: any) => { percentage: number; status: string },
  ) {
    return {
      id: prof.id,
      userId: prof.userId,
      name:
        `${prof.user.firstName || ''} ${prof.user.lastName || ''}`.trim() ||
        prof.user.email,
      email: prof.user.email,
      nationality: getNationality(prof),
      location: {
        city: prof.workExperience?.[0]?.location
          ? (prof.workExperience[0].location as any).city || null
          : null,
        country: prof.country || null,
      },
      profession: prof.profession || 'Not specified',
      yearsOfExperience: prof.yearsOfExperience,
      verificationStatus: getVerificationStatus(prof),
      profileCompleteness: prof.profileCompleteness || 0,
      identityStatus: prof.identityStatus,
      user: prof.user,
    };
  }

  private enrichProfessionalWithRoleAndTenure(prof: any) {
    let yearsOfExperience = 0;
    if (prof.workExperience && prof.workExperience.length > 0) {
      const earliestStart = prof.workExperience.reduce(
        (earliest: Date | null, exp: any) => {
          const startDate = new Date(exp.startDate);
          return !earliest || startDate < earliest ? startDate : earliest;
        },
        null as Date | null,
      );

      if (earliestStart) {
        const endDate = prof.workExperience.some(
          (exp: any) => exp.currentlyWorking,
        )
          ? new Date()
          : prof.workExperience.reduce(
              (latest: Date | null, exp: any) => {
                const ed = exp.endDate ? new Date(exp.endDate) : new Date();
                return !latest || ed > latest ? ed : latest;
              },
              null as Date | null,
            ) || new Date();

        yearsOfExperience = Math.floor(
          (endDate.getTime() - earliestStart.getTime()) /
            (1000 * 60 * 60 * 24 * 365),
        );
      }
    }
    const profession =
      prof.workExperience && prof.workExperience.length > 0
        ? prof.workExperience[prof.workExperience.length - 1].role
        : null;
    return { ...prof, yearsOfExperience, profession };
  }

  private mapRawProfessionalToDirectoryListing(prof: any) {
    const getNationality = (p: any) => {
      if (p.nationality) return p.nationality;
      const c = (p.country || '').trim();
      if (!c) return null;
      const map: Record<string, string> = {
        Nigeria: 'Nigerian',
        'United States': 'American',
        USA: 'American',
        Germany: 'German',
        'United Kingdom': 'British',
        UK: 'British',
        India: 'Indian',
        Japan: 'Japanese',
        Mexico: 'Mexican',
        'United Arab Emirates': 'Emirati',
        UAE: 'Emirati',
      };
      return map[c] || c;
    };
    const getVerificationStatus = (p: any) => {
      const completeness = Math.min(100, p.profileCompleteness || 0);
      if (p.identityStatus === 'verified') {
        return {
          percentage: Math.max(completeness, 100),
          status: 'Verified with Gov ID',
        };
      } else if (completeness >= 30) {
        return { percentage: completeness, status: 'Self Declared' };
      } else {
        return { percentage: completeness || 20, status: 'Pending' };
      }
    };
    const enriched = this.enrichProfessionalWithRoleAndTenure(prof);
    return this.mapProfessionalToOrganisationDirectoryRow(
      enriched,
      getNationality,
      getVerificationStatus,
    );
  }

  private scoutSearchFilterParams(dto: {
    jobTitle?: string;
    searchType?: 'strict' | 'partial' | 'fuzzy';
    location?: string;
    domicile?: string;
  }) {
    const searchType = (dto.searchType || 'partial') as
      | 'strict'
      | 'partial'
      | 'fuzzy';
    const country =
      dto.location && dto.location.toLowerCase() !== 'global'
        ? dto.location
        : undefined;
    const dom = dto.domicile?.trim() || '';
    let city: string | undefined;
    // Fuzzy domicile matches all tokens in-memory; do not narrow with first-segment city only
    if (dom && searchType !== 'fuzzy') {
      const parts = dom
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      city = parts[0];
    }
    return {
      page: 1,
      limit: 100,
      jobTitle: dto.jobTitle,
      searchType,
      country,
      city,
      domicileFull: dom || undefined,
    };
  }

  async scoutSearch(
    userId: string,
    dto: {
      jobTitle?: string;
      searchType?: 'strict' | 'partial' | 'fuzzy';
      location?: string;
      domicile?: string;
      workMode?: string;
      employmentType?: string;
      currency?: string;
      salaryMin?: number;
      salaryMax?: number;
      benefits?: string[];
      description?: string;
      salaryPeriod?: string;
      name?: string;
    },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const searchResult = await this.searchProfessionals(
      userId,
      this.scoutSearchFilterParams(dto),
    );

    const professionals = searchResult.data.professionals as { id: string }[];
    const displayName =
      (dto.name && dto.name.trim()) ||
      [dto.jobTitle, dto.location]
        .filter((x) => x && String(x).trim())
        .join(' · ') ||
      'Scout list';

    const criteriaPayload = { ...dto };

    const scout = await this.prisma.$transaction(async (tx) => {
      const s = await tx.organisationTalentScout.create({
        data: {
          organisationId: organisation.id,
          name: displayName,
          criteria: criteriaPayload as Prisma.InputJsonValue,
          matchCount: professionals.length,
        },
      });
      if (professionals.length > 0) {
        await tx.organisationTalentScoutMatch.createMany({
          data: professionals.map((row, i) => ({
            scoutId: s.id,
            professionalId: row.id,
            sortOrder: i,
          })),
        });
      }
      return s;
    });

    return {
      success: true,
      data: {
        ...searchResult.data,
        scout: {
          id: scout.id,
          name: scout.name,
          matchCount: scout.matchCount,
          createdAt: scout.createdAt.toISOString(),
          criteria: scout.criteria,
        },
      },
    };
  }

  async listTalentScouts(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const rows = await this.prisma.organisationTalentScout.findMany({
      where: { organisationId: organisation.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      data: {
        scouts: rows.map((r) => ({
          id: r.id,
          name: r.name,
          matchCount: r.matchCount,
          criteria: r.criteria,
          createdAt: r.createdAt.getTime(),
        })),
      },
    };
  }

  async getTalentScoutDetail(userId: string, scoutId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const scout = await this.prisma.organisationTalentScout.findFirst({
      where: { id: scoutId, organisationId: organisation.id },
    });
    if (!scout) {
      throw new NotFoundException('Scout list not found');
    }

    const criteriaRaw = (scout.criteria || {}) as Record<string, unknown>;
    const stRaw = criteriaRaw.searchType;
    const searchTypeNorm =
      typeof stRaw === 'string' &&
      ['strict', 'partial', 'fuzzy'].includes(stRaw.toLowerCase())
        ? (stRaw.toLowerCase() as 'strict' | 'partial' | 'fuzzy')
        : undefined;

    const searchResult = await this.searchProfessionals(
      userId,
      this.scoutSearchFilterParams({
        jobTitle:
          criteriaRaw.jobTitle != null && String(criteriaRaw.jobTitle).trim()
            ? String(criteriaRaw.jobTitle)
            : undefined,
        searchType: searchTypeNorm,
        location:
          criteriaRaw.location != null && String(criteriaRaw.location).trim()
            ? String(criteriaRaw.location)
            : undefined,
        domicile:
          criteriaRaw.domicile != null && String(criteriaRaw.domicile).trim()
            ? String(criteriaRaw.domicile)
            : undefined,
      }),
    );

    const professionals = searchResult.data.professionals as any[];
    return {
      success: true,
      data: {
        scout: {
          id: scout.id,
          name: scout.name,
          matchCount: professionals.length,
          criteria: scout.criteria,
          createdAt: scout.createdAt.toISOString(),
        },
        professionals,
        pagination: searchResult.data.pagination,
      },
    };
  }

  async deleteTalentScout(userId: string, scoutId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const res = await this.prisma.organisationTalentScout.deleteMany({
      where: { id: scoutId, organisationId: organisation.id },
    });
    if (res.count === 0) {
      throw new NotFoundException('Scout list not found');
    }
    return { success: true, data: { deleted: true } };
  }

  async updateTalentScout(
    userId: string,
    scoutId: string,
    dto: {
      jobTitle?: string;
      searchType?: 'strict' | 'partial' | 'fuzzy';
      location?: string;
      domicile?: string;
      workMode?: string;
      employmentType?: string;
      currency?: string;
      salaryMin?: number;
      salaryMax?: number;
      benefits?: string[];
      description?: string;
      salaryPeriod?: string;
      name?: string;
    },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const existing = await this.prisma.organisationTalentScout.findFirst({
      where: { id: scoutId, organisationId: organisation.id },
    });
    if (!existing) {
      throw new NotFoundException('Scout list not found');
    }

    const searchResult = await this.searchProfessionals(
      userId,
      this.scoutSearchFilterParams(dto),
    );
    const professionals = searchResult.data.professionals as { id: string }[];
    const displayName =
      (dto.name && dto.name.trim()) ||
      [dto.jobTitle, dto.location]
        .filter((x) => x && String(x).trim())
        .join(' · ') ||
      existing.name;

    const criteriaPayload = { ...dto };

    await this.prisma.$transaction(async (tx) => {
      await tx.organisationTalentScoutMatch.deleteMany({ where: { scoutId } });
      await tx.organisationTalentScout.update({
        where: { id: scoutId },
        data: {
          name: displayName,
          criteria: criteriaPayload as Prisma.InputJsonValue,
          matchCount: professionals.length,
        },
      });
      if (professionals.length > 0) {
        await tx.organisationTalentScoutMatch.createMany({
          data: professionals.map((row, i) => ({
            scoutId,
            professionalId: row.id,
            sortOrder: i,
          })),
        });
      }
    });

    const scout = await this.prisma.organisationTalentScout.findUnique({
      where: { id: scoutId },
    });
    return {
      success: true,
      data: {
        ...searchResult.data,
        scout: scout
          ? {
              id: scout.id,
              name: scout.name,
              matchCount: scout.matchCount,
              createdAt: scout.createdAt.toISOString(),
              criteria: scout.criteria,
            }
          : null,
      },
    };
  }

  async getProfessionalByIdForOrganisation(
    userId: string,
    professionalId: string,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
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
        education: {
          orderBy: { createdAt: 'desc' },
        },
        workExperience: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const profAny = professional as any;
    const workExp = professional.workExperience || [];
    let yearsOfExperience = 0;
    if (workExp.length > 0) {
      const earliest = workExp.reduce(
        (min, e) => {
          const d = new Date(e.startDate);
          return !min || d < min ? d : min;
        },
        null as Date | null,
      );
      const latest = workExp.some((e) => e.currentlyWorking)
        ? new Date()
        : workExp.reduce(
            (max, e) => {
              const d = e.endDate ? new Date(e.endDate) : new Date();
              return !max || d > max ? d : max;
            },
            null as Date | null,
          ) || new Date();
      if (earliest) {
        yearsOfExperience = Math.floor(
          (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365),
        );
      }
    }
    const profession =
      workExp.length > 0 ? workExp[workExp.length - 1].role : null;
    const getNationality = (p: any) => {
      if (p.nationality) return p.nationality;
      const c = (p.country || '').trim();
      if (!c) return null;
      const map: Record<string, string> = {
        Nigeria: 'Nigerian',
        'United States': 'American',
        USA: 'American',
        Germany: 'German',
        'United Kingdom': 'British',
        UK: 'British',
        India: 'Indian',
        Japan: 'Japanese',
        Mexico: 'Mexican',
        'United Arab Emirates': 'Emirati',
        UAE: 'Emirati',
      };
      return map[c] || c;
    };
    const completeness = Math.min(100, professional.profileCompleteness || 0);
    const verificationStatus =
      professional.identityStatus === 'verified'
        ? { percentage: 100, status: 'Verified with Gov ID' }
        : completeness >= 30
          ? { percentage: completeness, status: 'Self Declared' }
          : { percentage: completeness || 20, status: 'Pending' };
    const locationCity =
      workExp[0]?.location && typeof workExp[0].location === 'object'
        ? (workExp[0].location as any).city || null
        : null;
    return {
      success: true,
      data: {
        id: professional.id,
        userId: professional.userId,
        name:
          `${professional.user.firstName || ''} ${professional.user.lastName || ''}`.trim() ||
          professional.user.email,
        email: professional.user.email,
        country: professional.country,
        nationality: getNationality(professional),
        description: profAny.description || null,
        socialMedia: profAny.socialMedia || {},
        profileImageUrl: profAny.profileImageUrl || null,
        profileImage: profAny.profileImageUrl || profAny.profileImage || null,
        profileCompleteness: professional.profileCompleteness,
        identityStatus: professional.identityStatus,
        yearsOfExperience,
        profession: profession || 'Not specified',
        location: {
          city: locationCity,
          country: professional.country,
        },
        verificationStatus,
        user: professional.user,
        education: professional.education,
        workExperience: professional.workExperience,
      },
    };
  }

  async getHiredProfessionals(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Get all applications with hired/accepted status
    const hiredApplications = await this.prisma.jobApplication.findMany({
      where: {
        job: {
          organisationId: organisation.id,
        },
        status: {
          in: ['hired', 'accepted'],
        },
      },
      include: {
        professional: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
              },
            },
            education: {
              take: 1,
              orderBy: {
                createdAt: 'desc',
              },
            },
            workExperience: {
              take: 1,
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
        job: {
          select: {
            id: true,
            jobTitle: true,
          },
        },
      },
    });

    // Get unique professionals
    const uniqueProfessionals = new Map();
    for (const app of hiredApplications) {
      if (app.professionalId && !uniqueProfessionals.has(app.professionalId)) {
        uniqueProfessionals.set(app.professionalId, app.professional);
      }
    }

    const professionals = Array.from(uniqueProfessionals.values());
    const total = professionals.length;
    const skip = (page - 1) * limit;
    const paginatedProfessionals = professionals.slice(skip, skip + limit);

    return {
      success: true,
      data: {
        professionals: paginatedProfessionals.map((prof) => ({
          id: prof.id,
          userId: prof.userId,
          country: prof.country,
          nationality: prof.nationality,
          identityStatus: prof.identityStatus,
          profileCompleteness: prof.profileCompleteness,
          user: prof.user,
          education: prof.education,
          workExperience: prof.workExperience,
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

  async sendMessageToProfessional(
    userId: string,
    professionalId: string,
    message: string,
    subject?: string,
    jobTitle?: string,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      include: { user: true },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Format message content
    const firstName = professional.user.firstName || 'Professional';
    const messageContent = jobTitle
      ? `Dear ${firstName},\n\nYou have been headhunted by ${organisation.companyName}, ${organisation.industry ? `a ${organisation.industry} company` : 'a company'} operating ${organisation.country ? `in ${organisation.country}` : 'globally'} for the position of ${jobTitle}${message ? `.\n\n${message}` : ''}. Please review the offer and Job description and respond as soon as possible.`
      : message;

    // Send email to professional
    try {
      await this.mailService.send(
        {
          to: professional.user.email,
          subject:
            subject ||
            (jobTitle
              ? `Headhunt Offer: ${jobTitle} at ${organisation.companyName}`
              : 'Message from Organisation'),
        },
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${subject || (jobTitle ? `Headhunt Offer: ${jobTitle}` : 'Message from Organisation')}</h2>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="white-space: pre-line; line-height: 1.6; color: #333;">${messageContent.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="color: #666; font-size: 14px;">Best regards,<br>${organisation.companyName}</p>
        </div>`,
      );
    } catch (error) {
      console.error('Failed to send email:', error);
      // Continue even if email fails
    }

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Professional Message Sent',
      details: `Email to ${professional.user.email}${jobTitle ? ` regarding "${jobTitle}"` : ''}.`,
      level: 'info',
    });

    return {
      success: true,
      message: 'Message sent successfully',
      data: {
        professionalId,
        professionalEmail: professional.user.email,
        message: messageContent,
        sentAt: new Date(),
      },
    };
  }

  private buildScoutMessage(
    organisation: {
      companyName: string;
      industry?: string | null;
      country?: string | null;
    },
    jobTitle?: string,
    employmentType?: string,
    workMode?: string,
    location?: string,
    description?: string,
    message?: string,
  ): string {
    const orgIntro = organisation.companyName
      ? `${organisation.companyName}${organisation.industry ? `, a ${organisation.industry} company` : ', a company'} operating ${organisation.country ? `in ${organisation.country}` : 'globally'}`
      : 'our organisation';
    let text = jobTitle
      ? `You have been headhunted by ${orgIntro} for the position of ${jobTitle}.`
      : message || 'We would like to connect with you.';
    if (employmentType)
      text += `\n\nEmployment Type: ${this.employmentTypeLabel(employmentType)}`;
    if (workMode) text += `\nWork Mode: ${workMode}`;
    if (location) text += `\nLocation: ${location}`;
    if (description) text += `\n\nJob Description:\n${description}`;
    if (message && jobTitle) text += `\n\n${message}`;
    text +=
      '\n\nPlease review the offer and Job description and respond as soon as possible.';
    return text;
  }

  async hireProfessional(
    userId: string,
    professionalId: string,
    jobId?: string,
    body?: {
      jobTitle?: string;
      message?: string;
      employmentType?: string;
      workMode?: string;
      location?: string;
      description?: string;
    },
  ) {
    const jobTitle = body?.jobTitle;
    const message = body?.message;
    const employmentType = body?.employmentType;
    const workMode = body?.workMode;
    const location = body?.location;
    const description = body?.description;

    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const profLabel =
      `${professional.user?.firstName ?? ''} ${professional.user?.lastName ?? ''}`.trim() ||
      professional.user?.email ||
      'Professional';

    // If jobId is provided, update the application status
    if (jobId) {
      const application = await this.prisma.jobApplication.findFirst({
        where: {
          jobId,
          professionalId,
          job: {
            organisationId: organisation.id,
          },
        },
      });

      if (!application) {
        throw new NotFoundException('Application not found');
      }

      await this.prisma.jobApplication.update({
        where: { id: application.id },
        data: { status: 'hired' },
      });

      const scoutMessage = this.buildScoutMessage(
        organisation,
        jobTitle,
        employmentType,
        workMode,
        location,
        description,
        message,
      );
      if (scoutMessage) {
        await this.sendMessageToProfessional(
          userId,
          professionalId,
          scoutMessage,
          'Hiring Notification',
          jobTitle,
        );
      }

      const hiredJob = await this.prisma.job.findFirst({
        where: { id: jobId, organisationId: organisation.id },
        select: { jobTitle: true },
      });
      void this.logOrganisationActivityFromUser(organisation.id, userId, {
        action: 'Applicant Hired',
        details: `Hired ${profLabel} for "${hiredJob?.jobTitle ?? 'job'}".`,
        level: 'success',
      });

      return {
        success: true,
        message: 'Professional hired successfully',
        data: {
          professionalId,
          jobId,
          applicationId: application.id,
        },
      };
    }

    // Direct scout (no jobId): send scout request email
    const scoutMessage = this.buildScoutMessage(
      organisation,
      jobTitle,
      employmentType,
      workMode,
      location,
      description,
      message,
    );
    if (scoutMessage) {
      await this.sendMessageToProfessional(
        userId,
        professionalId,
        scoutMessage,
        'Direct Scout - Hiring Opportunity',
        jobTitle,
      );
    }

    const firstJob = await this.prisma.job.findFirst({
      where: {
        organisationId: organisation.id,
        status: 'published',
      },
    });

    if (firstJob) {
      await this.prisma.jobApplication.upsert({
        where: {
          jobId_professionalId: {
            jobId: firstJob.id,
            professionalId,
          },
        },
        update: {
          status: 'hired',
        },
        create: {
          jobId: firstJob.id,
          professionalId,
          status: 'hired',
          applicationData: {
            isDirectScout: true,
            jobTitle: jobTitle || null,
            message: message || null,
            employmentType: employmentType || null,
            workMode: workMode || null,
            location: location || null,
            description: description || null,
          },
        },
      });
      void this.logOrganisationActivityFromUser(organisation.id, userId, {
        action: 'Applicant Hired',
        details: `Hired ${profLabel} for "${firstJob.jobTitle}" (direct scout flow).`,
        level: 'success',
      });
    } else if (scoutMessage) {
      void this.logOrganisationActivityFromUser(organisation.id, userId, {
        action: 'Direct Scout Sent',
        details: `Sent direct scout message to ${profLabel}.`,
        level: 'info',
      });
    }

    return {
      success: true,
      message: 'Scout request sent successfully',
      data: {
        professionalId,
        isDirectScout: !jobId,
      },
    };
  }

  async getTeamStats(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true } },
        members: { select: { role: true } },
      },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const orgAdmins = organisation.members.filter(
      (m) => m.role === 'org_admin',
    ).length;
    const editors = organisation.members.filter(
      (m) => m.role === 'org_recruiter',
    ).length;
    const viewers = organisation.members.filter(
      (m) => m.role === 'org_member',
    ).length;
    return {
      success: true,
      data: {
        totalMembers: 1 + organisation.members.length,
        admins: 1 + orgAdmins,
        editors,
        viewers,
      },
    };
  }

  async getTeamMembers(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            updatedAt: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const owner = {
      id: 'owner',
      memberId: null,
      userId: organisation.user.id,
      name:
        `${organisation.user.firstName} ${organisation.user.lastName}`.trim() ||
        'Owner',
      email: organisation.user.email,
      role: 'org_owner' as const,
      joined: organisation.createdAt,
      lastActive: organisation.user.updatedAt,
    };
    const members = organisation.members.map((m) => ({
      id: m.id,
      memberId: m.id,
      userId: m.user.id,
      name: `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email,
      email: m.user.email,
      role: m.role,
      joined: m.createdAt,
      lastActive: m.updatedAt,
    }));
    return {
      success: true,
      data: {
        members: [owner, ...members],
      },
    };
  }

  async inviteMember(userId: string, dto: { email: string; role: string }) {
    const email = dto.email.trim().toLowerCase();
    const allowedRoles = ['org_admin', 'org_recruiter', 'org_member'];
    if (!allowedRoles.includes(dto.role)) {
      throw new BadRequestException('Invalid team role');
    }
    if (!this.mailService.isConfigured()) {
      throw new ServiceUnavailableException(
        'Email service is not configured. Set RESEND_API_KEY to send team invitations.',
      );
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      const alreadyMember = await this.prisma.organisationMember.findUnique({
        where: {
          organisationId_userId: {
            organisationId: organisation.id,
            userId: existingUser.id,
          },
        },
      });
      if (alreadyMember) {
        throw new BadRequestException('User is already a team member');
      }
    }
    const existingInvite = await this.prisma.organisationInvitation.findUnique({
      where: {
        organisationId_email: { organisationId: organisation.id, email },
      },
    });
    if (existingInvite) {
      if (existingInvite.expiresAt > new Date()) {
        throw new BadRequestException(
          'An invitation has already been sent to this email',
        );
      }
      await this.prisma.organisationInvitation.delete({
        where: { id: existingInvite.id },
      });
    }
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await this.prisma.organisationInvitation.create({
      data: {
        organisationId: organisation.id,
        email,
        role: dto.role as any,
        token,
        expiresAt,
      },
    });
    try {
      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join?invite=${token}`;
      const result = await this.mailService.send(
        {
          to: email,
          subject: `You're invited to join ${organisation.companyName} on Taldium`,
        },
        `<div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>You've been invited to join ${organisation.companyName}</h2>
          <p>You have been invited as ${dto.role.replace('org_', '').replace('_', ' ')}.</p>
          <p>Click the link below to accept the invitation and join the team.</p>
          <p><a href="${inviteLink}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;">Accept invitation</a></p>
          <p>If the button does not work, copy and paste this URL into your browser:</p>
          <p style="word-break: break-all; color: #475569;">${inviteLink}</p>
          <p>This link expires in 7 days.</p>
        </div>`,
      );
      if (result?.error) {
        throw result.error;
      }
    } catch (e) {
      console.error('Failed to send invite email:', e);
      await this.prisma.organisationInvitation.delete({
        where: { id: invitation.id },
      });
      throw new ServiceUnavailableException(
        'Could not send invitation email. Please try again.',
      );
    }
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Team Member Invited',
      details: `Invited ${email} as ${dto.role.replace('org_', '').replace('_', ' ')}.`,
      level: 'info',
    });
    return {
      success: true,
      message: 'Invitation sent successfully',
      data: { email, role: dto.role, expiresAt },
    };
  }

  async updateMemberRole(userId: string, memberId: string, role: string) {
    if (role === 'org_owner') {
      throw new BadRequestException('Cannot set role to owner');
    }
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const member = await this.prisma.organisationMember.findFirst({
      where: { id: memberId, organisationId: organisation.id },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    await this.prisma.organisationMember.update({
      where: { id: memberId },
      data: { role: role as any },
    });
    const memberLabel =
      `${member.user.firstName} ${member.user.lastName}`.trim() ||
      member.user.email;
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Team Role Updated',
      details: `Changed ${memberLabel}'s role to ${role.replace('org_', '').replace('_', ' ')}.`,
      level: 'warning',
    });
    return {
      success: true,
      message: 'Role updated successfully',
      data: { memberId, role },
    };
  }

  async removeMember(userId: string, memberId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const member = await this.prisma.organisationMember.findFirst({
      where: { id: memberId, organisationId: organisation.id },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    const memberLabel =
      `${member.user.firstName} ${member.user.lastName}`.trim() ||
      member.user.email;
    await this.prisma.organisationMember.delete({
      where: { id: memberId },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Team Member Removed',
      details: `Removed ${memberLabel} from the organisation.`,
      level: 'info',
    });
    return {
      success: true,
      message: 'Member removed successfully',
      data: { memberId },
    };
  }

  async getKeyEmployees(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: {
        keyEmployees: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    return {
      success: true,
      data: {
        employees: organisation.keyEmployees.map((e) => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          name: `${e.firstName} ${e.lastName}`.trim(),
          title: e.title,
          bio: e.bio,
          email: e.email,
          linkedInUrl: e.linkedInUrl,
          sortOrder: e.sortOrder,
          createdAt: e.createdAt,
        })),
      },
    };
  }

  async createKeyEmployee(
    userId: string,
    dto: {
      firstName: string;
      lastName: string;
      title: string;
      bio?: string;
      email?: string;
      linkedInUrl?: string;
    },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: { keyEmployees: { orderBy: [{ sortOrder: 'desc' }], take: 1 } },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const nextOrder = (organisation.keyEmployees[0]?.sortOrder ?? -1) + 1;
    const employee = await this.prisma.organisationKeyEmployee.create({
      data: {
        organisationId: organisation.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        title: dto.title.trim(),
        bio: dto.bio && dto.bio.trim() ? dto.bio.trim() : null,
        email: dto.email && dto.email.trim() ? dto.email.trim() : null,
        linkedInUrl: this.normalizeLinkedInUrl(dto.linkedInUrl),
        sortOrder: nextOrder,
      },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Leadership Profile Added',
      details: `Added ${employee.firstName} ${employee.lastName} (${employee.title}) to public leadership.`,
      level: 'info',
    });
    return {
      success: true,
      message: 'Key employee added successfully',
      data: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        title: employee.title,
        bio: employee.bio,
        email: employee.email,
        linkedInUrl: employee.linkedInUrl,
        sortOrder: employee.sortOrder,
        createdAt: employee.createdAt,
      },
    };
  }

  async updateKeyEmployee(
    userId: string,
    employeeId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      title?: string;
      bio?: string;
      email?: string;
      linkedInUrl?: string;
    },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const employee = await this.prisma.organisationKeyEmployee.findFirst({
      where: { id: employeeId, organisationId: organisation.id },
    });
    if (!employee) throw new NotFoundException('Key employee not found');
    const updated = await this.prisma.organisationKeyEmployee.update({
      where: { id: employeeId },
      data: {
        ...(dto.firstName != null && { firstName: dto.firstName.trim() }),
        ...(dto.lastName != null && { lastName: dto.lastName.trim() }),
        ...(dto.title != null && { title: dto.title.trim() }),
        ...(dto.bio !== undefined && {
          bio: dto.bio && dto.bio.trim() ? dto.bio.trim() : null,
        }),
        ...(dto.email !== undefined && {
          email: dto.email && dto.email.trim() ? dto.email.trim() : null,
        }),
        ...(dto.linkedInUrl !== undefined && {
          linkedInUrl: this.normalizeLinkedInUrl(dto.linkedInUrl),
        }),
      },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Leadership Profile Updated',
      details: `Updated ${updated.firstName} ${updated.lastName} (${updated.title}).`,
      level: 'info',
    });
    return {
      success: true,
      message: 'Key employee updated successfully',
      data: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        name: `${updated.firstName} ${updated.lastName}`.trim(),
        title: updated.title,
        bio: updated.bio,
        email: updated.email,
        linkedInUrl: updated.linkedInUrl,
        sortOrder: updated.sortOrder,
        createdAt: updated.createdAt,
      },
    };
  }

  async deleteKeyEmployee(userId: string, employeeId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    const employee = await this.prisma.organisationKeyEmployee.findFirst({
      where: { id: employeeId, organisationId: organisation.id },
    });
    if (!employee) throw new NotFoundException('Key employee not found');
    const label = `${employee.firstName} ${employee.lastName}`.trim();
    await this.prisma.organisationKeyEmployee.delete({
      where: { id: employeeId },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Leadership Profile Removed',
      details: `Removed ${label} from public leadership.`,
      level: 'info',
    });
    return {
      success: true,
      message: 'Key employee removed successfully',
      data: { id: employeeId },
    };
  }

  async reorderKeyEmployees(userId: string, orderedIds: string[]) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: { keyEmployees: { select: { id: true } } },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');

    const existing = new Set(organisation.keyEmployees.map((e) => e.id));
    if (orderedIds.length !== existing.size) {
      throw new BadRequestException(
        'employeeIds must include every key employee exactly once',
      );
    }
    for (const id of orderedIds) {
      if (!existing.has(id)) {
        throw new BadRequestException(`Unknown employee id: ${id}`);
      }
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.organisationKeyEmployee.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Leadership Order Updated',
      details: 'Reordered leadership profiles on the public page.',
      level: 'info',
    });

    return {
      success: true,
      message: 'Employee order updated',
      data: { employeeIds: orderedIds },
    };
  }

  async setupOrganisation(
    userId: string,
    orgId: string,
    setupDto: OrganisationSetupDto,
  ) {
    // Verify user owns the organisation
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (organisation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this organisation',
      );
    }

    // Validate incorporation number if registered
    if (setupDto.incorporationStatus === 'registered') {
      if (
        !setupDto.incorporationNumber ||
        setupDto.incorporationNumber.length < 5 ||
        setupDto.incorporationNumber.length > 20
      ) {
        throw new BadRequestException('Invalid incorporation number format');
      }
    }

    // Calculate profile completeness
    let completeness = 0;
    if (setupDto.incorporationStatus) completeness += 10;
    if (setupDto.countryOfIncorporation) completeness += 10;
    if (setupDto.incorporationNumber) completeness += 10;
    if (setupDto.yearOfCommencement) completeness += 10;
    if (setupDto.industry) completeness += 10;
    if (setupDto.companySize) completeness += 10;
    if (setupDto.website) completeness += 10;
    if (setupDto.address) completeness += 20;
    if (setupDto.description) completeness += 10;

    // Update organisation
    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        incorporationStatus: setupDto.incorporationStatus,
        countryOfIncorporation: setupDto.countryOfIncorporation,
        incorporationNumber: setupDto.incorporationNumber,
        yearOfCommencement: setupDto.yearOfCommencement,
        industry: setupDto.industry,
        companySize: setupDto.companySize,
        website: setupDto.website,
        address: setupDto.address as any,
        description: setupDto.description,
        setupCompleted: true,
        profileCompleteness: completeness,
      },
    });

    void this.logOrganisationActivityFromUser(orgId, userId, {
      action: 'Organisation Setup Completed',
      details: 'Initial organisation setup was completed.',
      level: 'success',
    });

    return {
      success: true,
      message: 'Organisation profile updated successfully',
      data: {
        organisationId: updated.id,
        organisationName: updated.companyName,
        incorporationStatus: updated.incorporationStatus,
        countryOfIncorporation: updated.countryOfIncorporation,
        incorporationNumber: updated.incorporationNumber,
        yearOfCommencement: updated.yearOfCommencement,
        industry: updated.industry,
        companySize: updated.companySize,
        website: updated.website,
        verificationStatus: updated.verificationStatus,
        setupCompleted: updated.setupCompleted,
        profileCompleteness: updated.profileCompleteness,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async submitKybIncorporationDetails(
    userId: string,
    dto: KybIncorporationDto,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (organisation.verificationStatus === 'verified') {
      throw new BadRequestException('Organisation is already verified');
    }

    const docPayload = {
      kind: 'kyb_incorporation',
      legalName: dto.legalName.trim(),
      incorporationNumber: dto.incorporationNumber.trim(),
      countryOfIncorporation: dto.countryOfIncorporation.trim(),
      yearOfIncorporation: dto.yearOfIncorporation,
      submittedAt: new Date().toISOString(),
    };

    const estimatedCompletionDate = new Date();
    estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + 2);

    await this.prisma.$transaction(async (tx) => {
      await tx.organisation.update({
        where: { id: organisation.id },
        data: {
          companyName: dto.legalName.trim(),
          incorporationNumber: dto.incorporationNumber.trim(),
          countryOfIncorporation: dto.countryOfIncorporation.trim(),
          yearOfCommencement: dto.yearOfIncorporation,
          isRegistered: true,
          verificationStatus: 'under_review',
        },
      });

      const existing = await tx.organisationVerification.findFirst({
        where: {
          organisationId: organisation.id,
          status: { in: ['under_review', 'pending'] },
        },
        orderBy: { submittedAt: 'desc' },
      });

      if (existing) {
        await tx.organisationVerification.update({
          where: { id: existing.id },
          data: {
            documents: [docPayload] as any,
            estimatedCompletionDate,
            status: 'under_review',
          },
        });
      } else {
        await tx.organisationVerification.create({
          data: {
            organisationId: organisation.id,
            status: 'under_review',
            documents: [docPayload] as any,
            estimatedCompletionDate,
          },
        });
      }
    });

    const updated = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'KYB Submitted',
      details: 'Incorporation details submitted for verification review.',
      level: 'info',
    });

    return {
      success: true,
      message:
        'Incorporation details submitted successfully. Your organisation is now under review.',
      data: {
        verificationStatus: updated!.verificationStatus,
        incorporationNumber: updated!.incorporationNumber,
        countryOfIncorporation: updated!.countryOfIncorporation,
        yearOfCommencement: updated!.yearOfCommencement,
      },
    };
  }

  async requestVerification(
    userId: string,
    orgId: string,
    verificationDto: VerificationRequestDto,
  ) {
    // Verify user owns the organisation
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (organisation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this organisation',
      );
    }

    if (!organisation.setupCompleted) {
      throw new BadRequestException(
        'Organisation setup must be completed before requesting verification',
      );
    }

    // Validate document types
    const allowedTypes = [
      'certificate_of_incorporation',
      'business_registration',
      'tax_certificate',
      'other',
    ];
    for (const doc of verificationDto.documents) {
      if (!allowedTypes.includes(doc.type)) {
        throw new BadRequestException(`Invalid document type: ${doc.type}`);
      }
    }

    // Calculate estimated completion date (2 days from now)
    const estimatedCompletionDate = new Date();
    estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + 2);

    // Create verification request
    const verificationRequest =
      await this.prisma.organisationVerification.create({
        data: {
          organisationId: orgId,
          status: 'under_review',
          documents: verificationDto.documents as any,
          estimatedCompletionDate,
        },
      });

    // Update organisation verification status
    await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        verificationStatus: 'under_review',
      },
    });

    // TODO: Notify admin team

    return {
      success: true,
      message: 'Verification request submitted successfully',
      data: {
        verificationRequestId: verificationRequest.id,
        organisationId: orgId,
        status: verificationRequest.status,
        submittedAt: verificationRequest.submittedAt,
        estimatedCompletionDate: verificationRequest.estimatedCompletionDate,
      },
    };
  }

  async getBilling(userId: string, period?: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: {
        id: true,
        companyName: true,
        createdAt: true,
        updatedAt: true,
        address: true,
      },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Get subscription plan from organisation address JSON (default to 'starter' if not set)
    const addressData = (organisation.address as any) || {};
    const subscriptionPlan = addressData.subscriptionPlan || 'starter';
    const paymentValidation = addressData.paymentValidation;
    const pendingPayment = addressData.pendingPayment;
    const planUsageStats =
      (addressData.planUsageStats as Record<string, number>) || {};
    const tokenUsageStats =
      (addressData.tokenUsageStats as Record<string, number>) || {};
    const actualUsageStats = await this.buildOrganisationUsageStats(
      organisation.id,
      planUsageStats,
      tokenUsageStats,
      period,
    );

    // Calculate renewal/expiry date
    let renewalDate: Date | null = null;
    let subscriptionStartDate: Date | null = null;

    if (subscriptionPlan !== 'starter') {
      // If payment was validated, use validation date as start
      if (paymentValidation && paymentValidation.validatedAt) {
        subscriptionStartDate = new Date(paymentValidation.validatedAt);
      } else if (pendingPayment && pendingPayment.validatedAt) {
        subscriptionStartDate = new Date(pendingPayment.validatedAt);
      } else {
        // Use updatedAt as fallback (when subscription was set)
        subscriptionStartDate = organisation.updatedAt;
      }

      // Calculate renewal date from last known billing cycle on pending / validated payment
      const cycleRaw = String(
        pendingPayment?.billingCycle ||
          (addressData as any).lastSubscriptionBillingCycle ||
          'monthly',
      ).toLowerCase();
      renewalDate = new Date(subscriptionStartDate);

      if (cycleRaw === 'monthly') {
        renewalDate.setMonth(renewalDate.getMonth() + 1);
      } else if (cycleRaw === 'yearly' || cycleRaw === 'annual') {
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      } else {
        renewalDate.setMonth(renewalDate.getMonth() + 1);
      }
    }

    const monthlyNgn =
      await this.resolveOrganisationPlanMonthlyNgn(subscriptionPlan);
    const walletTokenBalance = Number(addressData.walletTokenBalance ?? 0);
    const walletApproxNgn = Number(
      addressData.walletApproxNgn ?? Math.round(walletTokenBalance * 35),
    );
    const walletApproxUsd = Number(
      addressData.walletApproxUsd ??
        Math.round(walletTokenBalance * 0.05 * 100) / 100,
    );
    const savedCardsCount = Number(addressData.savedCardsCount ?? 0);

    const dashboard = {
      upcomingPayment:
        subscriptionPlan !== 'starter' && renewalDate
          ? {
              amountNgn: monthlyNgn,
              currency: 'NGN',
              dueDate: renewalDate.toISOString(),
            }
          : null,
      wallet: {
        tokenBalance: walletTokenBalance,
        tokenSymbol: 'TTK',
        approximateNgn: walletApproxNgn,
        approximateUsd: walletApproxUsd,
      },
      savedCardsCount,
      currentPlan: {
        id: subscriptionPlan,
        displayName: this.planDashboardDisplayName(subscriptionPlan),
        amountNgnMonthly: monthlyNgn,
        nextBilling: renewalDate ? renewalDate.toISOString() : null,
        status: 'active',
      },
      planUsage: this.buildOrganisationPlanUsage(
        subscriptionPlan,
        actualUsageStats.planUsageStats,
      ),
      tokenUsage: this.buildOrganisationTokenUsage(
        subscriptionPlan,
        actualUsageStats.tokenUsageStats,
      ),
    };

    return {
      success: true,
      data: {
        plan: subscriptionPlan,
        status: 'active',
        organisationId: organisation.id,
        organisationName: organisation.companyName,
        renewalDate: renewalDate ? renewalDate.toISOString() : null,
        subscriptionStartDate: subscriptionStartDate
          ? subscriptionStartDate.toISOString()
          : null,
        // Payment method would come from a payment service integration
        paymentMethod:
          subscriptionPlan !== 'starter'
            ? {
                type: 'card',
                last4: '4242', // Placeholder - would come from payment service
              }
            : null,
        dashboard,
      },
    };
  }

  async getBillingHistory(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: {
        id: true,
        address: true,
        updatedAt: true,
      },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const addressData = (organisation.address as any) || {};
    const subscriptionPlan = addressData.subscriptionPlan || 'starter';
    const paymentValidation = addressData.paymentValidation;
    const pendingPayment = addressData.pendingPayment;

    const ledgerRows =
      await this.prisma.organisationBillingTransaction.findMany({
        where: { organisationId: organisation.id },
        orderBy: { occurredAt: 'desc' },
        take: 500,
      });

    type OrgBillingTransactionRow = {
      id: string;
      status: string;
      amountNgn: number;
      ttkDelta: number | null;
      ttkColor: 'teal' | 'red' | 'inherit' | null;
      type: string;
      description: string;
      date: string;
    };

    const mapLedgerRow = (
      row: (typeof ledgerRows)[0],
    ): OrgBillingTransactionRow => {
      const st = String(row.status).toLowerCase();
      const status =
        st === 'failed' ? 'failed' : st === 'pending' ? 'pending' : 'completed';
      return {
        id: row.reference || row.id,
        status,
        amountNgn: row.amountNgn,
        ttkDelta: row.ttkDelta ?? null,
        ttkColor:
          (row.ttkColor as OrgBillingTransactionRow['ttkColor']) ?? null,
        type: row.type,
        description: row.description,
        date: row.occurredAt.toISOString(),
      };
    };

    let transactions: OrgBillingTransactionRow[] = ledgerRows.map(mapLedgerRow);

    const billingHistory: any[] = [];

    if (transactions.length === 0) {
      if (paymentValidation && paymentValidation.validatedAt) {
        const validatedPayment = pendingPayment || {};
        const planPricing: { [key: string]: number } = {
          standard: 99,
          recruiter: 299,
          enterprise: 999,
        };
        const amount =
          validatedPayment.amount ||
          planPricing[validatedPayment.plan || subscriptionPlan] ||
          0;

        billingHistory.push({
          id: validatedPayment.reference || `payment-${organisation.id}`,
          amount,
          currency: 'USD',
          plan: validatedPayment.plan || subscriptionPlan,
          billingCycle: validatedPayment.billingCycle || 'monthly',
          status: 'success',
          paymentDate: paymentValidation.validatedAt,
          validatedBy: paymentValidation.adminName || 'Admin',
          transactionId: validatedPayment.reference,
        });
      }

      if (subscriptionPlan !== 'starter' && !paymentValidation) {
        const planPricing: { [key: string]: number } = {
          standard: 99,
          recruiter: 299,
          enterprise: 999,
        };
        const amount = planPricing[subscriptionPlan] || 0;

        billingHistory.push({
          id: `subscription-${organisation.id}`,
          amount,
          currency: 'USD',
          plan: subscriptionPlan,
          billingCycle: 'monthly',
          status: 'success',
          paymentDate: organisation.updatedAt.toISOString(),
          validatedBy: 'System',
          transactionId: `sub-${organisation.id}`,
        });
      }

      billingHistory.sort(
        (a, b) =>
          new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
      );

      const usdToNgn = (usd: number) => Math.round(Number(usd) * 1550);

      const mapLegacyToTransaction = (
        row: any,
        index: number,
      ): OrgBillingTransactionRow => {
        const usd = Number(row.amount) || 0;
        const amountNgn =
          String(row.currency || '').toUpperCase() === 'USD'
            ? usdToNgn(usd)
            : Math.round(usd);
        const ok = String(row.status || '').toLowerCase() === 'success';
        return {
          id: String(row.transactionId || row.id || `TXN-LEG-${index}`),
          status: ok ? 'completed' : 'failed',
          amountNgn,
          ttkDelta: null,
          ttkColor: null,
          type: 'subscription',
          description: `${String(row.plan || 'Plan')} — ${String(row.billingCycle || 'monthly')} charge`,
          date:
            typeof row.paymentDate === 'string'
              ? row.paymentDate
              : new Date(row.paymentDate).toISOString(),
        };
      };

      transactions = billingHistory.map(mapLegacyToTransaction);
    }

    transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return {
      success: true,
      data: {
        billingHistory,
        transactions,
      },
    };
  }

  /** Invoices issued from validated payments (stored). */
  async getBillingInvoices(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const rows = await this.prisma.organisationInvoice.findMany({
      where: { organisationId: organisation.id },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });

    const invoices = rows.map((r) => ({
      id: r.invoiceNumber,
      issuedAt: r.issuedAt.toISOString(),
      amountNgn: r.amountNgn,
      status: r.status,
      description: r.description,
      downloadUrl: r.downloadUrl ?? undefined,
    }));

    return {
      success: true,
      data: {
        invoices,
      },
    };
  }

  async updateSubscription(userId: string, plan: string) {
    const validPlans = ['starter', 'standard', 'recruiter', 'enterprise'];

    if (!validPlans.includes(plan)) {
      throw new BadRequestException(
        `Invalid plan. Must be one of: ${validPlans.join(', ')}`,
      );
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const addressData = (organisation.address as any) || {};
    const currentPlan = addressData.subscriptionPlan || 'starter';
    const currentIndex = validPlans.indexOf(currentPlan);
    const nextIndex = validPlans.indexOf(plan);
    if (currentPlan !== 'starter' && nextIndex < currentIndex) {
      throw new BadRequestException(
        'Active paid subscriptions can only be upgraded to a higher plan',
      );
    }

    // Update subscription plan in address JSON field
    // Note: In production, add subscriptionPlan: String? field to Organisation model
    await this.prisma.organisation.update({
      where: { userId },
      data: {
        address: {
          ...addressData,
          subscriptionPlan: plan,
        },
      },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Subscription Updated',
      details: `Billing plan changed to ${plan}.`,
      level: 'info',
    });

    return {
      success: true,
      message: `Subscription updated to ${plan} plan successfully`,
      data: {
        plan,
        status: 'active',
      },
    };
  }

  async initiatePayment(userId: string, paymentDto: InitiatePaymentDto) {
    const validPlans = ['starter', 'standard', 'recruiter', 'enterprise'];

    // Only allow organisation plans
    if (!validPlans.includes(paymentDto.plan)) {
      throw new BadRequestException(
        `Invalid plan for organisation. Must be one of: ${validPlans.join(', ')}`,
      );
    }

    // Don't allow payment for starter plan (it's free)
    if (paymentDto.plan === 'starter') {
      throw new BadRequestException(
        'Starter plan is free and does not require payment',
      );
    }

    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const addressData = (organisation.address as any) || {};
    const currentPlan = addressData.subscriptionPlan || 'starter';
    const currentIndex = validPlans.indexOf(currentPlan);
    const nextIndex = validPlans.indexOf(paymentDto.plan);
    if (currentPlan !== 'starter' && nextIndex <= currentIndex) {
      throw new BadRequestException(
        'Active paid subscriptions can only be upgraded to a higher plan',
      );
    }

    await ensureDefaultBillingPlans(this.prisma);
    const planRow = await this.prisma.billingSubscriptionPlan.findFirst({
      where: {
        entityType: BillingEntityType.organisation,
        planSlug: paymentDto.plan,
        isActive: true,
      },
    });
    if (!planRow) {
      throw new BadRequestException('Unknown or inactive subscription plan');
    }

    const billingCycle = paymentDto.billingCycle || 'monthly';
    const cycle = billingCycle.toLowerCase();
    const isAnnual = cycle === 'yearly' || cycle === 'annual';
    const amount = isAnnual
      ? Number(planRow.priceAnnualUsd ?? planRow.priceMonthlyUsd)
      : Number(planRow.priceMonthlyUsd);
    const amountNgn = isAnnual
      ? (planRow.priceAnnualNgn ??
        Math.round(Number(planRow.priceAnnualUsd ?? 0) * 1550))
      : (planRow.priceMonthlyNgn ??
        Math.round(Number(planRow.priceMonthlyUsd) * 1550));

    const paymentReference = `TAL-${organisation.id.substring(0, 8).toUpperCase()}-${Date.now()}`;

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5231';
    const paymentLink = `${baseUrl}/payment/process?reference=${paymentReference}&plan=${paymentDto.plan}&amount=${amount}&cycle=${billingCycle}`;

    await this.prisma.organisation.update({
      where: { userId },
      data: {
        address: {
          ...addressData,
          pendingPayment: {
            kind: 'subscription',
            reference: paymentReference,
            plan: paymentDto.plan,
            amount,
            amountNgn,
            billingCycle,
            initiatedAt: new Date().toISOString(),
            status: 'pending',
            paymentLink,
            paymentMethod: 'bank_transfer',
          },
        },
      },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Billing Payment Initiated',
      details: `Started bank transfer checkout for plan ${paymentDto.plan} (ref ${paymentReference}).`,
      level: 'info',
    });

    return {
      success: true,
      message: 'Payment initiated successfully',
      data: {
        paymentReference,
        paymentLink: null,
        bankDetails: this.getBankTransferDetails(),
        plan: paymentDto.plan,
        amount,
        billingCycle,
        currency: 'USD',
        amountNgn,
        organisationId: organisation.id,
        organisationName: organisation.companyName,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Link expires in 24 hours
      },
    };
  }

  async initiateWalletFund(userId: string, dto: InitiateWalletFundDto) {
    const ttkAmount = dto.ttkAmount;
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const TTK_NGN = 35;
    const TTK_USD = 0.05;
    const amountNgn = Math.round(ttkAmount * TTK_NGN);
    const amountUsd = Math.round(ttkAmount * TTK_USD * 100) / 100;
    const paymentReference = `TTK-${organisation.id.substring(0, 8).toUpperCase()}-${Date.now()}`;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5231';
    const paymentLink = `${baseUrl}/payment/process?reference=${encodeURIComponent(paymentReference)}&type=wallet_topup&ttk=${ttkAmount}&amount=${amountUsd}`;

    const addressData = (organisation.address as any) || {};
    await this.prisma.organisation.update({
      where: { userId },
      data: {
        address: {
          ...addressData,
          pendingPayment: {
            kind: 'wallet_topup',
            reference: paymentReference,
            ttkAmount,
            amount: amountUsd,
            amountNgn,
            initiatedAt: new Date().toISOString(),
            status: 'pending',
            paymentLink,
            paymentMethod: 'bank_transfer',
          },
        },
      },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Wallet Top-up Initiated',
      details: `Started bank transfer for ${ttkAmount} TTK (ref ${paymentReference}).`,
      level: 'info',
    });

    return {
      success: true,
      message: 'Wallet funding initiated',
      data: {
        paymentReference,
        paymentLink: null,
        bankDetails: this.getBankTransferDetails(),
        ttkAmount,
        amountUsd,
        amountNgn,
        currency: 'USD',
        organisationId: organisation.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  async confirmBankTransferPayment(userId: string, reference: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const addressData = (organisation.address as any) || {};
    const pendingPayment = addressData.pendingPayment;
    if (!pendingPayment || pendingPayment.reference !== reference) {
      throw new NotFoundException('Pending payment not found');
    }
    if (pendingPayment.status && pendingPayment.status !== 'pending') {
      throw new BadRequestException('Only pending payments can be confirmed');
    }

    const submittedAt = new Date().toISOString();
    await this.prisma.organisation.update({
      where: { userId },
      data: {
        address: {
          ...addressData,
          pendingPayment: {
            ...pendingPayment,
            status: 'pending',
            paymentMethod: 'bank_transfer',
            submittedAt,
          },
        },
      },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Bank Transfer Submitted',
      details: `Marked payment reference ${reference} as submitted for verification.`,
      level: 'info',
    });

    return {
      success: true,
      message: 'Payment submitted. It will be verified within 24 hours.',
      data: {
        paymentReference: reference,
        status: 'pending',
        submittedAt,
      },
    };
  }

  private getBankTransferDetails() {
    return {
      bank: 'First Bank',
      accountNo: '3041698890',
      accountName: 'Taldium Ltd',
    };
  }

  async createJob(userId: string, createJobDto: CreateJobDto) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const locationStr =
      createJobDto.locations?.length > 0
        ? createJobDto.locations.join(', ')
        : createJobDto.location;

    const payDto = createJobDto.pay as any;
    const payPayload =
      payDto.min != null && payDto.max != null
        ? {
            min: Number(payDto.min),
            max: Number(payDto.max),
            currency: payDto.currency || 'USD',
            type: payDto.type || 'Gross',
            period: payDto.period || 'Per annum',
          }
        : {
            amount: payDto.amount != null ? Number(payDto.amount) : 0,
            currency: payDto.currency || 'USD',
            type: payDto.type || 'Gross',
            period: payDto.period || 'Per annum',
          };

    const job = await this.prisma.job.create({
      data: {
        organisationId: organisation.id,
        jobTitle: createJobDto.jobTitle,
        department: createJobDto.department ?? null,
        location: locationStr,
        workMode: createJobDto.workMode as any,
        employmentType: createJobDto.employmentType as any,
        experienceYears: createJobDto.experienceYears,
        jobLevel: createJobDto.jobLevel ?? null,
        pay: payPayload,
        startDate: createJobDto.startDate
          ? new Date(createJobDto.startDate)
          : null,
        endDate: createJobDto.endDate ? new Date(createJobDto.endDate) : null,
        closingDate: createJobDto.closingDate
          ? new Date(createJobDto.closingDate)
          : null,
        description: createJobDto.description ?? '',
        requirements: createJobDto.requirements ?? [],
        applyCTA: createJobDto.applyCTA as any,
        qualifyingQuestions: (createJobDto as any).qualifyingQuestions ?? null,
        requiredApplicantData:
          (createJobDto as any).requiredApplicantData?.length > 0
            ? (createJobDto as any).requiredApplicantData
            : ['full_name', 'email'],
        distributionChannels:
          (createJobDto as any).distributionChannels?.length > 0
            ? (createJobDto as any).distributionChannels
            : ['taldium_network'],
        status: 'draft',
        postedBy: userId,
      },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Job Created',
      details: `Created draft "${job.jobTitle}".`,
      level: 'info',
    });

    return {
      success: true,
      message: 'Job created successfully',
      data: job,
    };
  }

  async updateJob(userId: string, jobId: string, updateDto: CreateJobDto) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const existing = await this.prisma.job.findFirst({
      where: { id: jobId, organisationId: organisation.id },
    });
    if (!existing) {
      throw new NotFoundException('Job not found');
    }

    const locationStr =
      (updateDto as any).locations?.length > 0
        ? (updateDto as any).locations.join(', ')
        : (updateDto.location ?? existing.location);

    const payDto = updateDto.pay as any;
    const payPayload =
      payDto?.min != null && payDto?.max != null
        ? {
            min: Number(payDto.min),
            max: Number(payDto.max),
            currency: payDto.currency || 'USD',
            type: payDto.type || 'Gross',
            period: payDto.period || 'Per annum',
          }
        : {
            amount: payDto?.amount != null ? Number(payDto.amount) : 0,
            currency: payDto?.currency || 'USD',
            type: payDto?.type || 'Gross',
            period: payDto?.period || 'Per annum',
          };

    const rawQualifying = (updateDto as any).qualifyingQuestions;
    const qualifyingQuestions =
      Array.isArray(rawQualifying) && rawQualifying.length > 0
        ? JSON.parse(JSON.stringify(rawQualifying))
        : null;
    const rawApplyCTA = updateDto.applyCTA;
    const applyCTA =
      rawApplyCTA && typeof rawApplyCTA === 'object'
        ? JSON.parse(JSON.stringify(rawApplyCTA))
        : undefined;
    const requiredApplicantData =
      (updateDto as any).requiredApplicantData?.length > 0
        ? [...((updateDto as any).requiredApplicantData as string[])]
        : ['full_name', 'email'];
    const distributionChannels =
      (updateDto as any).distributionChannels?.length > 0
        ? [...((updateDto as any).distributionChannels as string[])]
        : ['taldium_network'];

    const job = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        jobTitle: updateDto.jobTitle,
        department: updateDto.department ?? null,
        location: locationStr,
        workMode: updateDto.workMode as any,
        employmentType: updateDto.employmentType as any,
        experienceYears: updateDto.experienceYears ?? null,
        jobLevel: updateDto.jobLevel ?? null,
        pay: JSON.parse(JSON.stringify(payPayload)),
        startDate: updateDto.startDate ? new Date(updateDto.startDate) : null,
        endDate: updateDto.endDate ? new Date(updateDto.endDate) : null,
        closingDate: updateDto.closingDate
          ? new Date(updateDto.closingDate)
          : null,
        description: updateDto.description ?? '',
        requirements: Array.isArray(updateDto.requirements)
          ? updateDto.requirements
          : [],
        applyCTA,
        qualifyingQuestions,
        requiredApplicantData,
        distributionChannels,
      },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Job Updated',
      details: `Updated "${job.jobTitle}" (${jobId}).`,
      level: 'info',
    });

    return {
      success: true,
      message: 'Job updated successfully',
      data: job,
    };
  }

  async getSettingsRoles(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const counts = await this.prisma.organisationMember.groupBy({
      by: ['role'],
      where: { organisationId: organisation.id },
      _count: { _all: true },
    });
    const countMap = Object.fromEntries(
      counts.map((c) => [c.role, c._count._all]),
    ) as Record<string, number>;

    const roles: Array<{
      id: string;
      kind: 'system' | 'custom';
      roleKey: string | null;
      name: string;
      isSystem: boolean;
      description: string;
      memberCount: number;
      permissionCount: number;
      permissions: string[];
    }> = [];

    for (const roleKey of SETTINGS_ORG_ROLE_ORDER) {
      const meta = SYSTEM_ROLE_DEFINITIONS[roleKey];
      if (!meta) continue;
      const memberCount =
        roleKey === 'org_owner' ? 1 : (countMap[roleKey] ?? 0);
      roles.push({
        id: roleKey,
        kind: 'system',
        roleKey,
        name: meta.name,
        isSystem: meta.isSystem,
        description: meta.description,
        memberCount,
        permissionCount: meta.permissionCount,
        permissions: [...meta.permissionKeys].map(formatPermissionLabel),
      });
    }

    const customRows = await this.prisma.organisationCustomRole.findMany({
      where: { organisationId: organisation.id },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of customRows) {
      const keys = Array.isArray(row.permissions)
        ? (row.permissions as string[])
        : [];
      roles.push({
        id: row.id,
        kind: 'custom',
        roleKey: null,
        name: row.name,
        isSystem: false,
        description: row.description,
        memberCount: 0,
        permissionCount: keys.length,
        permissions: keys.map(formatPermissionKeyForDisplay),
      });
    }

    return {
      success: true,
      data: {
        roles,
        permissionCatalog: PERMISSION_CATALOG_SECTIONS,
      },
    };
  }

  async createOrganisationCustomRole(
    userId: string,
    dto: CreateOrganisationCustomRoleDto,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    if (!isValidGranularPermissionList(dto.permissions)) {
      throw new BadRequestException(
        'Invalid permissions: select at least one capability from the role catalog (e.g. jobs.create, applicants.view).',
      );
    }
    const created = await this.prisma.organisationCustomRole.create({
      data: {
        organisationId: organisation.id,
        name: dto.name.trim(),
        description: (dto.description ?? '').trim(),
        permissions: dto.permissions,
      },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Custom Role Created',
      details: `Created role "${created.name}".`,
      level: 'info',
    });
    return {
      success: true,
      message: 'Role created',
      data: {
        id: created.id,
        kind: 'custom' as const,
        roleKey: null,
        name: created.name,
        isSystem: false,
        description: created.description,
        memberCount: 0,
        permissionCount: dto.permissions.length,
        permissions: dto.permissions.map(formatPermissionKeyForDisplay),
      },
    };
  }

  async updateOrganisationCustomRole(
    userId: string,
    roleId: string,
    dto: UpdateOrganisationCustomRoleDto,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const existing = await this.prisma.organisationCustomRole.findFirst({
      where: { id: roleId, organisationId: organisation.id },
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
      !isValidCustomRolePermissionList(dto.permissions)
    ) {
      throw new BadRequestException(
        'Invalid permissions: use granular keys (e.g. jobs.create) or legacy module keys (e.g. jobs).',
      );
    }
    const updated = await this.prisma.organisationCustomRole.update({
      where: { id: roleId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.permissions !== undefined
          ? { permissions: dto.permissions }
          : {}),
      },
    });
    const keys = Array.isArray(updated.permissions)
      ? (updated.permissions as string[])
      : [];
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Custom Role Updated',
      details: `Updated role "${updated.name}".`,
      level: 'warning',
    });
    return {
      success: true,
      message: 'Role updated',
      data: {
        id: updated.id,
        kind: 'custom' as const,
        roleKey: null,
        name: updated.name,
        isSystem: false,
        description: updated.description,
        memberCount: 0,
        permissionCount: keys.length,
        permissions: keys.map(formatPermissionKeyForDisplay),
      },
    };
  }

  async deleteOrganisationCustomRole(userId: string, roleId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const existing = await this.prisma.organisationCustomRole.findFirst({
      where: { id: roleId, organisationId: organisation.id },
    });
    if (!existing) {
      throw new NotFoundException('Role not found');
    }
    const roleName = existing.name;
    await this.prisma.organisationCustomRole.delete({
      where: { id: roleId },
    });
    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Custom Role Deleted',
      details: `Deleted role "${roleName}".`,
      level: 'warning',
    });
    return { success: true, message: 'Role deleted' };
  }

  async getSettingsIntegrations(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const rows = await this.prisma.organisationIntegration.findMany({
      where: { organisationId: organisation.id, connected: true },
      select: { provider: true },
    });
    const connectedSet = new Set(rows.map((r) => r.provider));

    const sections = INTEGRATION_CATALOG.map((sec) => ({
      id: sec.id,
      title: sec.title,
      subtitle: sec.subtitle,
      sectionIcon: sec.sectionIcon,
      items: sec.items.map((it) => ({
        provider: it.provider,
        title: it.title,
        description: it.description,
        icon: it.icon,
        connected: connectedSet.has(it.provider),
      })),
    }));

    return { success: true, data: { sections } };
  }

  async connectIntegration(userId: string, provider: string) {
    if (!isIntegrationProvider(provider)) {
      throw new BadRequestException('Unknown integration provider');
    }
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    await this.prisma.organisationIntegration.upsert({
      where: {
        organisationId_provider: {
          organisationId: organisation.id,
          provider,
        },
      },
      create: {
        organisationId: organisation.id,
        provider,
        connected: true,
        metadata: { linkedAt: new Date().toISOString() },
      },
      update: {
        connected: true,
        metadata: { linkedAt: new Date().toISOString() },
      },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Integration Connected',
      details: `Connected ${provider.replace(/_/g, ' ')}.`,
      level: 'success',
    });

    return this.getSettingsIntegrations(userId);
  }

  async disconnectIntegration(userId: string, provider: string) {
    if (!isIntegrationProvider(provider)) {
      throw new BadRequestException('Unknown integration provider');
    }
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    await this.prisma.organisationIntegration.updateMany({
      where: { organisationId: organisation.id, provider },
      data: { connected: false },
    });

    void this.logOrganisationActivityFromUser(organisation.id, userId, {
      action: 'Integration Disconnected',
      details: `Disconnected ${provider.replace(/_/g, ' ')}.`,
      level: 'info',
    });

    return this.getSettingsIntegrations(userId);
  }

  async getSettingsActivityLog(
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
    const skip = (page - 1) * limit;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.organisationActivityLog.count({
        where: { organisationId: organisation.id },
      }),
      this.prisma.organisationActivityLog.findMany({
        where: { organisationId: organisation.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const entries = rows.map((r) => ({
      id: r.id,
      action: r.action,
      user: r.actorName,
      details: r.details,
      type: r.level,
      timestamp: r.createdAt.toISOString(),
    }));

    return {
      success: true,
      data: {
        entries,
        total,
        page,
        limit,
      },
    };
  }

  /** Append a row to the organisation activity log (call from other services or cron jobs). */
  async recordOrganisationActivity(params: {
    organisationId: string;
    action: string;
    actorName: string;
    actorUserId?: string | null;
    details: string;
    level: 'success' | 'info' | 'warning' | 'error';
  }) {
    await this.prisma.organisationActivityLog.create({
      data: {
        organisationId: params.organisationId,
        action: params.action,
        actorName: params.actorName,
        actorUserId: params.actorUserId ?? null,
        details: params.details,
        level: params.level,
      },
    });
  }

  private async logOrganisationActivityFromUser(
    organisationId: string,
    actorUserId: string,
    event: {
      action: string;
      details: string;
      level: 'success' | 'info' | 'warning' | 'error';
    },
  ) {
    try {
      const u = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { firstName: true, lastName: true, email: true },
      });
      const actorName =
        u != null
          ? `${(u.firstName ?? '').trim()} ${(u.lastName ?? '').trim()}`.trim() ||
            u.email
          : 'Unknown user';
      await this.recordOrganisationActivity({
        organisationId,
        action: event.action,
        actorName,
        actorUserId,
        details: event.details,
        level: event.level,
      });
    } catch (e) {
      console.warn('[organisation] activity log failed', e);
    }
  }

  /** System actor — e.g. scheduled job closed a listing. */
  async logOrganisationActivitySystem(
    organisationId: string,
    event: {
      action: string;
      details: string;
      level: 'success' | 'info' | 'warning' | 'error';
    },
  ) {
    try {
      await this.recordOrganisationActivity({
        organisationId,
        action: event.action,
        actorName: 'System',
        actorUserId: null,
        details: event.details,
        level: event.level,
      });
    } catch (e) {
      console.warn('[organisation] system activity log failed', e);
    }
  }
}
