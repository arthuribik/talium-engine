import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { Step1Dto, Step2Dto, Step3Dto, Step4Dto, Step5Dto, Step7Dto, Step8Dto } from '../auth/dto/registration-step.dto';
import { RegistrationStepDto } from './dto/registration-step.dto';

@Injectable()
export class RegistrationService {
  // In-memory store for registration progress
  // In production, this should be stored in a database table
  private registrationStore: Map<string, any> = new Map();

  constructor(private prisma: PrismaService) {}

  async saveStep1(registrationId: string | null, data: Step1Dto): Promise<{ id: string; step: number; data: any }> {
    const id = registrationId || this.generateId();
    const existing = this.registrationStore.get(id) || {};
    
    this.registrationStore.set(id, {
      ...existing,
      step1: data,
      currentStep: 1,
      updatedAt: new Date(),
    });

    return {
      id,
      step: 1,
      data: this.registrationStore.get(id).step1,
    };
  }

  async saveStep2(registrationId: string, data: Step2Dto): Promise<{ id: string; step: number; data: any }> {
    const existing = this.getRegistrationSync(registrationId);
    
    this.registrationStore.set(registrationId, {
      ...existing,
      step2: data,
      currentStep: 2,
      updatedAt: new Date(),
    });

    return {
      id: registrationId,
      step: 2,
      data: this.registrationStore.get(registrationId).step2,
    };
  }

  async saveStep3(registrationId: string, data: Step3Dto): Promise<{ id: string; step: number; data: any }> {
    const existing = this.getRegistrationSync(registrationId);
    
    this.registrationStore.set(registrationId, {
      ...existing,
      step3: data,
      currentStep: 3,
      updatedAt: new Date(),
    });

    return {
      id: registrationId,
      step: 3,
      data: this.registrationStore.get(registrationId).step3,
    };
  }

  async saveStep4(registrationId: string, data: Step4Dto): Promise<{ id: string; step: number; data: any }> {
    const existing = this.getRegistrationSync(registrationId);
    
    this.registrationStore.set(registrationId, {
      ...existing,
      step4: data,
      currentStep: 4,
      updatedAt: new Date(),
    });

    return {
      id: registrationId,
      step: 4,
      data: this.registrationStore.get(registrationId).step4,
    };
  }

  async saveStep5(registrationId: string, data: Step5Dto): Promise<{ id: string; step: number; data: any }> {
    const existing = this.getRegistrationSync(registrationId);
    
    this.registrationStore.set(registrationId, {
      ...existing,
      step5: data,
      currentStep: 5,
      updatedAt: new Date(),
    });

    return {
      id: registrationId,
      step: 5,
      data: this.registrationStore.get(registrationId).step5,
    };
  }

  async saveStep7(registrationId: string | null, data: Step7Dto): Promise<{ id: string; step: number; data: any }> {
    const id = registrationId || this.generateId();
    const existing = this.registrationStore.get(id) || {};
    
    this.registrationStore.set(id, {
      ...existing,
      step7: data,
      currentStep: 7,
      updatedAt: new Date(),
    });

    return {
      id,
      step: 7,
      data: this.registrationStore.get(id).step7,
    };
  }

  async saveStep8(registrationId: string, data: Step8Dto): Promise<{ id: string; step: number; data: any }> {
    const existing = this.getRegistrationSync(registrationId);
    
    this.registrationStore.set(registrationId, {
      ...existing,
      step8: data,
      currentStep: 8,
      updatedAt: new Date(),
    });

    return {
      id: registrationId,
      step: 8,
      data: this.registrationStore.get(registrationId).step8,
    };
  }

  async getRegistration(registrationId: string): Promise<any> {
    const registration = this.registrationStore.get(registrationId);
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    return registration;
  }

  private getRegistrationSync(registrationId: string): any {
    const registration = this.registrationStore.get(registrationId);
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    return registration;
  }

  // Clean up old registrations (older than 24 hours)
  cleanupOldRegistrations() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    for (const [id, data] of this.registrationStore.entries()) {
      if (data.updatedAt && new Date(data.updatedAt) < oneDayAgo) {
        this.registrationStore.delete(id);
      }
    }
  }

  private generateId(): string {
    return `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Unified method to save any step
  async saveStep(dto: RegistrationStepDto): Promise<{ id: string; step: number; data: any }> {
    const { step, id, ...data } = dto;
    
    // Determine registration ID
    let registrationId = id;
    
    // Steps 1 and 7 can create new registrations
    if (!registrationId && (step === 1 || step === 7)) {
      registrationId = this.generateId();
    }
    
    // For other steps, ID is required
    if (!registrationId) {
      throw new BadRequestException('Registration ID is required for this step');
    }
    
    // Get existing registration or create new
    const existing = registrationId ? (this.registrationStore.get(registrationId) || {}) : {};
    
    // Prepare step-specific data
    let stepData: any = {};
    
    switch (step) {
      case 1:
        stepData = { isRegistered: data.isRegistered };
        break;
      case 2:
        stepData = {
          legalName: data.legalName,
          countryOfIncorporation: data.countryOfIncorporation,
          incorporationNumber: data.incorporationNumber,
        };
        break;
      case 3:
        stepData = {
          category: data.category,
          schoolType: data.schoolType,
          religiousOrgType: data.religiousOrgType,
          internationalOrgType: data.internationalOrgType,
          politicalPartyCountry: data.politicalPartyCountry,
          associatedSchool: data.associatedSchool,
        };
        break;
      case 4:
        stepData = {
          description: data.description,
          otherName: data.otherName,
          industry: data.industry,
          headquartersCity: data.headquartersCity,
          headquartersCountry: data.headquartersCountry,
          foundedDate: data.foundedDate,
          address: data.address,
        };
        break;
      case 5:
        stepData = {
          organisationEmail: data.organisationEmail,
        };
        break;
      case 7:
        stepData = {
          organisationName: data.organisationName,
          organisationCountry: data.organisationCountry,
          description: data.description,
          industry: data.industry,
          foundedDate: data.foundedDate,
          address: data.address,
        };
        break;
      case 8:
        stepData = {
          category: data.category,
          schoolType: data.schoolType,
          religiousOrgType: data.religiousOrgType,
          internationalOrgType: data.internationalOrgType,
          politicalPartyCountry: data.politicalPartyCountry,
          associatedSchool: data.associatedSchool,
        };
        break;
      default:
        throw new BadRequestException(`Invalid step number: ${step}`);
    }
    
    // Update registration store
    this.registrationStore.set(registrationId, {
      ...existing,
      [`step${step}`]: stepData,
      currentStep: step,
      updatedAt: new Date(),
    });
    
    return {
      id: registrationId,
      step,
      data: this.registrationStore.get(registrationId)[`step${step}`],
    };
  }
}

