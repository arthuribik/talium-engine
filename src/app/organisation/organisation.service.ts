import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CreateJobDto } from '../job/dto/create-job.dto';

@Injectable()
export class OrganisationService {
  constructor(private prisma: PrismaService) {}

  async getOrganisationProfile(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
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
      },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Extract address and social media from address JSON
    const addressData = (organisation.address as any) || {};
    const socialMedia = addressData.socialMedia || {};

    // Format the response to include all fields
    const orgData = organisation as any;
    const profileData = {
      ...organisation,
      // Basic Information
      companyName: organisation.companyName || null,
      legalName: orgData.legalName || null,
      otherName: orgData.otherName || null,
      description: organisation.description || null,

      // Registration Status
      isRegistered: organisation.isRegistered ?? null,

      // Incorporation Details
      countryOfIncorporation: organisation.countryOfIncorporation || null,
      incorporationNumber: organisation.incorporationNumber || null,

      // Organisation Details (for non-registered)
      organisationCountry: orgData.organisationCountry || null,

      // Category
      category: orgData.category || null,
      schoolType: orgData.schoolType || null,
      religiousOrgType: orgData.religiousOrgType || null,
      internationalOrgType: orgData.internationalOrgType || null,
      politicalPartyCountry: orgData.politicalPartyCountry || null,
      associatedSchool: orgData.associatedSchool || null,

      // Business Details
      industry: organisation.industry || null,
      companySize: organisation.companySize || null,
      headquartersCity: orgData.headquartersCity || null,
      headquartersCountry: orgData.headquartersCountry || null,
      foundedDate: orgData.foundedDate
        ? orgData.foundedDate.toISOString().split('T')[0]
        : null,

      // Contact & Online
      website: organisation.website || null,
      socialMedia: {
        facebook: socialMedia.facebook || null,
        twitter: socialMedia.twitter || null,
        linkedin: socialMedia.linkedin || null,
        instagram: socialMedia.instagram || null,
        youtube: socialMedia.youtube || null,
      },

      // Address
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

  async getDashboardStats(userId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Get all jobs for this organisation
    const jobs = await this.prisma.job.findMany({
      where: { organisationId: organisation.id },
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

    const totalJobs = jobs.length;
    const publishedJobs = jobs.filter((j) => j.status === 'published').length;
    const activeJobs = jobs.filter(
      (j) => j.status === 'published' || j.status === 'paused',
    ).length;

    // Calculate applications stats
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

    return {
      success: true,
      data: {
        totalJobs,
        activeJobs,
        publishedJobs,
        totalApplications,
        pendingApplications,
        hiredProfessionals: hiredProfessionalIds.size, // Unique professionals
      },
    };
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

    // Update application status
    const updated = await this.prisma.jobApplication.update({
      where: { id: applicationId },
      data: { status },
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

  async hireProfessional(
    userId: string,
    professionalId: string,
    jobId?: string,
  ) {
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

    // If no jobId, just mark as hired (general hire)
    // This could create a record or just return success
    return {
      success: true,
      message: 'Professional hired successfully',
      data: {
        professionalId,
      },
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
    // console.log('createJobDto', createJobDto);
    console.log('userId', userId);

    // Get organisation for the authenticated user
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    console.log('organisation', organisation);

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Create job
    const job = await this.prisma.job.create({
      data: {
        organisationId: organisation.id,
        jobTitle: createJobDto.jobTitle,
        location: createJobDto.location,
        workMode: createJobDto.workMode as any,
        employmentType: createJobDto.employmentType as any,
        experienceYears: createJobDto.experienceYears,
        jobLevel: createJobDto.jobLevel,
        pay: createJobDto.pay as any,
        closingDate: createJobDto.closingDate
          ? new Date(createJobDto.closingDate)
          : null,
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
}
