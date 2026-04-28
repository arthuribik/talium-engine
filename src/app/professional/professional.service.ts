import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../utility/prisma/prisma.service';
import { S3Service } from '../../utility/s3/s3.service';
import { IdentityVerifyDto } from './dto/identity-verify.dto';
import { AddEducationDto } from './dto/add-education.dto';
import { AddExperienceDto } from './dto/add-experience.dto';
import { AddProjectDto } from './dto/add-project.dto';
import { InitiatePaymentDto } from '../organisation/dto/initiate-payment.dto';
import { canProfessionalApplyToJobs } from '../../common/can-professional-apply-to-jobs';
import { BillingEntityType } from '@prisma/client';
import { ensureDefaultBillingPlans } from '../billing/billing-plans.seed';

@Injectable()
export class ProfessionalService {
  /** Logged-in phone verification OTPs: key `${userId}:${e164}` */
  private phoneOtpStore = new Map<
    string,
    { code: string; expiresAt: Date; channel: 'sms' | 'email' }
  >();

  /** Logged-in account email verification: key `userId` */
  private accountEmailOtpStore = new Map<
    string,
    { code: string; expiresAt: Date; email: string }
  >();

  /** Student institution email OTP: key `${userId}:${educationId}` */
  private educationStudentEmailOtpStore = new Map<
    string,
    { code: string; expiresAt: Date; email: string }
  >();

