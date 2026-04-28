import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../utility/jwt/jwt-auth.guard';
import { ProfessionalService } from './professional.service';
import { IdentityVerifyDto } from './dto/identity-verify.dto';
import { AddEducationDto } from './dto/add-education.dto';
import { AddExperienceDto } from './dto/add-experience.dto';
import { AddProjectDto } from './dto/add-project.dto';
import { InitiatePaymentDto } from '../organisation/dto/initiate-payment.dto';
import { UpdateProfessionalProfileDto } from './dto/update-profile.dto';
import { VerifyPasswordDto } from './dto/verify-password.dto';
import { RevokeAccessDto } from './dto/revoke-access.dto';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { VerifyAccountEmailCodeDto } from './dto/verify-account-email-code.dto';
import { EducationStudentEmailSendOtpDto } from './dto/education-student-email-send-otp.dto';
import { EducationStudentEmailVerifyOtpDto } from './dto/education-student-email-verify-otp.dto';
import { SubmitProfessionalProfileEditRequestDto } from './dto/submit-profile-edit-request.dto';

@ApiTags('Professional')
@Controller('professional')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfessionalController {
  constructor(private readonly professionalService: ProfessionalService) {}

  @Post('verify-password')
  @ApiOperation({ summary: 'Verify current password before sensitive actions' })
  @ApiResponse({ status: 200, description: 'Password verified successfully' })
  @ApiResponse({ status: 401, description: 'Invalid password' })
  async verifyPassword(@Request() req, @Body() body: VerifyPasswordDto) {
    return this.professionalService.verifyPassword(req.user.userId, body.password);
  }

  @Post('phone/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send phone verification code (SMS or account email)' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  async sendPhoneOtp(@Request() req, @Body() dto: SendPhoneOtpDto) {
    return this.professionalService.sendPhoneOtp(req.user.userId, dto);
  }

  @Post('phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone OTP and save E.164 number on the user' })
  @ApiResponse({ status: 200, description: 'Phone verified' })
  async verifyPhoneOtp(@Request() req, @Body() dto: VerifyPhoneOtpDto) {
    return this.professionalService.verifyPhoneOtp(req.user.userId, dto);
  }

  @Post('contact/send-email-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send 6-digit code to verify account email (unverified accounts)' })
  @ApiResponse({ status: 200, description: 'Code sent' })
  async sendAccountEmailVerification(@Request() req) {
    return this.professionalService.sendAccountEmailVerificationCode(req.user.userId);
  }

  @Post('contact/verify-email-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify account email with 6-digit code' })
  @ApiResponse({ status: 200, description: 'Email verified' })
  async verifyAccountEmailCode(
    @Request() req,
    @Body() dto: VerifyAccountEmailCodeDto,
  ) {
    return this.professionalService.verifyAccountEmailCode(req.user.userId, dto.code);
  }

  @Get('profile')
  @ApiOperation({
    summary: 'Get professional profile (for logged-in professional)',
  })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async getProfile(@Request() req) {
    return this.professionalService.getProfile(req.user.userId);
  }

  @Get('verification-status')
  @ApiOperation({ summary: 'Get verification status per section' })
  @ApiResponse({ status: 200, description: 'Verification status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async getVerificationStatus(@Request() req) {
    return this.professionalService.getVerificationStatus(req.user.userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update professional profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async updateProfile(
    @Request() req,
    @Body() updateDto: UpdateProfessionalProfileDto,
  ) {
    return this.professionalService.updateProfile(req.user.userId, updateDto);
  }

  @Post('upload-id')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload ID document (image or PDF)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'ID document uploaded, returns URL' })
  @ApiResponse({ status: 400, description: 'No file or invalid file' })
  async uploadIdDocument(@Request() req, @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string }) {
    if (!file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }
    return this.professionalService.uploadIdDocument(req.user.userId, {
      buffer: file.buffer,
      originalname: file.originalname ?? 'document',
      mimetype: file.mimetype,
    });
  }

  @Post('upload-cv')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload CV/resume (PDF or document)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'CV uploaded, returns URL' })
  @ApiResponse({ status: 400, description: 'No file or invalid file' })
  async uploadCv(@Request() req, @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string }) {
    if (!file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }
    return this.professionalService.uploadCv(req.user.userId, {
      buffer: file.buffer,
      originalname: file.originalname ?? 'cv',
      mimetype: file.mimetype,
    });
  }

  @Post('upload-profile-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload profile photo (stored in S3; updates professional profile)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded; returns URL and updates profile' })
  @ApiResponse({ status: 400, description: 'No file or invalid file' })
  async uploadProfileImage(
    @Request() req,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }
    return this.professionalService.uploadProfileImage(req.user.userId, {
      buffer: file.buffer,
      originalname: file.originalname ?? 'photo',
      mimetype: file.mimetype,
    });
  }

  @Post('upload-liveness-selfie')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Upload liveness verification selfie (S3 only; does not change profile photo)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Selfie stored for liveness verification' })
  @ApiResponse({ status: 400, description: 'No file or invalid file' })
  async uploadLivenessSelfie(
    @Request() req,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }
    return this.professionalService.uploadLivenessSelfie(req.user.userId, {
      buffer: file.buffer,
      originalname: file.originalname ?? 'liveness.jpg',
      mimetype: file.mimetype,
    });
  }

  @Post('profile/edit-request')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Request edits to verified personal profile data (fields, reason, supporting document)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fields', 'reason', 'file'],
      properties: {
        fields: {
          type: 'string',
          description: 'JSON array of field keys, e.g. ["firstName","email"]',
        },
        reason: {
          type: 'string',
          enum: [
            'legal_name_change',
            'clerical_error',
            'outdated_information',
            'government_id_reissued',
            'other',
          ],
        },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Edit request submitted' })
  async submitProfileEditRequest(
    @Request() req,
    @Body() body: SubmitProfessionalProfileEditRequestDto,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Supporting evidence document is required');
    }
    return this.professionalService.submitProfileEditRequest(req.user.userId, body, {
      buffer: file.buffer,
      originalname: file.originalname ?? 'document',
      mimetype: file.mimetype,
    });
  }

  @Get('shared-data')
  @ApiOperation({ summary: 'Get shared data history' })
  @ApiResponse({
    status: 200,
    description: 'Shared data retrieved successfully',
  })
  async getSharedData(@Request() req) {
    return this.professionalService.getSharedData(req.user.userId);
  }

  @Get('shared-data/:id/report')
  @ApiOperation({ summary: 'Download shared data report' })
  @ApiParam({ name: 'id', description: 'Shared data ID' })
  @ApiResponse({ status: 200, description: 'Report retrieved successfully' })
  async getReport(@Request() req, @Param('id') id: string) {
    return this.professionalService.getReport(req.user.userId, id);
  }

  @Get('shared-data/:id')
  @ApiOperation({ summary: 'Get shared data entry by ID (requirement applicant data)' })
  @ApiParam({ name: 'id', description: 'Shared data ID (application id or hired-{applicationId})' })
  @ApiResponse({ status: 200, description: 'Shared data entry with applicant data' })
  async getSharedDataById(@Request() req, @Param('id') id: string) {
    return this.professionalService.getSharedDataById(req.user.userId, id);
  }

  @Post('shared-data/:id/revoke')
  @ApiOperation({ summary: 'Revoke access for an organisation' })
  @ApiParam({ name: 'id', description: 'Shared data ID' })
  @ApiResponse({ status: 200, description: 'Access revoked successfully' })
  async revokeAccess(@Request() req, @Param('id') id: string, @Body() body: RevokeAccessDto) {
    return this.professionalService.revokeAccess(req.user.userId, id, body?.reason);
  }

  @Get('applications')
  @ApiOperation({ summary: 'Get professional job applications' })
  @ApiResponse({
    status: 200,
    description: 'Applications retrieved successfully',
  })
  async getApplications(@Request() req) {
    return this.professionalService.getApplications(req.user.userId);
  }

  @Get('saved-jobs')
  @ApiOperation({ summary: 'Get saved job IDs for the professional' })
  @ApiResponse({
    status: 200,
    description: 'Returns { jobIds: string[] }',
  })
  async getSavedJobIds(@Request() req) {
    return this.professionalService.getSavedJobIds(req.user.userId);
  }

  @Post('saved-jobs')
  @ApiOperation({ summary: 'Save a job' })
  @ApiResponse({ status: 200, description: 'Job saved' })
  @ApiResponse({ status: 404, description: 'Job or professional not found' })
  async saveJob(@Request() req, @Body() body: { jobId: string }) {
    if (!body?.jobId) {
      throw new BadRequestException('jobId is required');
    }
    return this.professionalService.saveJob(req.user.userId, body.jobId);
  }

  @Delete('saved-jobs/:jobId')
  @ApiOperation({ summary: 'Remove a job from saved' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job removed from saved' })
  async unsaveJob(@Request() req, @Param('jobId') jobId: string) {
    return this.professionalService.unsaveJob(req.user.userId, jobId);
  }

  @Get('job-settings')
  @ApiOperation({ summary: 'Get professional job notification and automation settings' })
  @ApiResponse({
    status: 200,
    description: 'Job settings retrieved successfully',
  })
  async getJobSettings(@Request() req) {
    return this.professionalService.getJobSettings(req.user.userId);
  }

  @Put('job-settings')
  @ApiOperation({ summary: 'Update professional job notification and automation settings' })
  @ApiResponse({
    status: 200,
    description: 'Job settings updated successfully',
  })
  async updateJobSettings(@Request() req, @Body() settings: any) {
    return this.professionalService.updateJobSettings(req.user.userId, settings);
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get dashboard analytics for professional' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard stats retrieved successfully',
  })
  async getDashboardStats(@Request() req) {
    return this.professionalService.getDashboardStats(req.user.userId);
  }

  @Get('headhunt-offers')
  @ApiOperation({ summary: 'Get headhunt offers (Direct Scout messages)' })
  @ApiResponse({
    status: 200,
    description: 'Headhunt offers retrieved successfully',
  })
  async getHeadhuntOffers(@Request() req) {
    return this.professionalService.getHeadhuntOffers(req.user.userId);
  }

  @Get('privacy-settings')
  @ApiOperation({ summary: 'Get privacy settings' })
  @ApiResponse({
    status: 200,
    description: 'Privacy settings retrieved successfully',
  })
  async getPrivacySettings(@Request() req) {
    return this.professionalService.getPrivacySettings(req.user.userId);
  }

  @Put('privacy-settings')
  @ApiOperation({ summary: 'Update privacy settings' })
  @ApiResponse({
    status: 200,
    description: 'Privacy settings updated successfully',
  })
  async updatePrivacySettings(@Request() req, @Body() settings: any) {
    return this.professionalService.updatePrivacySettings(
      req.user.userId,
      settings,
    );
  }

  @Get('documents')
  @ApiOperation({ summary: 'Get professional documents' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async getDocuments(@Request() req) {
    return this.professionalService.getDocuments(req.user.userId);
  }

  @Delete('documents/:documentId')
  @ApiOperation({ summary: 'Delete a document' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  async deleteDocument(
    @Request() req,
    @Param('documentId') documentId: string,
  ) {
    return this.professionalService.deleteDocument(req.user.userId, documentId);
  }

  @Get('billing')
  @ApiOperation({ summary: 'Get professional billing information' })
  @ApiResponse({
    status: 200,
    description: 'Billing information retrieved successfully',
  })
  async getBilling(@Request() req) {
    return this.professionalService.getBilling(req.user.userId);
  }

  @Put('billing/subscription')
  @ApiOperation({ summary: 'Update professional subscription plan' })
  @ApiResponse({
    status: 200,
    description: 'Subscription updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid plan' })
  async updateSubscription(@Request() req, @Body() body: { plan: string }) {
    return this.professionalService.updateSubscription(
      req.user.userId,
      body.plan,
    );
  }

  @Post('billing/subscription')
  @ApiOperation({ summary: 'Initiate professional subscription payment' })
  @ApiResponse({ status: 200, description: 'Payment initiated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid plan or payment details' })
  async initiatePayment(
    @Request() req,
    @Body() initiatePaymentDto: InitiatePaymentDto,
  ) {
    return this.professionalService.initiatePayment(
      req.user.userId,
      initiatePaymentDto,
    );
  }

  @Get('billing/plans')
  @ApiOperation({
    summary: 'Get available subscription plans for professionals',
  })
  @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
  async getAvailablePlans() {
    return this.professionalService.getAvailablePlans();
  }

  @Post(':profId/identity/verify')
  @ApiOperation({ summary: 'Verify professional identity' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({
    status: 200,
    description: 'Identity verification completed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async verifyIdentity(
    @Request() req,
    @Param('profId') profId: string,
    @Body() identityDto: IdentityVerifyDto,
  ) {
    return this.professionalService.verifyIdentity(
      req.user.userId,
      profId,
      identityDto,
    );
  }

  @Post(':profId/education')
  @ApiOperation({ summary: 'Add educational information' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({ status: 201, description: 'Education added successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async addEducation(
    @Request() req,
    @Param('profId') profId: string,
    @Body() educationDto: AddEducationDto,
  ) {
    return this.professionalService.addEducation(
      req.user.userId,
      profId,
      educationDto,
    );
  }

  @Post(':profId/experience')
  @ApiOperation({ summary: 'Add work experience' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({
    status: 201,
    description: 'Work experience added successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async addExperience(
    @Request() req,
    @Param('profId') profId: string,
    @Body() experienceDto: AddExperienceDto,
  ) {
    return this.professionalService.addExperience(
      req.user.userId,
      profId,
      experienceDto,
    );
  }

  @Post('education/:educationId/student-email/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to institution email to verify an education record' })
  @ApiParam({ name: 'educationId', description: 'Education ID' })
  @ApiResponse({ status: 200, description: 'OTP sent to student email' })
  async sendEducationStudentEmailOtp(
    @Request() req,
    @Param('educationId') educationId: string,
    @Body() dto: EducationStudentEmailSendOtpDto,
  ) {
    return this.professionalService.sendEducationStudentEmailVerificationCode(
      req.user.userId,
      educationId,
      dto,
    );
  }

  @Post('education/:educationId/student-email/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify student email OTP and mark education as verified' })
  @ApiParam({ name: 'educationId', description: 'Education ID' })
  @ApiResponse({ status: 200, description: 'Education verified' })
  async verifyEducationStudentEmailOtp(
    @Request() req,
    @Param('educationId') educationId: string,
    @Body() dto: EducationStudentEmailVerifyOtpDto,
  ) {
    return this.professionalService.verifyEducationStudentEmailOtp(
      req.user.userId,
      educationId,
      dto,
    );
  }

  @Post('experience/:experienceId/work-email/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to company email to verify a work experience record' })
  @ApiParam({ name: 'experienceId', description: 'Work experience ID' })
  @ApiResponse({ status: 200, description: 'OTP sent to work email' })
  async sendExperienceWorkEmailOtp(
    @Request() req,
    @Param('experienceId') experienceId: string,
    @Body() dto: EducationStudentEmailSendOtpDto,
  ) {
    return this.professionalService.sendExperienceWorkEmailVerificationCode(
      req.user.userId,
      experienceId,
      dto,
    );
  }

  @Post('experience/:experienceId/work-email/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify work email OTP and mark work experience as verified' })
  @ApiParam({ name: 'experienceId', description: 'Work experience ID' })
  @ApiResponse({ status: 200, description: 'Work experience verified' })
  async verifyExperienceWorkEmailOtp(
    @Request() req,
    @Param('experienceId') experienceId: string,
    @Body() dto: EducationStudentEmailVerifyOtpDto,
  ) {
    return this.professionalService.verifyExperienceWorkEmailOtp(
      req.user.userId,
      experienceId,
      dto,
    );
  }

  @Put('education/:educationId')
  @ApiOperation({ summary: 'Update education record' })
  @ApiParam({ name: 'educationId', description: 'Education ID' })
  @ApiResponse({ status: 200, description: 'Education updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateEducation(
    @Request() req,
    @Param('educationId') educationId: string,
    @Body() educationDto: AddEducationDto,
  ) {
    return this.professionalService.updateEducation(
      req.user.userId,
      educationId,
      educationDto,
    );
  }

  @Put('experience/:experienceId')
  @ApiOperation({ summary: 'Update work experience record' })
  @ApiParam({ name: 'experienceId', description: 'Experience ID' })
  @ApiResponse({
    status: 200,
    description: 'Work experience updated successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateExperience(
    @Request() req,
    @Param('experienceId') experienceId: string,
    @Body() experienceDto: AddExperienceDto,
  ) {
    return this.professionalService.updateExperience(
      req.user.userId,
      experienceId,
      experienceDto,
    );
  }

  @Delete('education/:educationId')
  @ApiOperation({ summary: 'Delete education record' })
  @ApiParam({ name: 'educationId', description: 'Education ID' })
  @ApiResponse({ status: 200, description: 'Education deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async deleteEducation(
    @Request() req,
    @Param('educationId') educationId: string,
  ) {
    return this.professionalService.deleteEducation(
      req.user.userId,
      educationId,
    );
  }

  @Delete('experience/:experienceId')
  @ApiOperation({ summary: 'Delete work experience record' })
  @ApiParam({ name: 'experienceId', description: 'Experience ID' })
  @ApiResponse({
    status: 200,
    description: 'Work experience deleted successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async deleteExperience(
    @Request() req,
    @Param('experienceId') experienceId: string,
  ) {
    return this.professionalService.deleteExperience(
      req.user.userId,
      experienceId,
    );
  }

  @Post(':profId/project')
  @ApiOperation({ summary: 'Add portfolio project' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({ status: 201, description: 'Project added successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async addProject(
    @Request() req,
    @Param('profId') profId: string,
    @Body() projectDto: AddProjectDto,
  ) {
    return this.professionalService.addProject(
      req.user.userId,
      profId,
      projectDto,
    );
  }

  @Put('project/:projectId')
  @ApiOperation({ summary: 'Update project record' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateProject(
    @Request() req,
    @Param('projectId') projectId: string,
    @Body() projectDto: AddProjectDto,
  ) {
    return this.professionalService.updateProject(
      req.user.userId,
      projectId,
      projectDto,
    );
  }

  @Delete('project/:projectId')
  @ApiOperation({ summary: 'Delete project record' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async deleteProject(
    @Request() req,
    @Param('projectId') projectId: string,
  ) {
    return this.professionalService.deleteProject(
      req.user.userId,
      projectId,
    );
  }

  @Get(':profId/setup/status')
  @ApiOperation({ summary: 'Get profile completion status' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({
    status: 200,
    description: 'Profile status retrieved successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getSetupStatus(@Request() req, @Param('profId') profId: string) {
    return this.professionalService.getSetupStatus(req.user.userId, profId);
  }
}
