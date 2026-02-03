import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ApplyJobDto } from './dto/apply-job.dto';

@Injectable()
export class JobService {
  constructor(private prisma: PrismaService) {}

  async getOrganisationIdByUserId(userId: string): Promise<string | null> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { userId },
      select: { id: true },
    });
    return organisation?.id || null;
  }

  async createJob(userId: string, organisationId: string, createJobDto: CreateJobDto) {
    // Verify organisation exists
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      include: {
        members: true,
      },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Check if user is the organisation owner OR a member of the organisation
    const isOwner = organisation.userId === userId;
    const isMember = organisation.members.some(member => member.userId === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have permission to create jobs for this organisation');
    }

    // Create job
    const job = await this.prisma.job.create({
      data: {
        organisationId,
        jobTitle: createJobDto.jobTitle,
        location: createJobDto.location,
        workMode: createJobDto.workMode as any,
        employmentType: createJobDto.employmentType as any,
        experienceYears: createJobDto.experienceYears,
        jobLevel: createJobDto.jobLevel,
        pay: createJobDto.pay as any,
        closingDate: createJobDto.closingDate ? new Date(createJobDto.closingDate) : null,
        description: createJobDto.description,
        requirements: createJobDto.requirements,
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

  async getJobs(organisationId?: string) {
    const where: any = {};
    if (organisationId) {
      where.organisationId = organisationId;
    }

    const jobs = await this.prisma.job.findMany({
      where,
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
    });

    return {
      success: true,
      data: jobs.map(job => ({
        ...job,
        applicants: job.applications.length,
      })),
    };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        organisation: {
          select: {
            id: true,
            companyName: true,
            industry: true,
            companySize: true,
          },
        },
        applications: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Increment views
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        views: {
          increment: 1,
        },
      },
    });

    return {
      success: true,
      data: {
        ...job,
        applicants: job.applications.length,
      },
    };
  }

  async applyToJob(userId: string, jobId: string, applyJobDto: ApplyJobDto) {
    // Verify user is professional
    const professional = await this.prisma.professional.findFirst({
      where: { userId },
    });

    if (!professional) {
      throw new ForbiddenException('Only professionals can apply to jobs');
    }

    // Check if job exists
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'published') {
      throw new BadRequestException('Job is not available for applications');
    }

    // Check if already applied
    const existingApplication = await this.prisma.jobApplication.findUnique({
      where: {
        jobId_professionalId: {
          jobId,
          professionalId: professional.id,
        },
      },
    });

    if (existingApplication) {
      throw new BadRequestException('You have already applied to this job');
    }

    // Check verification requirements if specified
    const applyCTA = job.applyCTA as any;
    if (applyCTA && applyCTA.requireVerification) {
      const requiredVerifications = applyCTA.requireVerification as string[];
      
      // Check identity verification
      if (requiredVerifications.includes('Identity')) {
        if (professional.identityStatus !== 'verified') {
          throw new BadRequestException('Identity verification is required to apply for this job');
        }
      }

      // Check education verification
      if (requiredVerifications.includes('Education')) {
        const education = await this.prisma.education.findFirst({
          where: {
            professionalId: professional.id,
            verificationStatus: 'verified',
          },
        });

        if (!education) {
          throw new BadRequestException('Education verification is required to apply for this job');
        }
      }
    }

    // Create application
    const application = await this.prisma.jobApplication.create({
      data: {
        jobId,
        professionalId: professional.id,
        applicationData: applyJobDto.applicationData as any,
        status: 'pending',
      },
    });

    return {
      success: true,
      message: 'Application submitted successfully',
      data: application,
    };
  }

  async publishJob(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        organisation: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.organisation.userId !== userId) {
      throw new ForbiddenException('You do not have permission to publish this job');
    }

    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'published',
      },
    });

    return {
      success: true,
      message: 'Job published successfully',
      data: updated,
    };
  }
}

