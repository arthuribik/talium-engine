import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { IdentityVerifyDto } from './dto/identity-verify.dto';
import { AddEducationDto } from './dto/add-education.dto';
import { AddExperienceDto } from './dto/add-experience.dto';

@Injectable()
export class ProfessionalService {
  constructor(private prisma: PrismaService) {}

  async verifyIdentity(userId: string, profId: string, identityDto: IdentityVerifyDto) {
    // Verify user is professional entity
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    if (professional.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this profile');
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

  async addEducation(userId: string, profId: string, educationDto: AddEducationDto) {
    // Verify user is professional entity
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    if (professional.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this profile');
    }

    // Create education record
    const education = await this.prisma.education.create({
      data: {
        professionalId: profId,
        levelOfEducation: educationDto.levelOfEducation as any,
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

  async addExperience(userId: string, profId: string, experienceDto: AddExperienceDto) {
    // Verify user is professional entity
    const professional = await this.prisma.professional.findUnique({
      where: { id: profId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    if (professional.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this profile');
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
      throw new ForbiddenException('You do not have permission to view this profile');
    }

    // Calculate profile completeness
    const sections: any = {};
    let totalWeight = 0;
    let completedWeight = 0;

    // Identity section (30%)
    const identityWeight = 30;
    totalWeight += identityWeight;
    if (professional.identityVerification && professional.identityStatus === 'verified') {
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
      const latestEducation = professional.education[professional.education.length - 1];
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
      const latestExperience = professional.workExperience[professional.workExperience.length - 1];
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

    const profileCompleteness = Math.round((completedWeight / totalWeight) * 100);

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
}

