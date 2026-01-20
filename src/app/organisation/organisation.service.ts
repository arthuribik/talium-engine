import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';

@Injectable()
export class OrganisationService {
  constructor(private prisma: PrismaService) {}

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

