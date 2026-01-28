import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';

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

    return {
      success: true,
      data: organisation,
    };
  }

  async updateOrganisationProfile(userId: string, updateDto: UpdateOrganisationProfileDto) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Calculate profile completeness
    let completeness = 0;
    const fields = {
      companyName: organisation.companyName || updateDto.companyName,
      industry: organisation.industry || updateDto.industry,
      companySize: organisation.companySize || updateDto.companySize,
      website: organisation.website || updateDto.website,
      description: organisation.description || updateDto.description,
      address: organisation.address || updateDto.address,
    };

    if (fields.companyName) completeness += 10;
    if (fields.industry) completeness += 10;
    if (fields.companySize) completeness += 10;
    if (fields.website) completeness += 10;
    if (fields.description) completeness += 10;
    if (fields.address) completeness += 20;
    if (organisation.incorporationStatus) completeness += 10;
    if (organisation.countryOfIncorporation) completeness += 10;
    if (organisation.yearOfCommencement) completeness += 10;

    const updated = await this.prisma.organisation.update({
      where: { userId },
      data: {
        ...(updateDto.companyName && { companyName: updateDto.companyName }),
        ...(updateDto.industry && { industry: updateDto.industry }),
        ...(updateDto.companySize && { companySize: updateDto.companySize }),
        ...(updateDto.website && { website: updateDto.website }),
        ...(updateDto.description && { description: updateDto.description }),
        ...(updateDto.address && { address: updateDto.address as any }),
        profileCompleteness: completeness,
      },
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
    const publishedJobs = jobs.filter(j => j.status === 'published').length;
    const activeJobs = jobs.filter(j => j.status === 'published' || j.status === 'paused').length;

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

  async getOrganisationJobs(userId: string, page: number = 1, limit: number = 20) {
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
        jobs: jobs.map(job => ({
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

  async getApplications(userId: string, page: number = 1, limit: number = 20, jobId?: string, status?: string) {
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

    return {
      success: true,
      data: {
        applications: applications.map(app => ({
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

  async getHiredProfessionals(userId: string, page: number = 1, limit: number = 20) {
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
        professionals: paginatedProfessionals.map(prof => ({
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

  async hireProfessional(userId: string, professionalId: string, jobId?: string) {
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

  async setupOrganisation(userId: string, orgId: string, setupDto: OrganisationSetupDto) {
    // Verify user owns the organisation
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (organisation.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this organisation');
    }

    // Validate incorporation number if registered
    if (setupDto.incorporationStatus === 'registered') {
      if (!setupDto.incorporationNumber || setupDto.incorporationNumber.length < 5 || setupDto.incorporationNumber.length > 20) {
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

  async requestVerification(userId: string, orgId: string, verificationDto: VerificationRequestDto) {
    // Verify user owns the organisation
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (organisation.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this organisation');
    }

    if (!organisation.setupCompleted) {
      throw new BadRequestException('Organisation setup must be completed before requesting verification');
    }

    // Validate document types
    const allowedTypes = ['certificate_of_incorporation', 'business_registration', 'tax_certificate', 'other'];
    for (const doc of verificationDto.documents) {
      if (!allowedTypes.includes(doc.type)) {
        throw new BadRequestException(`Invalid document type: ${doc.type}`);
      }
    }

    // Calculate estimated completion date (2 days from now)
    const estimatedCompletionDate = new Date();
    estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + 2);

    // Create verification request
    const verificationRequest = await this.prisma.organisationVerification.create({
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
}

