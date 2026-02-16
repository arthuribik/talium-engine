import {
  Controller,
  Put,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../utility/jwt/jwt-auth.guard';
import { OrganisationService } from './organisation.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';
import { CreateJobDto } from '../job/dto/create-job.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@ApiTags('Organisation')
@Controller('organisation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganisationController {
  constructor(private readonly organisationService: OrganisationService) {}

  @Get('profile')
  @ApiOperation({
    summary: 'Get organisation profile (for logged-in organisation)',
  })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getProfile(@Request() req) {
    return this.organisationService.getOrganisationProfile(req.user.userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update organisation profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async updateProfile(
    @Request() req,
    @Body() updateDto: UpdateOrganisationProfileDto,
  ) {
    return this.organisationService.updateOrganisationProfile(
      req.user.userId,
      updateDto,
    );
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get organisation dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getDashboardStats(@Request() req) {
    return this.organisationService.getDashboardStats(req.user.userId);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Get organisation jobs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  async getOrganisationJobs(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.organisationService.getOrganisationJobs(
      req.user.userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Post('jobs')
  @ApiOperation({ summary: 'Create a job (Organisation)' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async createJob(@Request() req, @Body() createJobDto: CreateJobDto) {
    return this.organisationService.createJob(req.user.userId, createJobDto);
  }

  @Get('applications')
  @ApiOperation({ summary: 'Get organisation job applications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'jobId',
    required: false,
    type: String,
    description: 'Filter by job ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status',
  })
  @ApiResponse({
    status: 200,
    description: 'Applications retrieved successfully',
  })
  async getApplications(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('jobId') jobId?: string,
    @Query('status') status?: string,
  ) {
    return this.organisationService.getApplications(
      req.user.userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      jobId,
      status,
    );
  }

  @Put('applications/:applicationId/status')
  @ApiOperation({
    summary: 'Update application status (shortlist, reject, etc.)',
  })
  @ApiParam({ name: 'applicationId', description: 'Application ID' })
  @ApiResponse({
    status: 200,
    description: 'Application status updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async updateApplicationStatus(
    @Request() req,
    @Param('applicationId') applicationId: string,
    @Body() body: { status: string },
  ) {
    return this.organisationService.updateApplicationStatus(
      req.user.userId,
      applicationId,
      body.status,
    );
  }

  @Put('jobs/:jobId/status')
  @ApiOperation({
    summary: 'Update job status (publish, unpublish, pause, etc.)',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async updateJobStatus(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body() body: { status: string },
  ) {
    return this.organisationService.updateJobStatus(
      req.user.userId,
      jobId,
      body.status,
    );
  }

  @Get('professionals')
  @ApiOperation({ summary: 'Search and get professionals with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or email' })
  @ApiQuery({ name: 'jobTitle', required: false, type: String, description: 'Filter by job title' })
  @ApiQuery({ name: 'country', required: false, type: String, description: 'Filter by country' })
  @ApiQuery({ name: 'city', required: false, type: String, description: 'Filter by city' })
  @ApiQuery({ name: 'verified', required: false, type: Boolean, description: 'Filter by verified profile' })
  @ApiQuery({ name: 'minExperience', required: false, type: Number, description: 'Minimum years of experience' })
  @ApiResponse({
    status: 200,
    description: 'Professionals retrieved successfully',
  })
  async searchProfessionals(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('jobTitle') jobTitle?: string,
    @Query('country') country?: string,
    @Query('city') city?: string,
    @Query('verified') verified?: string,
    @Query('minExperience') minExperience?: string,
  ) {
    return this.organisationService.searchProfessionals(
      req.user.userId,
      {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        search: search || '',
        jobTitle: jobTitle || '',
        country: country || '',
        city: city || '',
        verified: verified === 'true',
        minExperience: minExperience ? parseInt(minExperience) : undefined,
      },
    );
  }

  @Get('professionals/hired')
  @ApiOperation({ summary: 'Get hired professionals' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Professionals retrieved successfully',
  })
  async getHiredProfessionals(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.organisationService.getHiredProfessionals(
      req.user.userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Post('professionals/:professionalId/hire')
  @ApiOperation({ summary: 'Hire a professional (Direct Scout)' })
  @ApiParam({ name: 'professionalId', description: 'Professional ID' })
  @ApiQuery({
    name: 'jobId',
    required: false,
    type: String,
    description: 'Optional job ID if hiring for a specific job',
  })
  @ApiResponse({ status: 200, description: 'Professional hired successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async hireProfessional(
    @Request() req,
    @Param('professionalId') professionalId: string,
    @Query('jobId') jobId?: string,
    @Body() body?: { jobTitle?: string; message?: string },
  ) {
    return this.organisationService.hireProfessional(
      req.user.userId,
      professionalId,
      jobId,
      body?.jobTitle,
      body?.message,
    );
  }

  @Post('professionals/:professionalId/message')
  @ApiOperation({ summary: 'Send a message to a professional' })
  @ApiParam({ name: 'professionalId', description: 'Professional ID' })
  @ApiResponse({
    status: 200,
    description: 'Message sent successfully',
  })
  async sendMessageToProfessional(
    @Request() req,
    @Param('professionalId') professionalId: string,
    @Body() body: { subject?: string; message: string; jobTitle?: string },
  ) {
    return this.organisationService.sendMessageToProfessional(
      req.user.userId,
      professionalId,
      body.message,
      body.subject,
      body.jobTitle,
    );
  }

  @Get('billing')
  @ApiOperation({ summary: 'Get organisation billing information' })
  @ApiResponse({
    status: 200,
    description: 'Billing information retrieved successfully',
  })
  async getBilling(@Request() req) {
    return this.organisationService.getBilling(req.user.userId);
  }

  @Put('billing/subscription')
  @ApiOperation({ summary: 'Update organisation subscription plan' })
  @ApiResponse({
    status: 200,
    description: 'Subscription updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid plan' })
  async updateSubscription(@Request() req, @Body() body: { plan: string }) {
    return this.organisationService.updateSubscription(
      req.user.userId,
      body.plan,
    );
  }

  @Post('billing/subscription')
  @ApiOperation({ summary: 'Initiate subscription payment' })
  @ApiResponse({ status: 200, description: 'Payment initiated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid plan or payment details' })
  async initiatePayment(
    @Request() req,
    @Body() initiatePaymentDto: InitiatePaymentDto,
  ) {
    return this.organisationService.initiatePayment(
      req.user.userId,
      initiatePaymentDto,
    );
  }

  @Get('billing/plans')
  @ApiOperation({
    summary: 'Get available subscription plans for organisations',
  })
  @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
  async getAvailablePlans() {
    return this.organisationService.getAvailablePlans();
  }

  @Get('billing/history')
  @ApiOperation({
    summary: 'Get billing history (successful transactions only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Billing history retrieved successfully',
  })
  async getBillingHistory(@Request() req) {
    return this.organisationService.getBillingHistory(req.user.userId);
  }

  @Put(':orgId/setup')
  @ApiOperation({ summary: 'Complete organisation setup' })
  @ApiParam({ name: 'orgId', description: 'Organisation ID' })
  @ApiResponse({
    status: 200,
    description: 'Organisation profile updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async setup(
    @Request() req,
    @Param('orgId') orgId: string,
    @Body() setupDto: OrganisationSetupDto,
  ) {
    return this.organisationService.setupOrganisation(
      req.user.userId,
      orgId,
      setupDto,
    );
  }

  @Post(':orgId/verification/request')
  @ApiOperation({ summary: 'Request organisation verification' })
  @ApiParam({ name: 'orgId', description: 'Organisation ID' })
  @ApiResponse({
    status: 201,
    description: 'Verification request submitted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or setup not completed',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async requestVerification(
    @Request() req,
    @Param('orgId') orgId: string,
    @Body() verificationDto: VerificationRequestDto,
  ) {
    return this.organisationService.requestVerification(
      req.user.userId,
      orgId,
      verificationDto,
    );
  }
}