  /** Work company email OTP: key `${userId}:${experienceId}` */
  private experienceWorkEmailOtpStore = new Map<
    string,
    { code: string; expiresAt: Date; email: string }
  >();

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private eventEmitter: EventEmitter2,
  ) {}

  /** Aligns with admin VerificationCenter: self-declaration paths skip document review. */
  private normalizeSelfDeclarationKey(v: unknown): string {
    return String(v ?? '')
      .toLowerCase()
      .replace(/-/g, '_');
  }

  private isVerificationSelfDeclarationMethod(v: unknown): boolean {
    const s = this.normalizeSelfDeclarationKey(v);
    return s === 'self_declaration' || s === 'self_declared';
  }

  private isEducationSelfDeclaredForVerificationAggregate(edu: {
    verificationMethod?: string | null;
  }): boolean {
    return this.isVerificationSelfDeclarationMethod(edu?.verificationMethod);
  }

  private isWorkSelfDeclaredForVerificationAggregate(exp: {
    verificationMethod?: string | null;
  }): boolean {
    return this.isVerificationSelfDeclarationMethod(exp?.verificationMethod);
  }

  private isProjectSelfDeclaredForVerificationAggregate(proj: {
    verificationMethod?: string | null;
    selfDeclared?: boolean | null;
    projectSelfDeclared?: boolean | null;
  }): boolean {
    return (
      this.isVerificationSelfDeclarationMethod(proj?.verificationMethod) ||
      proj?.selfDeclared === true ||
      proj?.projectSelfDeclared === true
    );
  }

  private isLocationSelfDeclaredForVerificationAggregate(loc: any): boolean {
    if (!loc || typeof loc !== 'object') return false;
    const dt = this.normalizeSelfDeclarationKey(loc.documentType);
    if (dt === 'self_declaration' || dt === 'self_declared') return true;
    return String(loc?.verificationStatus ?? '').toLowerCase() === 'self_declared';
  }

  /** Document-backed rows count only after explicit verified status (or digital_verify); uploads alone are not enough. */
  private isLocationRowVerifiedForVerificationAggregate(loc: any): boolean {
    if (!loc || typeof loc !== 'object') return false;
    if (this.isLocationSelfDeclaredForVerificationAggregate(loc)) return true;
    const dt = this.normalizeSelfDeclarationKey(loc.documentType);
    if (dt === 'digital_verify') return true;
    const vs = String(loc?.verificationStatus ?? loc?.documentVerificationStatus ?? '').toLowerCase();
    return vs === 'verified';
  }

  private isCertSelfDeclaredForVerificationAggregate(cert: any): boolean {
    return !!(cert?.certSelfDeclared || cert?.selfDeclared);
  }

  private isCertRowVerifiedForVerificationAggregate(cert: any): boolean {
    if (this.isCertSelfDeclaredForVerificationAggregate(cert)) return true;
    if (cert?.verified === true) return true;
    if (String(cert?.certVerificationStatus ?? '').toLowerCase() === 'verified') return true;
    if (String(cert?.verificationStatus ?? '').toLowerCase() === 'verified') return true;
    return false;
  }

  private educationRowVerifiedForVerificationAggregate(e: {
    verificationMethod?: string | null;
    verificationStatus: string;
  }): boolean {
    if (this.isEducationSelfDeclaredForVerificationAggregate(e)) return true;
    return e.verificationStatus === 'verified';
  }

  private workRowVerifiedForVerificationAggregate(w: {
    verificationMethod?: string | null;
    verificationStatus: string;
  }): boolean {
    if (this.isWorkSelfDeclaredForVerificationAggregate(w)) return true;
    return w.verificationStatus === 'verified';
  }

  private projectRowVerifiedForVerificationAggregate(p: {
    verificationMethod?: string | null;
    selfDeclared?: boolean | null;
    projectSelfDeclared?: boolean | null;
    verificationStatus: string;
  }): boolean {
    if (this.isProjectSelfDeclaredForVerificationAggregate(p)) return true;
    return p.verificationStatus === 'verified';
  }

  private normalizeProjectTeamMembersForCompare(
    raw: unknown,
  ): Array<{ name: string; role: string }> {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((m: { name?: unknown; role?: unknown }) => ({
        name: String(m?.name ?? '').trim(),
        role: String(m?.role ?? '').trim(),
      }))
      .filter((m) => m.name || m.role)
      .sort((a, b) => `${a.name}\0${a.role}`.localeCompare(`${b.name}\0${b.role}`));
  }

  private professionalProjectCoreContentEqual(
    project: {
      title: string;
      description: string | null;
      projectLink: string | null;
      mediaUrl: string | null;
      teamMembers: unknown;
      startMonth: number | null;
      startYear: number | null;
      endMonth: number | null;
      endYear: number | null;
    },
    dto: AddProjectDto,
    normalizedIncomingTeam: Array<{ name: string; role: string }>,
  ): boolean {
    const incomingNorm = this.normalizeProjectTeamMembersForCompare(normalizedIncomingTeam);
    const n = (v: number | null | undefined) => (v == null ? null : v);
    return (
      project.title.trim() === dto.title.trim() &&
      (project.description || '').trim() === (dto.description || '').trim() &&
      (project.projectLink || '').trim() === (dto.projectLink || '').trim() &&
      (project.mediaUrl || '').trim() === (dto.mediaUrl || '').trim() &&
      n(project.startMonth) === n(dto.startMonth) &&
      n(project.startYear) === n(dto.startYear) &&
      n(project.endMonth) === n(dto.endMonth) &&
      n(project.endYear) === n(dto.endYear) &&
      JSON.stringify(this.normalizeProjectTeamMembersForCompare(project.teamMembers)) ===
        JSON.stringify(incomingNorm)
    );
  }

  private assertProjectMonthYearPairs(dto: AddProjectDto) {
    const pairOk = (m: number | undefined, y: number | undefined, label: string) => {
      const hasM = m != null;
      const hasY = y != null;
      if (hasM !== hasY) {
        throw new BadRequestException(
          `${label} requires both month and year, or leave both empty`,
        );
      }
    };
    pairOk(dto.startMonth, dto.startYear, 'Project start');
    pairOk(dto.endMonth, dto.endYear, 'Project end');
    if (
      dto.startMonth != null &&
      dto.startYear != null &&
      dto.endMonth != null &&
      dto.endYear != null
    ) {
      const s = dto.startYear * 12 + dto.startMonth;
      const e = dto.endYear * 12 + dto.endMonth;
      if (e < s) {
        throw new BadRequestException('Project end cannot be before start');
      }
    }
  }

  private normalizeProfessionalTimezone(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid timezone');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: trimmed }).format(new Date());
    } catch {
      throw new BadRequestException('Invalid timezone identifier');
    }
    return trimmed;
  }

  /**
   * Whitelist fields for Professional.certifications (JSONB) and persist
   * self-declaration / verification metadata the verification UI relies on.
   */
  private normalizeCertificationsJsonForPersistence(raw: unknown): any[] {
    if (!Array.isArray(raw)) {
      throw new BadRequestException('certifications must be an array');
    }
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const optionalStr = (v: unknown) => {
      const t = str(v);
      return t ? t : undefined;
    };
    return raw.map((item, idx) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`certifications[${idx}] must be an object`);
      }
      const c = item as Record<string, unknown>;
      const name = str(c.name);
      const issuedBy = str(c.issuedBy);
      const issuedDate = optionalStr(c.issuedDate);
      const expirationDate = optionalStr(c.expirationDate);
      const credentialId = str(c.credentialId);
      const reportingUrl = optionalStr(c.reportingUrl);
      const supportingMediaUrl = optionalStr(c.supportingMediaUrl);
      const associatedSkills = optionalStr(c.associatedSkills);

      const vmRaw = str(c.verificationMethod);
      const statusFromFields = str(c.certVerificationStatus || c.verificationStatus).toLowerCase();
      const isVerified =
        statusFromFields === 'verified' || c.verified === true || c.verified === 'true';
      const certSelfDeclared =
        !isVerified &&
        (!!(c.certSelfDeclared ?? c.selfDeclared) || this.isVerificationSelfDeclarationMethod(vmRaw));

      const out: Record<string, unknown> = {
        name,
        issuedBy,
        credentialId,
        certVerificationStatus: isVerified ? 'verified' : 'pending',
        verified: isVerified,
        certSelfDeclared,
      };
      if (issuedDate) out.issuedDate = issuedDate;
      if (expirationDate) out.expirationDate = expirationDate;
      if (reportingUrl) out.reportingUrl = reportingUrl;
      if (supportingMediaUrl) out.supportingMediaUrl = supportingMediaUrl;
      if (associatedSkills) out.associatedSkills = associatedSkills;

      if (isVerified) {
        return out;
      }
      if (certSelfDeclared) {
        out.verificationMethod = this.isVerificationSelfDeclarationMethod(vmRaw)
          ? vmRaw
          : 'self_declaration';
      } else if (vmRaw) {
        out.verificationMethod = vmRaw;
      }
      return out;
    });
  }

  private normalizeEducationProgramProgression(
    items?: Array<{
      title?: string;
      startDate?: string;
      endDate?: string;
      currentlyActive?: boolean;
    }> | null,
  ) {
    if (!items?.length) return null;
    const cleaned = items
      .map((p) => ({
        title: (p.title || '').trim(),
        startDate: (p.startDate || '').trim(),
        endDate: (p.endDate || '').trim(),
        currentlyActive: !!p.currentlyActive,
      }))
      .filter((p) => p.title);
    return cleaned.length ? cleaned : null;
  }

  /** Prisma `Education.startDate` is a non-null string; persist unknown dates as empty string. */
  private normalizeEducationStoredStartDate(startDate?: string | null): string {
    return (startDate ?? '').trim();
  }

  private normalizeEducationStoredEndDate(
    endDate?: string | null,
    currentlyAttending?: boolean,
  ): string | null {
    if (currentlyAttending) return null;
    const t = (endDate ?? '').trim();
    return t ? t : null;
  }

  private normalizeEducationStoredGrade(grade?: string | null): string | null {
    const t = (grade ?? '').trim();
    return t ? t : null;
  }

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
    file: { buffer: Buffer; originalname: string; mimetype?: string },
  ): Promise<{ url: string }> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const safeName = (file.originalname || 'document').replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );
    const filename = `${professional.id}-${Date.now()}-${safeName}`;
    const url = await this.s3.upload(file.buffer, filename, {
      prefix: 'id-documents',
      contentType: file.mimetype,
    });
    return { url };
  }

  async uploadCv(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
  ): Promise<{ url: string }> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const safeName = (file.originalname || 'cv').replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );
    const filename = `${professional.id}-${Date.now()}-${safeName}`;
    const url = await this.s3.upload(file.buffer, filename, {
      prefix: 'cvs',
      contentType: file.mimetype,
    });
    return { url };
  }

  async uploadProfileImage(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
  ): Promise<{ url: string; profileImageUrl: string }> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const mime = file.mimetype || '';
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('File must be an image (e.g. JPEG, PNG, WebP)');
    }
    const maxBytes = 5 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException('Image must be at most 5 MB');
    }
    const safeName = (file.originalname || 'photo').replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );
    const filename = `${professional.id}-${Date.now()}-${safeName}`;
    const url = await this.s3.upload(file.buffer, filename, {
      prefix: 'profile-images',
      contentType: file.mimetype,
    });
    await this.prisma.professional.update({
      where: { userId },
      data: { profileImageUrl: url },
    });
    return { url, profileImageUrl: url };
  }

  async uploadLivenessSelfie(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
  ): Promise<{ url: string; livenessSelfieUrl: string }> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const mime = file.mimetype || '';
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('File must be an image (e.g. JPEG, PNG, WebP)');
    }
    const maxBytes = 5 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException('Image must be at most 5 MB');
    }
    const safeName = (file.originalname || 'liveness').replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );
    const filename = `${professional.id}-liveness-${Date.now()}-${safeName}`;
    const url = await this.s3.upload(file.buffer, filename, {
      prefix: 'liveness-selfies',
      contentType: file.mimetype,
    });
    await this.prisma.professional.update({
      where: { userId },
      data: { livenessSelfieUrl: url, isPersonalCompleted: true },
    });
    return { url, livenessSelfieUrl: url };
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

    const isDefault = !!educationDto.isDefault;
    if (isDefault) {
      await this.prisma.education.updateMany({
        where: { professionalId: profId },
        data: { isDefault: false },
      });
    }

    const storedStart = this.normalizeEducationStoredStartDate(educationDto.startDate);
    const storedEnd = this.normalizeEducationStoredEndDate(
      educationDto.endDate,
      educationDto.currentlyAttending,
    );
    const storedGrade = this.normalizeEducationStoredGrade(educationDto.grade);

    // Create education record
    const education = await this.prisma.education.create({
      data: {
        professionalId: profId,
        levelOfEducation: educationDto.levelOfEducation as any,
        programLevel: educationDto.programLevel,
        schoolType: educationDto.schoolType,
        institutionName: educationDto.institutionName,
        institutionIndustry: educationDto.institutionIndustry,
        degreeType: educationDto.degreeType,
        fieldOfStudy: educationDto.fieldOfStudy,
        startDate: storedStart,
        endDate: storedEnd,
        currentlyAttending: educationDto.currentlyAttending,
        grade: storedGrade,
        costOfEducation: educationDto.costOfEducation,
        currency: educationDto.currency,
        costFrequency: null,
        pendingLoanAmount: educationDto.pendingLoanAmount,
        loanCurrency: educationDto.loanCurrency,
        loanRepaymentFrequency: educationDto.loanRepaymentFrequency,
        scholarshipsAndAid: educationDto.scholarshipsAndAid,
        programDescription: educationDto.programDescription,
        academicResponsibilities: educationDto.academicResponsibilities,
        academicAchievements: educationDto.academicAchievements,
        programProgression: this.normalizeEducationProgramProgression(
          educationDto.programProgression,
        ) as any,
        activitiesSocieties: educationDto.activitiesSocieties,
        associatedSkills: educationDto.associatedSkills,
        supportingMediaUrl: educationDto.supportingMediaUrl,
        country: educationDto.country,
        isDefault,
        verificationMethod: educationDto.verificationMethod ?? null,
        verificationDocuments: educationDto.verificationDocuments as any,
        verificationStatus: 'pending',
        studentVerificationEmail: educationDto.studentVerificationEmail?.trim() || null,
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

    // Idempotency: duplicate client submits (e.g. React Strict Mode double-invoking state
    // updaters) must not create two identical rows within a short window.
    const DUPLICATE_WINDOW_MS = 15_000;
    const org = experienceDto.organisationName.trim();
    const role = experienceDto.role.trim();
    const recentDuplicate = await this.prisma.workExperience.findFirst({
      where: {
        professionalId: profId,
        organisationName: org,
        role,
        startDate: experienceDto.startDate,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recentDuplicate &&
      Date.now() - recentDuplicate.createdAt.getTime() < DUPLICATE_WINDOW_MS
    ) {
      return {
        success: true,
        message: 'Work experience added successfully',
        data: recentDuplicate,
      };
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
        jobDescription: experienceDto.jobDescription?.trim() || null,
        responsibilities: experienceDto.responsibilities,
        achievements: experienceDto.achievements,
        paymentMode: experienceDto.paymentMode,
        currency: experienceDto.currency,
        salaryRange: experienceDto.salaryRange as any,
        verificationMethod: experienceDto.verificationMethod?.trim() || null,
        workVerificationEmail: experienceDto.workVerificationEmail?.trim() || null,
        supportingMediaUrl: experienceDto.supportingMediaUrl?.trim() || null,
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

    const nextStart = this.normalizeEducationStoredStartDate(educationDto.startDate);
    const nextEnd = this.normalizeEducationStoredEndDate(
      educationDto.endDate,
      educationDto.currentlyAttending,
    );

    const coreFieldsUnchanged =
      education.institutionName.trim() === educationDto.institutionName.trim() &&
      education.fieldOfStudy.trim() === educationDto.fieldOfStudy.trim() &&
      (education.degreeType || '').trim() === (educationDto.degreeType || '').trim() &&
      String(education.levelOfEducation) === String(educationDto.levelOfEducation) &&
      education.startDate === nextStart &&
      (education.endDate || '') === (nextEnd || '') &&
      education.country.trim() === educationDto.country.trim();

    const keepVerificationState =
      education.verificationStatus === 'verified' && coreFieldsUnchanged;

    const isDefault = !!educationDto.isDefault;
    if (isDefault) {
      await this.prisma.education.updateMany({
        where: {
          professionalId: education.professionalId,
          NOT: { id: educationId },
        },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.education.update({
      where: { id: educationId },
      data: {
        levelOfEducation: educationDto.levelOfEducation as any,
        programLevel: educationDto.programLevel,
        schoolType: educationDto.schoolType,
        institutionName: educationDto.institutionName,
        institutionIndustry: educationDto.institutionIndustry,
        degreeType: educationDto.degreeType,
        fieldOfStudy: educationDto.fieldOfStudy,
        startDate: nextStart,
        endDate: nextEnd,
        currentlyAttending: educationDto.currentlyAttending,
        grade: this.normalizeEducationStoredGrade(educationDto.grade),
        costOfEducation: educationDto.costOfEducation,
        currency: educationDto.currency,
        costFrequency: null,
        pendingLoanAmount: educationDto.pendingLoanAmount,
        loanCurrency: educationDto.loanCurrency,
        loanRepaymentFrequency: educationDto.loanRepaymentFrequency,
        scholarshipsAndAid: educationDto.scholarshipsAndAid,
        programDescription: educationDto.programDescription,
        academicResponsibilities: educationDto.academicResponsibilities,
        academicAchievements: educationDto.academicAchievements,
        programProgression: this.normalizeEducationProgramProgression(
          educationDto.programProgression,
        ) as any,
        activitiesSocieties: educationDto.activitiesSocieties,
        associatedSkills: educationDto.associatedSkills,
        supportingMediaUrl: educationDto.supportingMediaUrl,
        country: educationDto.country,
        isDefault,
        verificationMethod: educationDto.verificationMethod ?? null,
        verificationDocuments: educationDto.verificationDocuments as any,
        verificationStatus: keepVerificationState ? 'verified' : 'pending',
        verifiedAt: keepVerificationState ? education.verifiedAt : null,
        reviewedBy: keepVerificationState ? education.reviewedBy : null,
        studentVerificationEmail: keepVerificationState
          ? education.studentVerificationEmail
          : educationDto.studentVerificationEmail?.trim() || null,
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

    const normalizeWorkLocation = (v: unknown) =>
      JSON.stringify(v && typeof v === 'object' ? v : {});
    const coreFieldsUnchanged =
      experience.organisationName.trim() === experienceDto.organisationName.trim() &&
      experience.industry.trim() === experienceDto.industry.trim() &&
      experience.role.trim() === experienceDto.role.trim() &&
      experience.startDate === experienceDto.startDate &&
      (experience.endDate || '') === (experienceDto.endDate || '') &&
      experience.currentlyWorking === experienceDto.currentlyWorking &&
      String(experience.employmentType) === String(experienceDto.employmentType) &&
      String(experience.workMode) === String(experienceDto.workMode) &&
      (experience.jobDescription || '').trim() === (experienceDto.jobDescription || '').trim() &&
      normalizeWorkLocation(experience.location) ===
        normalizeWorkLocation(experienceDto.location);

    const keepVerificationState =
      experience.verificationStatus === 'verified' && coreFieldsUnchanged;

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
        jobDescription: experienceDto.jobDescription?.trim() || null,
        responsibilities: experienceDto.responsibilities,
        achievements: experienceDto.achievements,
        paymentMode: experienceDto.paymentMode,
        currency: experienceDto.currency,
        salaryRange: experienceDto.salaryRange as any,
        verificationMethod: keepVerificationState
          ? experience.verificationMethod
          : experienceDto.verificationMethod?.trim() || null,
        supportingMediaUrl: keepVerificationState
          ? experience.supportingMediaUrl
          : experienceDto.supportingMediaUrl?.trim() || null,
        verificationStatus: keepVerificationState ? 'verified' : 'pending',
        verifiedAt: keepVerificationState ? experience.verifiedAt : null,
        reviewedBy: keepVerificationState ? experience.reviewedBy : null,
        workVerificationEmail: keepVerificationState
          ? experience.workVerificationEmail
          : experienceDto.workVerificationEmail?.trim() || null,
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

  async addProject(userId: string, profId: string, dto: AddProjectDto) {
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

    const teamMembers =
      dto.teamMembers
        ?.map((m) => ({
          name: (m.name || '').trim(),
          role: (m.role || '').trim(),
        }))
        .filter((m) => m.name || m.role) ?? [];

    const rawMethod = dto.verificationMethod;
    const trimmed =
      typeof rawMethod === 'string'
        ? rawMethod.trim()
        : rawMethod != null
          ? String(rawMethod).trim()
          : '';
    const incomingMethod = trimmed.length > 0 ? trimmed : null;

    this.assertProjectMonthYearPairs(dto);

    const project = await this.prisma.professionalProject.create({
      data: {
        professionalId: profId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        projectLink: dto.projectLink?.trim(),
        mediaUrl: dto.mediaUrl?.trim(),
        startMonth: dto.startMonth ?? null,
        startYear: dto.startYear ?? null,
        endMonth: dto.endMonth ?? null,
        endYear: dto.endYear ?? null,
        teamMembers: (teamMembers.length ? teamMembers : []) as any,
        /** Omit on client for new rows; only set after explicit self-declaration flow */
        verificationMethod: incomingMethod,
        /**
         * Self-declaration is provisional (limited verification), not full `verified`.
         * Progress aggregates still count it via `isProjectSelfDeclaredForVerificationAggregate`.
         */
        verificationStatus: 'pending',
        verifiedAt: null,
        reviewedBy: null,
      },
    });

    return {
      success: true,
      message: 'Project added successfully',
      data: project,
    };
  }

  async updateProject(
    userId: string,
    projectId: string,
    dto: AddProjectDto,
  ) {
    const project = await this.prisma.professionalProject.findUnique({
      where: { id: projectId },
      include: { professional: true },
    });

    if (!project) {
      throw new NotFoundException('Project record not found');
    }

    if (project.professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this project record',
      );
    }

    const teamMembers =
      dto.teamMembers
        ?.map((m) => ({
          name: (m.name || '').trim(),
          role: (m.role || '').trim(),
        }))
        .filter((m) => m.name || m.role) ?? [];

    this.assertProjectMonthYearPairs(dto);

    const rawMethod = (dto as { verificationMethod?: string | null }).verificationMethod;
    const verificationMethodSent = rawMethod !== undefined;
    const parsedIncomingMethod =
      rawMethod != null && String(rawMethod).trim() !== '' ? String(rawMethod).trim() : null;
    const methodToApply = verificationMethodSent
      ? parsedIncomingMethod
      : (project.verificationMethod ?? null);

    const coreUnchanged = this.professionalProjectCoreContentEqual(project, dto, teamMembers);
    const keepVerificationState = project.verificationStatus === 'verified' && coreUnchanged;

    let verificationMethod: string | null;
    let verificationStatus: (typeof project)['verificationStatus'];
    let verifiedAt: Date | null;
    let reviewedBy: string | null;

    if (keepVerificationState) {
      verificationMethod = project.verificationMethod ?? null;
      verificationStatus = project.verificationStatus;
      verifiedAt = project.verifiedAt;
      reviewedBy = project.reviewedBy;
    } else if (this.isVerificationSelfDeclarationMethod(methodToApply)) {
      verificationMethod = methodToApply;
      /** Same as create: self-declaration stays pending until full evidence/admin verification */
      verificationStatus = 'pending';
      verifiedAt = null;
      reviewedBy = null;
    } else {
      verificationMethod = methodToApply;
      verificationStatus = 'pending';
      verifiedAt = null;
      reviewedBy = null;
    }

    const updated = await this.prisma.professionalProject.update({
      where: { id: projectId },
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim(),
        projectLink: dto.projectLink?.trim(),
        mediaUrl: dto.mediaUrl?.trim(),
        startMonth: dto.startMonth ?? null,
        startYear: dto.startYear ?? null,
        endMonth: dto.endMonth ?? null,
        endYear: dto.endYear ?? null,
        teamMembers: (teamMembers.length ? teamMembers : []) as any,
        verificationMethod,
        verificationStatus,
        verifiedAt,
        reviewedBy,
      },
    });

    await this.prisma.professional.update({
      where: { id: project.professionalId },
      data: { verifiedByAdminAt: null },
    });

    return {
      success: true,
      message: 'Project updated successfully',
      data: updated,
    };
  }

  async deleteProject(userId: string, projectId: string) {
    const project = await this.prisma.professionalProject.findUnique({
      where: { id: projectId },
      include: { professional: true },
    });

    if (!project) {
      throw new NotFoundException('Project record not found');
    }

    if (project.professional.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this project record',
      );
    }

    await this.prisma.professionalProject.delete({
      where: { id: projectId },
    });

    return {
      success: true,
      message: 'Project deleted successfully',
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
            emailVerified: true,
            phoneVerified: true,
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

    const canApplyToJobs = canProfessionalApplyToJobs({
      userStatus: professional.user.status,
      emailVerified: professional.user.emailVerified,
      phoneVerified: professional.user.phoneVerified,
      livenessSelfieUrl: professional.livenessSelfieUrl,
      isPersonalCompleted: professional.isPersonalCompleted,
      setupCompleted: professional.setupCompleted,
    });

    const ivNat = professional.identityVerification?.nationality?.trim();
    const profNat = professional.nationality?.trim();
    const nationalityForProfile = profNat || ivNat || null;

    return {
      success: true,
      data: {
        ...professionalRest,
        nationality: nationalityForProfile,
        professionalProjects,
        projects: professionalProjects ?? [],
        description: professionalWithExtras.description || null,
        socialMedia: professionalWithExtras.socialMedia || {},
        gender: professionalWithExtras.gender ?? null,
        middleName: professionalWithExtras.middleName ?? null,
        certifications: professionalWithExtras.certifications ?? null,
        familyInfo: professionalWithExtras.familyInfo ?? null,
        canApplyToJobs,
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
        professionalProjects: { select: { id: true, verificationStatus: true } },
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
    /** Do not treat signup demographics or home country alone as "personal" / "location" verification progress. */
    const personalCompleted =
      hasRequiredIdFields ||
      professional.isPersonalCompleted === true ||
      !!professional.identityVerification;
    const personalVerified =
      professional.identityStatus === 'verified' || !!professional.identityVerification?.verifiedAt;

    const educationCompleted = professional.education.length > 0;
    const educationVerified =
      educationCompleted &&
      professional.education.every((e) => this.educationRowVerifiedForVerificationAggregate(e));

    const workCompleted = professional.workExperience.length > 0;
    const workVerified =
      workCompleted &&
      professional.workExperience.every((e) => this.workRowVerifiedForVerificationAggregate(e));

    const projectsCompleted = professional.professionalProjects.length > 0;
    const projectsVerified =
      projectsCompleted &&
      professional.professionalProjects.every((p) => this.projectRowVerifiedForVerificationAggregate(p));

    const locationsJson = professionalWithExtras.locations;
    const locationsArr = Array.isArray(locationsJson)
      ? locationsJson
      : locationsJson != null && typeof locationsJson === 'object'
        ? [locationsJson]
        : [];
    const locationCompleted =
      locationsArr.some((loc: any) => {
        if (!loc || typeof loc !== 'object') return false;
        const country = typeof loc.country === 'string' ? loc.country.trim() : '';
        const address = typeof loc.address === 'string' ? loc.address.trim() : '';
        const docUrl =
          (typeof loc.documentUrl === 'string' && loc.documentUrl.trim()) ||
          (typeof loc.document_url === 'string' && loc.document_url.trim()) ||
          '';
        return !!(country || address || docUrl);
      }) ||
      !!(professional.locationDocumentUrl && String(professional.locationDocumentUrl).trim()) ||
      !!(professional.locationDocumentType && String(professional.locationDocumentType).trim());

    const certsRaw = professionalWithExtras.certifications;
    const certsArr = Array.isArray(certsRaw) ? certsRaw : [];
    const certificationCompleted = certsArr.some((c: any) => {
      const name = typeof c?.name === 'string' ? c.name.trim() : '';
      const issuedBy = typeof c?.issuedBy === 'string' ? c.issuedBy.trim() : '';
      return !!(name && issuedBy);
    });
    const certificationVerified =
      certsArr.length > 0 &&
      certsArr.every((c: any) => {
        const name = typeof c?.name === 'string' ? c.name.trim() : '';
        const issuedBy = typeof c?.issuedBy === 'string' ? c.issuedBy.trim() : '';
        if (!name || !issuedBy) return false;
        return this.isCertRowVerifiedForVerificationAggregate(c);
      });

    const familyRaw = professionalWithExtras.familyInfo;
    let familyCompleted = false;
    if (familyRaw && typeof familyRaw === 'object') {
      const marital = typeof familyRaw.maritalStatus === 'string' ? familyRaw.maritalStatus.trim() : '';
      const spouse = typeof familyRaw.spouseName === 'string' ? familyRaw.spouseName.trim() : '';
      const relations = Array.isArray(familyRaw.relations) ? familyRaw.relations : [];
      const hasValidRelation = relations.some((r: any) => {
        const rt = typeof r?.relationType === 'string' ? r.relationType.trim() : '';
        const fn = typeof r?.fullName === 'string' ? r.fullName.trim() : '';
        return !!(rt && fn);
      });
      familyCompleted =
        !!marital ||
        hasValidRelation ||
        (marital === 'married' && !!spouse);
    }

    return {
      success: true,
      data: {
        personal: { completed: personalCompleted, verified: personalVerified },
        location: {
          completed: locationCompleted,
          verified:
            locationsArr.length > 0 &&
            locationsArr.every((loc: any) => this.isLocationRowVerifiedForVerificationAggregate(loc)),
        },
        education: { completed: educationCompleted, verified: educationVerified },
        social: { completed: hasSocial, verified: hasSocial },
        work: { completed: workCompleted, verified: workVerified },
        projects: { completed: projectsCompleted, verified: projectsVerified },
        certification: {
          completed: certificationCompleted,
          verified: certificationVerified,
        },
        family: { completed: familyCompleted, verified: false },
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
    if (updateDto.profileImageUrl !== undefined) {
      updateData.profileImageUrl =
        updateDto.profileImageUrl === null || updateDto.profileImageUrl === ''
          ? null
          : updateDto.profileImageUrl;
    }
    if (updateDto.locations !== undefined) {
      updateData.locations = updateDto.locations as any;
    }
    if (updateDto.profession !== undefined) {
      updateData.profession = updateDto.profession;
    }
    if (updateDto.gender !== undefined) {
      updateData.gender = updateDto.gender;
    }
    if (updateDto.middleName !== undefined) {
      updateData.middleName = updateDto.middleName;
    }
    if (updateDto.description !== undefined) {
      updateData.description = updateDto.description;
    }
    if (updateDto.certifications !== undefined) {
      updateData.certifications = this.normalizeCertificationsJsonForPersistence(
        updateDto.certifications,
      ) as any;
    }
    if (updateDto.familyInfo !== undefined) {
      updateData.familyInfo = updateDto.familyInfo as any;
    }
    if (updateDto.socialMedia !== undefined) {
      // Merge with existing social media
      const currentSocialMedia = professionalWithExtras.socialMedia || {};
      updateData.socialMedia = {
        ...currentSocialMedia,
        ...updateDto.socialMedia,
      };
    }
    if (updateDto.timezone !== undefined) {
      updateData.timezone = this.normalizeProfessionalTimezone(updateDto.timezone);
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

    // Update User name if provided
    if (updateDto.firstName !== undefined || updateDto.lastName !== undefined) {
      const userUpdate: { firstName?: string; lastName?: string } = {};
      if (updateDto.firstName !== undefined) userUpdate.firstName = updateDto.firstName;
      if (updateDto.lastName !== undefined) userUpdate.lastName = updateDto.lastName;
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdate,
      });
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

  async getSharedDataById(userId: string, id: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const applicationId = id.startsWith('hired-') ? id.replace(/^hired-/, '') : id;
    const application = await this.prisma.jobApplication.findFirst({
      where: {
        id: applicationId,
        professionalId: professional.id,
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

    if (!application) {
      throw new NotFoundException('Shared data entry not found');
    }

    const isHired = id.startsWith('hired-');
    const job = application.job as any;
    const requiredApplicantData = (job?.requiredApplicantData ?? []) as string[];
    const applicationData = (application.applicationData as Record<string, unknown>) ?? {};

    return {
      success: true,
      data: {
        sharedData: {
          id: isHired ? `hired-${application.id}` : application.id,
          type: isHired ? 'hired' : 'application',
          organisationName:
            application.job.organisation.companyName ||
            `${application.job.organisation.user.firstName} ${application.job.organisation.user.lastName}`,
          status: isHired ? 'active' : application.status,
          accessType: isHired ? 'employment' : 'application',
          date: isHired ? application.updatedAt : application.createdAt,
          retentionPeriod: isHired ? 'Indefinite' : '30 days',
          jobTitle: application.job.jobTitle,
          requiredApplicantData,
          applicationData,
        },
      },
    };
  }

  async revokeAccess(userId: string, id: string, reason?: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const application = await this.prisma.jobApplication.findFirst({
      where: { id, professionalId: professional.id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const existingData = (application.applicationData as Record<string, unknown>) || {};
    const applicationDataUpdate = {
      ...existingData,
      revocationReason: reason?.trim() || null,
      revokedAt: new Date().toISOString(),
    };
    const newStatus = ['hired', 'accepted'].includes(application.status) ? 'rejected' : 'withdrawn';

    await this.prisma.jobApplication.update({
      where: { id },
      data: { status: newStatus, applicationData: applicationDataUpdate },
    });

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

  async saveJob(userId: string, jobId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    await this.prisma.savedJob.upsert({
      where: {
        professionalId_jobId: { professionalId: professional.id, jobId },
      },
      create: { professionalId: professional.id, jobId },
      update: {},
    });
    return { success: true, message: 'Job saved', data: { jobId } };
  }

  async unsaveJob(userId: string, jobId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    await this.prisma.savedJob.deleteMany({
      where: { professionalId: professional.id, jobId },
    });
    return { success: true, message: 'Job removed from saved', data: { jobId } };
  }

  async getSavedJobIds(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }
    const saved = await this.prisma.savedJob.findMany({
      where: { professionalId: professional.id },
      select: { jobId: true },
    });
    return {
      success: true,
      data: { jobIds: saved.map((s) => s.jobId) },
    };
  }

  private normalizeJobSettingsPayload(settings: any) {
    const jobTitles = Array.isArray(settings?.jobTitles)
      ? settings.jobTitles
          .map((title) => String(title || '').trim())
          .filter(Boolean)
      : String(settings?.jobTitles || '')
          .split(',')
          .map((title) => title.trim())
          .filter(Boolean);

    const automationFlows = Array.isArray(settings?.automationFlows)
      ? settings.automationFlows.map((flow, index) => ({
          id: String(flow?.id || `flow-${index + 1}`),
          role: String(flow?.role || '').trim(),
          workMode: String(flow?.workMode || '').trim(),
          employmentType: String(flow?.employmentType || '').trim(),
          payRange: String(flow?.payRange || '').trim(),
          organisations: String(flow?.organisations || '').trim(),
          location: String(flow?.location || '').trim(),
        }))
      : [];

    return {
      jobTitles,
      workMode: String(settings?.workMode || '').trim() || null,
      location: String(settings?.location || '').trim() || null,
      employmentType: String(settings?.employmentType || '').trim() || null,
      allowRecruiters:
        settings?.allowRecruiters === undefined
          ? true
          : Boolean(settings.allowRecruiters),
      automationFlows,
    };
  }

  async getJobSettings(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      include: { jobSettings: true },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const settings =
      professional.jobSettings ||
      (await this.prisma.professionalJobSettings.create({
        data: { professionalId: professional.id },
      }));

    return {
      success: true,
      data: {
        jobTitles: settings.jobTitles,
        workMode: settings.workMode || '',
        location: settings.location || '',
        employmentType: settings.employmentType || '',
        allowRecruiters: settings.allowRecruiters,
        automationFlows: Array.isArray(settings.automationFlows)
          ? settings.automationFlows
          : [],
      },
    };
  }

  async updateJobSettings(userId: string, settings: any) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    const payload = this.normalizeJobSettingsPayload(settings);
    const saved = await this.prisma.professionalJobSettings.upsert({
      where: { professionalId: professional.id },
      create: { professionalId: professional.id, ...payload },
      update: payload,
    });

    return {
      success: true,
      message: 'Job settings updated successfully',
      data: {
        jobTitles: saved.jobTitles,
        workMode: saved.workMode || '',
        location: saved.location || '',
        employmentType: saved.employmentType || '',
        allowRecruiters: saved.allowRecruiters,
        automationFlows: Array.isArray(saved.automationFlows)
          ? saved.automationFlows
          : [],
      },
    };
  }

  async getDashboardStats(userId: string) {
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

    const totalApplications = applications.length;
    const pendingApplications = applications.filter(
      (app) => app.status === 'pending' || app.status === 'under_review',
    ).length;
    const acceptedApplications = applications.filter(
      (app) => app.status === 'accepted' || app.status === 'hired',
    ).length;
    const profileCompleteness = professional.profileCompleteness ?? 0;

    const recentApplications = applications.slice(0, 5).map((app) => ({
      id: app.id,
      jobId: app.jobId,
      jobTitle: app.job.jobTitle,
      companyName:
        app.job.organisation.companyName ||
        `${app.job.organisation.user.firstName} ${app.job.organisation.user.lastName}`,
      location: app.job.location,
      status: app.status,
      appliedAt: app.createdAt,
      job: {
        jobTitle: app.job.jobTitle,
        organisation: {
          companyName: app.job.organisation.companyName,
        },
      },
    }));

    return {
      success: true,
      data: {
        totalApplications,
        pendingApplications,
        acceptedApplications,
        profileCompleteness,
        recentApplications,
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
    await ensureDefaultBillingPlans(this.prisma);
    const rows = await this.prisma.billingSubscriptionPlan.findMany({
      where: { entityType: BillingEntityType.professional, isActive: true },
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

  async sendPhoneOtp(
    userId: string,
    dto: { phoneE164: string; channel: 'sms' | 'email' },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { professional: true },
    });
    if (!user?.professional) {
      throw new ForbiddenException('Professional profile required');
    }
    const normalized = dto.phoneE164.trim();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    const key = `${userId}:${normalized}`;
    this.phoneOtpStore.set(key, { code, expiresAt, channel: dto.channel });

    if (dto.channel === 'email') {
      const html = `<p>Your Taldium phone verification code is: <strong>${code}</strong></p><p>Valid for 10 minutes.</p>`;
      this.eventEmitter.emit('send_verification_email', {
        to: user.email.toLowerCase(),
        subject: 'Phone verification code',
        html,
      });
    } else {
      console.log(`[SMS] Phone OTP for ${normalized} (user ${userId}): ${code}`);
    }

    return {
      success: true,
      message:
        dto.channel === 'email'
          ? 'Verification code sent to your account email'
          : 'Verification code issued (SMS delivery pending integration)',
      ...(process.env.NODE_ENV === 'development' ? { code } : {}),
    };
  }

  async verifyPhoneOtp(userId: string, dto: { phoneE164: string; code: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { professional: true },
    });
    if (!user?.professional) {
      throw new ForbiddenException('Professional profile required');
    }
    const normalized = dto.phoneE164.trim();
    const key = `${userId}:${normalized}`;
    const stored = this.phoneOtpStore.get(key);
    if (!stored) {
      throw new BadRequestException(
        'No verification code for this number. Request a new code.',
      );
    }
    if (stored.expiresAt < new Date()) {
      this.phoneOtpStore.delete(key);
      throw new BadRequestException('Code expired. Request a new code.');
    }
    if (stored.code !== dto.code) {
      throw new BadRequestException('Invalid verification code');
    }
    this.phoneOtpStore.delete(key);
    await this.prisma.user.update({
      where: { id: userId },
      data: { phoneNumber: normalized, phoneVerified: true },
    });
    return { success: true, message: 'Phone number verified' };
  }

  async sendAccountEmailVerificationCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { professional: true },
    });
    if (!user?.professional) {
      throw new ForbiddenException('Professional profile required');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    this.accountEmailOtpStore.set(userId, {
      code,
      expiresAt,
      email: user.email.toLowerCase(),
    });

    const html = `<p>Your Taldium email verification code is: <strong>${code}</strong></p><p>Valid for 10 minutes.</p>`;
    this.eventEmitter.emit('send_verification_email', {
      to: user.email.toLowerCase(),
      subject: 'Verify your email',
      html,
    });

    return {
      success: true,
      message: 'Verification code sent to your email',
      ...(process.env.NODE_ENV === 'development' ? { code } : {}),
    };
  }

  async verifyAccountEmailCode(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { professional: true },
    });
    if (!user?.professional) {
      throw new ForbiddenException('Professional profile required');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }
    const stored = this.accountEmailOtpStore.get(userId);
    if (!stored) {
      throw new BadRequestException(
        'No verification code found. Request a new code.',
      );
    }
    if (stored.expiresAt < new Date()) {
      this.accountEmailOtpStore.delete(userId);
      throw new BadRequestException('Code expired. Request a new code.');
    }
    if (stored.code !== code) {
      throw new BadRequestException('Invalid verification code');
    }
    this.accountEmailOtpStore.delete(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        ...(user.status === 'UNVERIFIED' ? { status: 'VERIFIED' as const } : {}),
      },
    });
    return { success: true, message: 'Email verified successfully' };
  }

  async sendEducationStudentEmailVerificationCode(
    userId: string,
    educationId: string,
    dto: { email: string },
  ) {
    const education = await this.prisma.education.findUnique({
      where: { id: educationId },
      include: { professional: true },
    });
    if (!education) {
      throw new NotFoundException('Education record not found');
    }
    if (education.professional.userId !== userId) {
      throw new ForbiddenException('You do not have permission to verify this education');
    }
    if (education.verificationStatus === 'verified') {
      throw new BadRequestException('This education is already verified');
    }

    const email = dto.email.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    const key = `${userId}:${educationId}`;
    this.educationStudentEmailOtpStore.set(key, { code, expiresAt, email });

    const institution = education.institutionName?.trim() || 'your institution';
    const html = `<p>Your Taldium education verification code for <strong>${institution}</strong> is: <strong>${code}</strong></p><p>Valid for 10 minutes.</p>`;
    this.eventEmitter.emit('send_verification_email', {
      to: email,
      subject: 'Verify your student email — Taldium',
      html,
    });

    await this.prisma.education.update({
      where: { id: educationId },
      data: {
        verificationMethod: 'student_email',
        studentVerificationEmail: email,
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
      message: 'Verification code sent to your student email',
      ...(process.env.NODE_ENV === 'development' ? { code } : {}),
    };
  }

  async verifyEducationStudentEmailOtp(
    userId: string,
    educationId: string,
    dto: { email: string; code: string },
  ) {
    const education = await this.prisma.education.findUnique({
      where: { id: educationId },
      include: { professional: true },
    });
    if (!education) {
      throw new NotFoundException('Education record not found');
    }
    if (education.professional.userId !== userId) {
      throw new ForbiddenException('You do not have permission to verify this education');
    }
    if (education.verificationStatus === 'verified') {
      return { success: true, message: 'Education verified successfully' };
    }

    const email = dto.email.trim().toLowerCase();
    const key = `${userId}:${educationId}`;
    const stored = this.educationStudentEmailOtpStore.get(key);
    if (!stored) {
      throw new BadRequestException('No verification code found. Request a new code.');
    }
    if (stored.expiresAt < new Date()) {
      this.educationStudentEmailOtpStore.delete(key);
      throw new BadRequestException('Code expired. Request a new code.');
    }
    if (stored.email !== email) {
      throw new BadRequestException('Use the same email address you requested a code for.');
    }
    if (stored.code !== dto.code.trim()) {
      throw new BadRequestException('Invalid verification code');
    }
    this.educationStudentEmailOtpStore.delete(key);

    const now = new Date();
    await this.prisma.education.update({
      where: { id: educationId },
      data: {
        verificationMethod: 'student_email',
        studentVerificationEmail: email,
        verificationStatus: 'verified',
        verifiedAt: now,
        reviewedBy: null,
      },
    });

    return { success: true, message: 'Education verified successfully' };
  }

  async sendExperienceWorkEmailVerificationCode(
    userId: string,
    experienceId: string,
    dto: { email: string },
  ) {
    const experience = await this.prisma.workExperience.findUnique({
      where: { id: experienceId },
      include: { professional: true },
    });
    if (!experience) {
      throw new NotFoundException('Work experience record not found');
    }
    if (experience.professional.userId !== userId) {
      throw new ForbiddenException('You do not have permission to verify this work experience');
    }
    if (experience.verificationStatus === 'verified') {
      throw new BadRequestException('This work experience is already verified');
    }

    const email = dto.email.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    const key = `${userId}:${experienceId}`;
    this.experienceWorkEmailOtpStore.set(key, { code, expiresAt, email });

    const org = experience.organisationName?.trim() || 'your employer';
    const html = `<p>Your Taldium work experience verification code for <strong>${org}</strong> is: <strong>${code}</strong></p><p>Valid for 10 minutes.</p>`;
    this.eventEmitter.emit('send_verification_email', {
      to: email,
      subject: 'Verify your work email — Taldium',
      html,
    });

    await this.prisma.workExperience.update({
      where: { id: experienceId },
      data: {
        verificationMethod: 'work_email',
        workVerificationEmail: email,
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
      message: 'Verification code sent to your work email',
      ...(process.env.NODE_ENV === 'development' ? { code } : {}),
    };
  }

  async verifyExperienceWorkEmailOtp(
    userId: string,
    experienceId: string,
    dto: { email: string; code: string },
  ) {
    const experience = await this.prisma.workExperience.findUnique({
      where: { id: experienceId },
      include: { professional: true },
    });
    if (!experience) {
      throw new NotFoundException('Work experience record not found');
    }
    if (experience.professional.userId !== userId) {
      throw new ForbiddenException('You do not have permission to verify this work experience');
    }
    if (experience.verificationStatus === 'verified') {
      return { success: true, message: 'Work experience verified successfully' };
    }

    const email = dto.email.trim().toLowerCase();
    const key = `${userId}:${experienceId}`;
    const stored = this.experienceWorkEmailOtpStore.get(key);
    if (!stored) {
      throw new BadRequestException('No verification code found. Request a new code.');
    }
    if (stored.expiresAt < new Date()) {
      this.experienceWorkEmailOtpStore.delete(key);
      throw new BadRequestException('Code expired. Request a new code.');
    }
    if (stored.email !== email) {
      throw new BadRequestException('Use the same email address you requested a code for.');
    }
    if (stored.code !== dto.code.trim()) {
      throw new BadRequestException('Invalid verification code');
    }
    this.experienceWorkEmailOtpStore.delete(key);

    const now = new Date();
    await this.prisma.workExperience.update({
      where: { id: experienceId },
      data: {
        verificationMethod: 'work_email',
        workVerificationEmail: email,
        verificationStatus: 'verified',
        verifiedAt: now,
        reviewedBy: null,
      },
    });

    return { success: true, message: 'Work experience verified successfully' };
  }

  private static readonly PROFILE_EDIT_ALLOWED_FIELDS = new Set([
    'firstName',
    'middleName',
    'nationality',
    'email',
    'lastName',
    'dateOfBirth',
    'gender',
    'phoneNumber',
  ]);

  async submitProfileEditRequest(
    userId: string,
    dto: { fields: string; reason: string },
    file: { buffer: Buffer; originalname: string; mimetype?: string },
  ) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(dto.fields);
    } catch {
      throw new BadRequestException('Invalid fields payload');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new BadRequestException('Select at least one field to edit');
    }
    const fields = parsed.filter((k): k is string => typeof k === 'string');
    const normalized = [...new Set(fields)].filter((k) =>
      ProfessionalService.PROFILE_EDIT_ALLOWED_FIELDS.has(k),
    );
    if (normalized.length === 0) {
      throw new BadRequestException('No valid fields selected');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Supporting evidence document is required');
    }
    const mime = file.mimetype || '';
    const allowed =
      mime.startsWith('image/') || mime === 'application/pdf' || mime === 'application/x-pdf';
    if (!allowed) {
      throw new BadRequestException('Supporting evidence must be an image or PDF');
    }
    const maxBytes = 15 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException('Supporting document must be at most 15 MB');
    }
    const safeName = (file.originalname || 'evidence').replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${professional.id}-edit-req-${Date.now()}-${safeName}`;
    const supportingDocumentUrl = await this.s3.upload(file.buffer, filename, {
      prefix: 'profile-edit-requests',
      contentType: file.mimetype,
    });

    const row = await this.prisma.professionalProfileEditRequest.create({
      data: {
        professionalId: professional.id,
        fields: normalized,
        reason: dto.reason,
        supportingDocumentUrl,
        status: 'under_review',
      },
    });

    return {
      id: row.id,
      status: row.status,
      submittedAt: row.submittedAt,
      fields: normalized,
      reason: row.reason,
      supportingDocumentUrl: row.supportingDocumentUrl,
    };
  }
}
