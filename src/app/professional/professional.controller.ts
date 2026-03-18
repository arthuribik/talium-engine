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
import { InitiatePaymentDto } from '../organisation/dto/initiate-payment.dto';
import { UpdateProfessionalProfileDto } from './dto/update-profile.dto';
import { VerifyPasswordDto } from './dto/verify-password.dto';

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

  @Get('shared-data')
  @ApiOperation({ summary: 'Get shared data history' })
  @ApiResponse({
    status: 200,
    description: 'Shared data retrieved successfully',
  })
  async getSharedData(@Request() req) {
    return this.professionalService.getSharedData(req.user.userId);
  }

  @Post('shared-data/:id/revoke')
  @ApiOperation({ summary: 'Revoke access for an organisation' })
  @ApiParam({ name: 'id', description: 'Shared data ID' })
  @ApiResponse({ status: 200, description: 'Access revoked successfully' })
  async revokeAccess(@Request() req, @Param('id') id: string) {
    return this.professionalService.revokeAccess(req.user.userId, id);
  }

  @Get('shared-data/:id/report')
  @ApiOperation({ summary: 'Download shared data report' })
  @ApiParam({ name: 'id', description: 'Shared data ID' })
  @ApiResponse({ status: 200, description: 'Report retrieved successfully' })
  async getReport(@Request() req, @Param('id') id: string) {
    return this.professionalService.getReport(req.user.userId, id);
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
