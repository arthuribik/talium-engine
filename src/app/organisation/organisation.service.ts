import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CreateJobDto } from '../job/dto/create-job.dto';
import { ResendEntity } from '../../utility/mail';

@Injectable()
export class OrganisationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly mailService: ResendEntity,
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
    const headquartersCity = addressData.headquartersCity || addressData.city || null;
    const headquartersCountry = addressData.headquartersCountry || addressData.country || null;

    // Format founded date from yearOfCommencement
    const foundedDate = organisation.yearOfCommencement
      ? `${organisation.yearOfCommencement}-01-01`
      : null;

    // Determine legalName and organisationName based on registration status
    // For registered: companyName is the legalName
    // For non-registered: companyName is the organisationName
    const legalName = organisation.isRegistered ? organisation.companyName : null;
    const organisationName = !organisation.isRegistered ? organisation.companyName : null;
    
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
      organisationCountry: !organisation.isRegistered ? organisation.country : null,
      
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
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
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
    const sym = pay.currency === 'USD' ? '$' : pay.currency === 'GBP' ? '£' : pay.currency === 'EUR' ? '€' : pay.currency || '';
    const period = pay.period === 'Per annum' ? 'yearly' : pay.period === 'Per month' ? 'monthly' : pay.period || '';
    const periodStr = period ? ` / ${period}` : '';
    const fmt = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (pay.min != null && pay.max != null) {
      return `${sym}${fmt(Number(pay.min))} - ${sym}${fmt(Number(pay.max))}${periodStr}`;
    }
    const amount = pay.amount != null ? Number(pay.amount) : null;
    if (amount == null) return '—';
    return `${sym}${fmt(amount)}${periodStr}`;
  }

  private workModeLabel(mode: string): string {
    const map: Record<string, string> = {
      remote: 'Location Remote',
      hybrid: 'Hybrid',
      on_site: 'On Site',
      global_remote: 'Global Remote',
    };
    return map[mode] || mode;
  }

  private employmentTypeLabel(type: string): string {
    const map: Record<string, string> = {
      full_time: 'Full Time',
      part_time: 'Part Time',
      contract: 'Contract',
      internship: 'Internship',
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

    const payJson = (job: any) => (typeof job.pay === 'string' ? (() => { try { return JSON.parse(job.pay); } catch { return {}; } })() : job.pay) || {};

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
    const payRaw = typeof job.pay === 'string' ? (() => { try { return JSON.parse(job.pay as string); } catch { return {}; } })() : (job.pay as object) || {};
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
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const updateData: { status: string; applicationData?: any } = { status };
    if (status === 'rejected' && reason != null && String(reason).trim()) {
      const existing = (application.applicationData as any) || {};
      updateData.applicationData = { ...existing, rejectionReason: String(reason).trim() };
    }

    // Update application status
    const updated = await this.prisma.jobApplication.update({
      where: { id: applicationId },
      data: updateData,
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

    return {
      success: true,
      message: `Job status updated to ${status} successfully`,
      data: updated,
    };
  }

  async getAvailablePlans() {
    // Return available subscription plans for organisations
    return {
      success: true,
      data: [
        {
          id: 'starter',
          name: 'Starter Plan',
          price: 0,
          description: 'Default plan, no payment, no commitment',
          features: [
            'Basic job posting',
            'Standard support',
            'Basic analytics',
            'Up to 5 active job postings',
          ],
        },
        {
          id: 'standard',
          name: 'Standard Plan',
          price: 99,
          description: 'Extra value and optimized recruitment experience',
          features: [
            'Unlimited job postings',
            'Advanced analytics',
            'Priority support',
            'Custom branding',
            'Candidate filtering',
            'Application management',
          ],
        },
        {
          id: 'recruiter',
          name: 'Recruiter Plan',
          price: 299,
          description:
            'Full suite recruitment, onboarding and offboarding package',
          features: [
            'Everything in Standard',
            'Recruitment suite',
            'Onboarding tools',
            'Offboarding management',
            'Team collaboration',
            'Advanced reporting',
            'Dedicated support',
          ],
        },
        {
          id: 'enterprise',
          name: 'Enterprise Plan',
          price: 999,
          description: 'Suitable for large organisations',
          features: [
            'Everything in Recruiter',
            'Custom integrations',
            'Dedicated account manager',
            'SLA guarantee',
            'On-premise option',
            'White-label solution',
            'API access',
            'Custom workflows',
          ],
        },
      ],
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

    const { page, limit, search, jobTitle, searchType, country, city, verified, minExperience } = filters;
    const skip = (page - 1) * limit;

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

    // Filter by country
    if (country) {
      where.country = {
        contains: country,
        mode: 'insensitive',
      };
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

    // Get professionals with work experience for years calculation
    const [professionals, total] = await Promise.all([
      this.prisma.professional.findMany({
        where,
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
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.professional.count({ where }),
    ]);

    // Calculate years of experience and filter by it
    const professionalsWithExperience = professionals
      .map((prof) => {
        let yearsOfExperience = 0;
        if (prof.workExperience && prof.workExperience.length > 0) {
          const earliestStart = prof.workExperience.reduce((earliest, exp) => {
            const startDate = new Date(exp.startDate);
            return !earliest || startDate < earliest ? startDate : earliest;
          }, null as Date | null);

          if (earliestStart) {
            const endDate = prof.workExperience.some((exp) => exp.currentlyWorking)
              ? new Date()
              : prof.workExperience.reduce((latest, exp) => {
                  const endDate = exp.endDate ? new Date(exp.endDate) : new Date();
                  return !latest || endDate > latest ? endDate : latest;
                }, null as Date | null) || new Date();

            yearsOfExperience = Math.floor(
              (endDate.getTime() - earliestStart.getTime()) / (1000 * 60 * 60 * 24 * 365),
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
          const name = `${(prof as any).user?.firstName || ''} ${(prof as any).user?.lastName || ''}`.trim().toLowerCase();
          const email = ((prof as any).user?.email || '').toLowerCase();
          const professionMatch = prof.profession?.toLowerCase().includes(term);
          const countryMatch = (prof.country || '').toLowerCase().includes(term);
          const cityMatch = prof.workExperience?.some((exp) => {
            const loc = (exp as any).location;
            const c = (loc?.city || '').toLowerCase();
            return c && c.includes(term);
          });
          if (!(name.includes(term) || email.includes(term) || professionMatch || countryMatch || cityMatch)) {
            return false;
          }
        }

        // Filter by minimum experience
        if (minExperience !== undefined && prof.yearsOfExperience < minExperience) {
          return false;
        }

        // Filter by job title (profession) - strict = exact match, partial = contains, fuzzy = all words in title appear in role
        if (jobTitle && prof.profession) {
          const title = jobTitle.toLowerCase().trim();
          const role = prof.profession.toLowerCase();
          if (searchType === 'strict') {
            if (role !== title) return false;
          } else if (searchType === 'fuzzy') {
            const words = title.split(/\s+/).filter(Boolean);
            const allWordsMatch = words.every((word) => role.includes(word));
            if (!allWordsMatch) return false;
          } else {
            if (!role.includes(title)) return false;
          }
        }

        // Filter by city (if we have location data in work experience)
        if (city) {
          const hasCityMatch = prof.workExperience?.some((exp) => {
            const location = exp.location as any;
            return location?.city?.toLowerCase().includes(city.toLowerCase());
          });
          if (!hasCityMatch && prof.country?.toLowerCase() !== city.toLowerCase()) {
            return false;
          }
        }

        return true;
      });

    // Get verification status (percentage + label for badges)
    const getVerificationStatus = (prof: any) => {
      const completeness = Math.min(100, prof.profileCompleteness || 0);
      if (prof.identityStatus === 'verified') {
        return { percentage: Math.max(completeness, 100), status: 'Verified with Gov ID' };
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

    return {
      success: true,
      data: {
        professionals: professionalsWithExperience.map((prof) => ({
          id: prof.id,
          userId: prof.userId,
          name: `${prof.user.firstName || ''} ${prof.user.lastName || ''}`.trim() || prof.user.email,
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
        })),
        pagination: {
          page,
          limit,
          total: professionalsWithExperience.length,
          totalPages: Math.ceil(professionalsWithExperience.length / limit),
        },
      },
    };
  }

  async scoutSearch(userId: string, dto: {
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
  }) {
    const country = dto.location && dto.location.toLowerCase() !== 'global' ? dto.location : undefined;
    let city: string | undefined;
    if (dto.domicile && dto.domicile.trim()) {
      const parts = dto.domicile.split(',').map((p) => p.trim()).filter(Boolean);
      city = parts[0]; // e.g. "Lagos" from "Lagos, Nigeria"
    }
    return this.searchProfessionals(userId, {
      page: 1,
      limit: 100,
      jobTitle: dto.jobTitle,
      searchType: dto.searchType || 'partial',
      country,
      city,
    });
  }

  async getProfessionalByIdForOrganisation(userId: string, professionalId: string) {
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
      const earliest = workExp.reduce((min, e) => {
        const d = new Date(e.startDate);
        return !min || d < min ? d : min;
      }, null as Date | null);
      const latest = workExp.some((e) => e.currentlyWorking)
        ? new Date()
        : workExp.reduce((max, e) => {
            const d = e.endDate ? new Date(e.endDate) : new Date();
            return !max || d > max ? d : max;
          }, null as Date | null) || new Date();
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
        name: `${professional.user.firstName || ''} ${professional.user.lastName || ''}`.trim() || professional.user.email,
        email: professional.user.email,
        country: professional.country,
        nationality: getNationality(professional),
        description: profAny.description || null,
        socialMedia: profAny.socialMedia || {},
        profileImage: profAny.profileImage || null,
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
          subject: subject || (jobTitle ? `Headhunt Offer: ${jobTitle} at ${organisation.companyName}` : 'Message from Organisation'),
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
    organisation: { companyName: string; industry?: string | null; country?: string | null },
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
    if (employmentType) text += `\n\nEmployment Type: ${employmentType}`;
    if (workMode) text += `\nWork Mode: ${workMode}`;
    if (location) text += `\nLocation: ${location}`;
    if (description) text += `\n\nJob Description:\n${description}`;
    if (message && jobTitle) text += `\n\n${message}`;
    text += '\n\nPlease review the offer and Job description and respond as soon as possible.';
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
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

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

      const scoutMessage = this.buildScoutMessage(organisation, jobTitle, employmentType, workMode, location, description, message);
      if (scoutMessage) {
        await this.sendMessageToProfessional(
          userId,
          professionalId,
          scoutMessage,
          'Hiring Notification',
          jobTitle,
        );
      }

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
    const scoutMessage = this.buildScoutMessage(organisation, jobTitle, employmentType, workMode, location, description, message);
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
    const orgAdmins = organisation.members.filter((m) => m.role === 'org_admin').length;
    const editors = organisation.members.filter((m) => m.role === 'org_recruiter').length;
    const viewers = organisation.members.filter((m) => m.role === 'org_member').length;
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
      name: `${organisation.user.firstName} ${organisation.user.lastName}`.trim() || 'Owner',
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
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });
    if (!organisation) throw new NotFoundException('Organisation not found');
    if (dto.role === 'org_owner') {
      throw new BadRequestException('Cannot invite as owner');
    }
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
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
        organisationId_email: { organisationId: organisation.id, email: dto.email.toLowerCase() },
      },
    });
    if (existingInvite) {
      throw new BadRequestException('An invitation has already been sent to this email');
    }
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.organisationInvitation.create({
      data: {
        organisationId: organisation.id,
        email: dto.email.toLowerCase(),
        role: dto.role as any,
        token,
        expiresAt,
      },
    });
    try {
      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?invite=${token}`;
      await this.mailService.send(
        {
          to: dto.email,
          subject: `Invitation to join ${organisation.companyName} on Taldium`,
        },
        `<div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>You've been invited to join ${organisation.companyName}</h2>
          <p>Click the link below to accept the invitation and join the team.</p>
          <p><a href="${inviteLink}" style="color: #2563eb;">Accept invitation</a></p>
          <p>This link expires in 7 days.</p>
        </div>`,
      );
    } catch (e) {
      console.error('Failed to send invite email:', e);
    }
    return {
      success: true,
      message: 'Invitation sent successfully',
      data: { email: dto.email, role: dto.role },
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
    });
    if (!member) throw new NotFoundException('Member not found');
    await this.prisma.organisationMember.update({
      where: { id: memberId },
      data: { role: role as any },
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
    });
    if (!member) throw new NotFoundException('Member not found');
    await this.prisma.organisationMember.delete({
      where: { id: memberId },
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
        bio: (dto.bio && dto.bio.trim()) ? dto.bio.trim() : null,
        email: (dto.email && dto.email.trim()) ? dto.email.trim() : null,
        linkedInUrl: (dto.linkedInUrl && dto.linkedInUrl.trim()) ? dto.linkedInUrl.trim() : null,
        sortOrder: nextOrder,
      },
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
        ...(dto.bio !== undefined && { bio: (dto.bio && dto.bio.trim()) ? dto.bio.trim() : null }),
        ...(dto.email !== undefined && { email: (dto.email && dto.email.trim()) ? dto.email.trim() : null }),
        ...(dto.linkedInUrl !== undefined && { linkedInUrl: (dto.linkedInUrl && dto.linkedInUrl.trim()) ? dto.linkedInUrl.trim() : null }),
      },
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
    await this.prisma.organisationKeyEmployee.delete({
      where: { id: employeeId },
    });
    return {
      success: true,
      message: 'Key employee removed successfully',
      data: { id: employeeId },
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

  async getBilling(userId: string) {
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

      // Calculate renewal date (add 1 month for monthly billing)
      // In production, this would use the actual billing cycle from the payment
      const billingCycle = pendingPayment?.billingCycle || 'monthly';
      renewalDate = new Date(subscriptionStartDate);

      if (billingCycle === 'monthly') {
        renewalDate.setMonth(renewalDate.getMonth() + 1);
      } else if (billingCycle === 'yearly') {
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      } else {
        // Default to monthly
        renewalDate.setMonth(renewalDate.getMonth() + 1);
      }
    }

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

    const billingHistory: any[] = [];

    // If there's a validated payment, add it to history
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

    // If subscription plan is active and not starter, add current subscription as history entry
    if (subscriptionPlan !== 'starter' && !paymentValidation) {
      // This means subscription was set but no validation record exists
      // We'll still show it as a successful transaction
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

    // Sort by payment date (newest first)
    billingHistory.sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
    );

    return {
      success: true,
      data: {
        billingHistory,
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

    // Update subscription plan in address JSON field
    // Note: In production, add subscriptionPlan: String? field to Organisation model
    await this.prisma.organisation.update({
      where: { userId },
      data: {
        address: {
          ...((organisation.address as any) || {}),
          subscriptionPlan: plan,
        },
      },
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

    // Plan pricing
    const planPricing: { [key: string]: number } = {
      standard: 99,
      recruiter: 299,
      enterprise: 999,
    };

    const amount = planPricing[paymentDto.plan] || 0;
    const billingCycle = paymentDto.billingCycle || 'monthly';

    // Generate payment reference/ID
    const paymentReference = `TAL-${organisation.id.substring(0, 8).toUpperCase()}-${Date.now()}`;

    // Generate payment link
    // In production, this would integrate with a payment gateway (Stripe, PayPal, etc.)
    // For now, we'll generate a mock payment link
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5231';
    const paymentLink = `${baseUrl}/payment/process?reference=${paymentReference}&plan=${paymentDto.plan}&amount=${amount}&cycle=${billingCycle}`;

    // Store payment initiation in address JSON (in production, use a Payment model)
    const addressData = (organisation.address as any) || {};
    await this.prisma.organisation.update({
      where: { userId },
      data: {
        address: {
          ...addressData,
          pendingPayment: {
            reference: paymentReference,
            plan: paymentDto.plan,
            amount,
            billingCycle,
            initiatedAt: new Date().toISOString(),
            status: 'pending',
          },
        },
      },
    });

    return {
      success: true,
      message: 'Payment initiated successfully',
      data: {
        paymentReference,
        paymentLink,
        plan: paymentDto.plan,
        amount,
        billingCycle,
        currency: 'USD',
        organisationId: organisation.id,
        organisationName: organisation.companyName,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Link expires in 24 hours
      },
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
        startDate: createJobDto.startDate ? new Date(createJobDto.startDate) : null,
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
        : updateDto.location ?? existing.location;

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
        closingDate: updateDto.closingDate ? new Date(updateDto.closingDate) : null,
        description: updateDto.description ?? '',
        requirements: Array.isArray(updateDto.requirements) ? updateDto.requirements : [],
        applyCTA,
        qualifyingQuestions,
        requiredApplicantData,
        distributionChannels,
      },
    });

    return {
      success: true,
      message: 'Job updated successfully',
      data: job,
    };
  }
}
