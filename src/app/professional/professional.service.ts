import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { IdentityVerifyDto } from './dto/identity-verify.dto';
import { AddEducationDto } from './dto/add-education.dto';
import { AddExperienceDto } from './dto/add-experience.dto';
import { InitiatePaymentDto } from '../organisation/dto/initiate-payment.dto';

@Injectable()
export class ProfessionalService {
  constructor(private prisma: PrismaService) {}

  async verifyPassword(userId: string, password: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user?.password) {
      throw new UnauthorizedException('Invalid password');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }
    return { success: true };
  }

  async uploadIdDocument(
    userId: string,
    file: { buffer: Buffer; originalname: string },
  ): Promise<{ url: string }> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const dir = path.join(process.cwd(), 'uploads', 'id-documents');
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(file.originalname) || '';
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${professional.id}-${Date.now()}-${safeName}`;
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, file.buffer);
    const url = `/uploads/id-documents/${filename}`;
    return { url };
  }

  async verifyIdentity(
    userId: string,
    profId: string,
    identityDto: IdentityVerifyDto,
  ) {
    // Verify user is professional entity
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    if (professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this profile',
      );
    }

    // Validate date of birth (must be 16+ years old)
    const dob = new Date(identityDto.dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      if (age < 17) {
        throw new BadRequestException('User must be at least 16 years old');
      }
    } else if (age < 16) {
      throw new BadRequestException('User must be at least 16 years old');
    }

    // Validate liveness check
    if (identityDto.livenessCheckData.status !== 'completed') {
      throw new BadRequestException('Liveness check must be completed');
    }

    // TODO: Call third-party identity verification API (YouVerify)
    // For now, we'll simulate the verification

    // Create or update identity verification
    const identityVerification = await this.prisma.identityVerification.upsert({
      where: { professionalId: profId },
      update: {
        nationality: identityDto.nationality,
        idType: identityDto.idType as any,
        idNumber: identityDto.idNumber,
        dateOfBirth: dob,
        livenessCheckData: identityDto.livenessCheckData as any,
        status: 'verified',
        verifiedAt: new Date(),
      },
      create: {
        professionalId: profId,
        nationality: identityDto.nationality,
        idType: identityDto.idType as any,
        idNumber: identityDto.idNumber,
        dateOfBirth: dob,
        livenessCheckData: identityDto.livenessCheckData as any,
        status: 'verified',
        verifiedAt: new Date(),
      },
    });

    // Update professional profile
    await this.prisma.professional.update({
      where: { id: profId },
      data: {
        nationality: identityDto.nationality,
        dateOfBirth: dob,
        identityVerified: true,
        identityStatus: 'verified',
      },
    });

    return {
      success: true,
      message: 'Identity verification completed successfully',
      data: {
        verificationId: identityVerification.id,
        status: identityVerification.status,
        details: {
          livenessCheckPassed: true,
        },
      },
    };
  }

  async addEducation(
    userId: string,
    profId: string,
    educationDto: AddEducationDto,
  ) {
    // Verify user is professional entity
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    if (professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this profile',
      );
    }

    // Create education record
    const education = await this.prisma.education.create({
      data: {
        professionalId: profId,
        levelOfEducation: educationDto.levelOfEducation as any,
        programLevel: educationDto.programLevel,
        institutionName: educationDto.institutionName,
        degreeType: educationDto.degreeType,
        fieldOfStudy: educationDto.fieldOfStudy,
        startDate: educationDto.startDate,
        endDate: educationDto.endDate,
        currentlyAttending: educationDto.currentlyAttending,
        grade: educationDto.grade,
        costOfEducation: educationDto.costOfEducation,
        currency: educationDto.currency,
        country: educationDto.country,
        verificationDocuments: educationDto.verificationDocuments as any,
        verificationStatus: 'pending',
      },
    });

    return {
      success: true,
      message: 'Education added successfully',
      data: education,
    };
  }

  async addExperience(
    userId: string,
    profId: string,
    experienceDto: AddExperienceDto,
  ) {
    // Verify user is professional entity
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    if (professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this profile',
      );
    }

    // Create work experience record
    const experience = await this.prisma.workExperience.create({
      data: {
        professionalId: profId,
        organisationName: experienceDto.organisationName,
        industry: experienceDto.industry,
        location: experienceDto.location as any,
        role: experienceDto.role,
        employmentType: experienceDto.employmentType as any,
        workMode: experienceDto.workMode as any,
        startDate: experienceDto.startDate,
        endDate: experienceDto.endDate,
        currentlyWorking: experienceDto.currentlyWorking,
        responsibilities: experienceDto.responsibilities,
        achievements: experienceDto.achievements,
        paymentMode: experienceDto.paymentMode,
        currency: experienceDto.currency,
        salaryRange: experienceDto.salaryRange as any,
        verificationContact: experienceDto.verificationContact as any,
        verificationStatus: 'pending',
      },
    });

    return {
      success: true,
      message: 'Work experience added successfully',
      data: experience,
    };
  }

  async updateEducation(
    userId: string,
    educationId: string,
    educationDto: AddEducationDto,
  ) {
    const education = await this.prisma.education.findUnique({
      where: { id: educationId },
      include: { professional: true },
    });

    if (!education) {
      throw new NotFoundException('Education record not found');
    }

    if (education.professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this education record',
      );
    }

    const updated = await this.prisma.education.update({
      where: { id: educationId },
      data: {
        levelOfEducation: educationDto.levelOfEducation as any,
        programLevel: educationDto.programLevel,
        institutionName: educationDto.institutionName,
        degreeType: educationDto.degreeType,
        fieldOfStudy: educationDto.fieldOfStudy,
        startDate: educationDto.startDate,
        endDate: educationDto.endDate,
        currentlyAttending: educationDto.currentlyAttending,
        grade: educationDto.grade,
        costOfEducation: educationDto.costOfEducation,
        currency: educationDto.currency,
        country: educationDto.country,
        verificationDocuments: educationDto.verificationDocuments as any,
        verificationStatus: 'pending',
        verifiedAt: null,
        reviewedBy: null,
      },
    });

    await this.prisma.professional.update({
      where: { id: education.professionalId },
      data: { verifiedByAdminAt: null },
    });

    return {
      success: true,
      message: 'Education updated successfully',
      data: updated,
    };
  }

  async updateExperience(
    userId: string,
    experienceId: string,
    experienceDto: AddExperienceDto,
  ) {
    const experience = await this.prisma.workExperience.findUnique({
      where: { id: experienceId },
      include: { professional: true },
    });

    if (!experience) {
      throw new NotFoundException('Work experience record not found');
    }

    if (experience.professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this experience record',
      );
    }

    const updated = await this.prisma.workExperience.update({
      where: { id: experienceId },
      data: {
        organisationName: experienceDto.organisationName,
        industry: experienceDto.industry,
        location: experienceDto.location as any,
        role: experienceDto.role,
        employmentType: experienceDto.employmentType as any,
        workMode: experienceDto.workMode as any,
        startDate: experienceDto.startDate,
        endDate: experienceDto.endDate,
        currentlyWorking: experienceDto.currentlyWorking,
        responsibilities: experienceDto.responsibilities,
        achievements: experienceDto.achievements,
        paymentMode: experienceDto.paymentMode,
        currency: experienceDto.currency,
        salaryRange: experienceDto.salaryRange as any,
        verificationContact: experienceDto.verificationContact as any,
        verificationStatus: 'pending',
        verifiedAt: null,
        reviewedBy: null,
      },
    });

    await this.prisma.professional.update({
      where: { id: experience.professionalId },
      data: { verifiedByAdminAt: null },
    });

    return {
      success: true,
      message: 'Work experience updated successfully',
      data: updated,
    };
  }

  async deleteEducation(userId: string, educationId: string) {
    const education = await this.prisma.education.findUnique({
      where: { id: educationId },
      include: { professional: true },
    });

    if (!education) {
      throw new NotFoundException('Education record not found');
    }

    if (education.professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this education record',
      );
    }

    await this.prisma.education.delete({
      where: { id: educationId },
    });

    return {
      success: true,
      message: 'Education deleted successfully',
    };
  }

  async deleteExperience(userId: string, experienceId: string) {
    const experience = await this.prisma.workExperience.findUnique({
      where: { id: experienceId },
      include: { professional: true },
    });

    if (!experience) {
      throw new NotFoundException('Work experience record not found');
    }

    if (experience.professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this experience record',
      );
    }

    await this.prisma.workExperience.delete({
      where: { id: experienceId },
    });

    return {
      success: true,
      message: 'Work experience deleted successfully',
    };
  }

  async getSetupStatus(userId: string, profId: string) {
    // Verify user is professional entity
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
      include: {
        identityVerification: true,
        education: true,
        workExperience: true,
      },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    if (professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view this profile',
      );
    }

    // Calculate profile completeness
    const sections: any = {};
    let totalWeight = 0;
    let completedWeight = 0;

    // Identity section (30%)
    const identityWeight = 30;
    totalWeight += identityWeight;
    if (
      professional.identityVerification &&
      professional.identityStatus === 'verified'
    ) {
      sections.identity = {
        completed: true,
        status: 'verified',
        weight: identityWeight,
      };
      completedWeight += identityWeight;
    } else {
      sections.identity = {
        completed: false,
        status: professional.identityStatus || 'not_started',
        weight: identityWeight,
      };
    }

    // Education section (25%)
    const educationWeight = 25;
    totalWeight += educationWeight;
    if (professional.education && professional.education.length > 0) {
      const latestEducation =
        professional.education[professional.education.length - 1];
      sections.education = {
        completed: true,
        status: latestEducation.verificationStatus,
        weight: educationWeight,
      };
      if (latestEducation.verificationStatus === 'verified') {
        completedWeight += educationWeight;
      }
    } else {
      sections.education = {
        completed: false,
        status: 'not_started',
        weight: educationWeight,
      };
    }

    // Work Experience section (25%)
    const experienceWeight = 25;
    totalWeight += experienceWeight;
    if (professional.workExperience && professional.workExperience.length > 0) {
      const latestExperience =
        professional.workExperience[professional.workExperience.length - 1];
      sections.experience = {
        completed: true,
        status: latestExperience.verificationStatus,
        weight: experienceWeight,
      };
      if (latestExperience.verificationStatus === 'verified') {
        completedWeight += experienceWeight;
      }
    } else {
      sections.experience = {
        completed: false,
        status: 'not_started',
        weight: experienceWeight,
      };
    }

    // Additional info (20%)
    const additionalWeight = 20;
    totalWeight += additionalWeight;
    // This can be calculated based on other profile fields
    sections.additional = {
      completed: false,
      status: 'not_started',
      weight: additionalWeight,
    };

    const profileCompleteness = Math.round(
      (completedWeight / totalWeight) * 100,
    );

    return {
      success: true,
      data: {
        professionalId: professional.id,
        setupCompleted: professional.setupCompleted,
        profileCompleteness,
        sections,
      },
    };
  }

  async getProfile(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            phoneNumber: true,
            createdAt: true,
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

    // Type assertion to include description and socialMedia fields
    const professionalWithExtras = professional as any;

    return {
      success: true,
      data: {
        ...professional,
        description: professionalWithExtras.description || null,
        socialMedia: professionalWithExtras.socialMedia || {},
      },
    };
  }

  async getVerificationStatus(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      include: {
        identityVerification: true,
        education: { select: { id: true, verificationStatus: true } },
        workExperience: { select: { id: true, verificationStatus: true } },
      },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const professionalWithExtras = professional as any;
    const socialMedia = professionalWithExtras.socialMedia || {};
    const hasSocial = [
      socialMedia.linkedin,
      socialMedia.twitter,
      socialMedia.facebook,
      socialMedia.instagram,
      socialMedia.tiktok,
      socialMedia.snapchat,
    ].some(Boolean);

    const hasRequiredIdFields =
      !!(professional.idType && professional.idNumber && professional.idDocumentUrl);
    const personalCompleted =
      hasRequiredIdFields ||
      !!(professional.country || professional.nationality || professional.dateOfBirth) ||
      !!professional.identityVerification;
    const personalVerified =
      professional.identityStatus === 'verified' || !!professional.identityVerification?.verifiedAt;

    const educationCompleted = professional.education.length > 0;
    const educationVerified = professional.education.some(
      (e) => e.verificationStatus === 'verified',
    );

    const workCompleted = professional.workExperience.length > 0;
    const workVerified = professional.workExperience.some(
      (e) => e.verificationStatus === 'verified',
    );

    return {
      success: true,
      data: {
        personal: { completed: personalCompleted, verified: personalVerified },
        education: { completed: educationCompleted, verified: educationVerified },
        social: { completed: hasSocial, verified: hasSocial },
        work: { completed: workCompleted, verified: workVerified },
        certification: { completed: false, verified: false },
        family: { completed: false, verified: false },
      },
    };
  }

  async updateProfile(userId: string, updateDto: any) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Type assertion to access description and socialMedia fields
    const professionalWithExtras = professional as any;

    const updateData: any = {};

    if (updateDto.country !== undefined) {
      updateData.country = updateDto.country;
    }
    if (updateDto.nationality !== undefined) {
      updateData.nationality = updateDto.nationality;
    }
    if (updateDto.dateOfBirth !== undefined) {
      updateData.dateOfBirth = new Date(updateDto.dateOfBirth);
    }
    if (updateDto.idType !== undefined) {
      updateData.idType = updateDto.idType;
    }
    if (updateDto.idNumber !== undefined) {
      updateData.idNumber = updateDto.idNumber;
    }
    if (updateDto.idDocumentUrl !== undefined) {
      updateData.idDocumentUrl = updateDto.idDocumentUrl;
    }
    if (updateDto.locationDocumentType !== undefined) {
      updateData.locationDocumentType = updateDto.locationDocumentType;
    }
    if (updateDto.locationDocumentUrl !== undefined) {
      updateData.locationDocumentUrl = updateDto.locationDocumentUrl;
    }
    if (updateDto.locations !== undefined) {
      updateData.locations = updateDto.locations as any;
    }
    if (updateDto.profession !== undefined) {
      updateData.profession = updateDto.profession;
    }
    if (updateDto.description !== undefined) {
      updateData.description = updateDto.description;
    }
    if (updateDto.socialMedia !== undefined) {
      // Merge with existing social media
      const currentSocialMedia = professionalWithExtras.socialMedia || {};
      updateData.socialMedia = {
        ...currentSocialMedia,
        ...updateDto.socialMedia,
      };
    }

    const identityRelated =
      updateDto.country !== undefined ||
      updateDto.nationality !== undefined ||
      updateDto.dateOfBirth !== undefined ||
      updateDto.idType !== undefined ||
      updateDto.idNumber !== undefined ||
      updateDto.idDocumentUrl !== undefined;
    if (
      identityRelated &&
      (professional.identityStatus === 'verified' || professional.identityVerified)
    ) {
      updateData.identityStatus = 'pending';
      updateData.identityVerified = false;
      updateData.verifiedByAdminAt = null;
    }

    // Update professional
    const updated = await this.prisma.professional.update({
      where: { userId },
      data: updateData,
    });

    if (identityRelated) {
      await this.prisma.identityVerification.updateMany({
        where: { professionalId: updated.id },
        data: { status: 'pending', verifiedAt: null },
      });
    }

    // Type assertion for the updated result
    const updatedWithExtras = updated as any;

    return {
      success: true,
      message: 'Profile updated successfully',
      data: {
        ...updated,
        socialMedia: updatedWithExtras.socialMedia || {},
      },
    };
  }

  async getHeadhuntOffers(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Get all job applications with status 'hired' (direct scouts)
    const hiredApplications = await this.prisma.jobApplication.findMany({
      where: {
        professionalId: professional.id,
        status: 'hired',
      },
      include: {
        job: {
          include: {
            organisation: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format as headhunt offers
    const offers = hiredApplications.map((app) => {
      const org = app.job?.organisation;
      const firstName = (professional as any).user?.firstName || 'Professional';
      
      // Format message as per requirements
      const message = `Dear ${firstName}, You have been headhunted by ${org?.companyName || 'an organisation'}, ${org?.industry ? `a ${org.industry} company` : 'a company'} operating ${org?.country ? `in ${org.country}` : 'globally'} for the position of ${app.job?.jobTitle || 'a role'}${app.job?.location ? ` for their ${app.job.location} Office` : ''}. Please review the offer and Job description and respond as soon as possible.`;

      return {
        id: app.id,
        organisationName: org?.companyName,
        organisationId: org?.id,
        jobTitle: app.job?.jobTitle,
        jobId: app.jobId,
        location: app.job?.location,
        message,
        sentAt: app.createdAt,
        status: app.status,
      };
    });

    return {
      success: true,
      data: {
        offers,
      },
    };
  }

  async getSharedData(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Get job applications (shared data when applying)
    const applications = await this.prisma.jobApplication.findMany({
      where: { professionalId: professional.id },
      include: {
        job: {
          include: {
            organisation: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Get hired applications (shared data when hired)
    const hiredApplications = await this.prisma.jobApplication.findMany({
      where: {
        professionalId: professional.id,
        status: {
          in: ['hired', 'accepted'],
        },
      },
      include: {
        job: {
          include: {
            organisation: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const sharedData = [
      ...applications.map((app) => ({
        id: app.id,
        type: 'application',
        organisationName:
          app.job.organisation.companyName ||
          `${app.job.organisation.user.firstName} ${app.job.organisation.user.lastName}`,
        status: app.status,
        accessType: 'application',
        date: app.createdAt,
        retentionPeriod: '30 days',
      })),
      ...hiredApplications.map((app) => ({
        id: `hired-${app.id}`,
        type: 'hired',
        organisationName:
          app.job.organisation.companyName ||
          `${app.job.organisation.user.firstName} ${app.job.organisation.user.lastName}`,
        status: 'active',
        accessType: 'employment',
        date: app.updatedAt,
        retentionPeriod: 'Indefinite',
      })),
    ];

    return {
      success: true,
      data: {
        sharedData,
      },
    };
  }

  async revokeAccess(userId: string, id: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Check if it's an application or hired record
    const application = await this.prisma.jobApplication.findFirst({
      where: { id, professionalId: professional.id },
    });

    if (application) {
      // For applications, we can't really "revoke" but we can mark it as withdrawn
      await this.prisma.jobApplication.update({
        where: { id },
        data: { status: 'withdrawn' },
      });
    } else {
      // For hired records, update the application status
      await this.prisma.jobApplication.updateMany({
        where: {
          id,
          professionalId: professional.id,
          status: {
            in: ['hired', 'accepted'],
          },
        },
        data: { status: 'rejected' },
      });
    }

    return {
      success: true,
      message: 'Access revoked successfully',
    };
  }

  async getReport(userId: string, id: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Generate a report for the shared data entry
    // This is a placeholder - in production, generate a PDF or detailed report
    return {
      success: true,
      data: {
        reportId: id,
        reportUrl: `/reports/${id}.pdf`,
        generatedAt: new Date(),
      },
    };
  }

  async getApplications(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const applications = await this.prisma.jobApplication.findMany({
      where: { professionalId: professional.id },
      include: {
        job: {
          include: {
            organisation: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: {
        applications: applications.map((app) => ({
          id: app.id,
          jobId: app.jobId,
          jobTitle: app.job.jobTitle,
          companyName:
            app.job.organisation.companyName ||
            `${app.job.organisation.user.firstName} ${app.job.organisation.user.lastName}`,
          location: app.job.location,
          status: app.status,
          appliedAt: app.createdAt,
        })),
      },
    };
  }

  async getPrivacySettings(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Privacy settings would be stored in a separate model or JSON field
    // For now, return default settings
    return {
      success: true,
      data: {
        profileVisibility: 'public',
        showEmail: true,
        showPhone: false,
        allowDataSharing: true,
        allowJobRecommendations: true,
        allowOrganisationAccess: true,
      },
    };
  }

  async updatePrivacySettings(userId: string, settings: any) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Privacy settings would be stored in a separate model or JSON field
    // For now, just return success
    return {
      success: true,
      message: 'Privacy settings updated successfully',
      data: settings,
    };
  }

  async getDocuments(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Documents would be stored in a separate model
    // For now, return empty array
    return {
      success: true,
      data: {
        documents: [],
      },
    };
  }

  async deleteDocument(userId: string, documentId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Documents would be stored in a separate model
    // For now, just return success
    return {
      success: true,
      message: 'Document deleted successfully',
    };
  }

  async getBilling(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
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

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Get subscription plan from professional (stored in a JSON field or separate model)
    // For now, default to express plan
    const subscriptionPlan = 'express'; // Default express plan for professionals

    return {
      success: true,
      data: {
        plan: subscriptionPlan,
        status: 'active',
        professionalId: professional.id,
        professionalName: `${professional.user.firstName} ${professional.user.lastName}`,
        paymentMethod:
          subscriptionPlan !== 'express'
            ? {
                type: 'card',
                last4: '4242', // Placeholder - would come from payment service
              }
            : null,
      },
    };
  }

  async getAvailablePlans() {
    // Return available subscription plans for professionals
    return {
      success: true,
      data: [
        {
          id: 'express',
          name: 'Taldium Express',
          price: 0,
          description: 'Default access plan for all entities',
          features: [
            'Basic profile access',
            'Standard verification',
            'Basic job applications',
            'Profile visibility',
          ],
        },
        {
          id: 'bloom',
          name: 'Taldium Bloom',
          price: 79,
          description: 'Enhanced features for professionals',
          features: [
            'Everything in Express',
            'Priority job applications',
            'Advanced profile features',
            'Enhanced visibility',
            'Priority support',
            'Analytics dashboard',
          ],
        },
        {
          id: 'prime',
          name: 'Taldium Prime',
          price: 149,
          description: 'Premium features and priority support',
          features: [
            'Everything in Bloom',
            'Premium profile features',
            'Direct recruiter access',
            'Advanced analytics',
            'Dedicated support',
            'Early access to features',
            'Custom profile branding',
          ],
        },
      ],
    };
  }

  async updateSubscription(userId: string, plan: string) {
    const validPlans = ['free', 'express', 'bloom', 'prime'];

    if (!validPlans.includes(plan)) {
      throw new BadRequestException(
        `Invalid plan. Must be one of: ${validPlans.join(', ')}`,
      );
    }

    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Update subscription plan
    // Note: In production, add subscriptionPlan field to Professional model or create Subscription model
    // For now, we'll store it in a workaround way
    // Since Professional model doesn't have an address field, we could add a metadata JSON field
    // or create a separate Subscription model

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
    const validPlans = ['express', 'bloom', 'prime'];

    if (!validPlans.includes(paymentDto.plan)) {
      throw new BadRequestException(
        `Invalid plan. Must be one of: ${validPlans.join(', ')}`,
      );
    }

    const professional = await this.prisma.professional.findUnique({
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

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Professional plan pricing
    const planPricing: { [key: string]: number } = {
      express: 29,
      bloom: 79,
      prime: 149,
    };

    const amount = planPricing[paymentDto.plan] || 0;
    const billingCycle = paymentDto.billingCycle || 'monthly';

    // Generate payment reference/ID
    const paymentReference = `TAL-PRO-${professional.id.substring(0, 8).toUpperCase()}-${Date.now()}`;

    // Generate payment link
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5231';
    const paymentLink = `${baseUrl}/payment/process?reference=${paymentReference}&plan=${paymentDto.plan}&amount=${amount}&cycle=${billingCycle}`;

    // Store payment initiation (in production, use a Payment model)
    // Since Professional doesn't have address field, we could add metadata or create Subscription model

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
        professionalId: professional.id,
        professionalName: `${professional.user.firstName} ${professional.user.lastName}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Link expires in 24 hours
      },
    };
  }
}
