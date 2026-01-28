import { Controller, Put, Post, Get, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../utility/jwt/jwt-auth.guard';
import { OrganisationService } from './organisation.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';

@ApiTags('Organisations')
@Controller('organisations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganisationController {
  constructor(private readonly organisationService: OrganisationService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get organisation profile (for logged-in organisation)' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getProfile(@Request() req) {
    return this.organisationService.getOrganisationProfile(req.user.userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update organisation profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async updateProfile(@Request() req, @Body() updateDto: UpdateOrganisationProfileDto) {
    return this.organisationService.updateOrganisationProfile(req.user.userId, updateDto);
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get organisation dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getDashboardStats(@Request() req) {
    return this.organisationService.getDashboardStats(req.user.userId);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Get organisation jobs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  async getOrganisationJobs(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.organisationService.getOrganisationJobs(req.user.userId, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Get('applications')
  @ApiOperation({ summary: 'Get organisation job applications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'jobId', required: false, type: String, description: 'Filter by job ID' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'Applications retrieved successfully' })
  async getApplications(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string, @Query('jobId') jobId?: string, @Query('status') status?: string) {
    return this.organisationService.getApplications(req.user.userId, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20, jobId, status);
  }

  @Get('professionals')
  @ApiOperation({ summary: 'Get hired professionals' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Professionals retrieved successfully' })
  async getHiredProfessionals(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.organisationService.getHiredProfessionals(req.user.userId, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Post('professionals/:professionalId/hire')
  @ApiOperation({ summary: 'Hire a professional' })
  @ApiParam({ name: 'professionalId', description: 'Professional ID' })
  @ApiQuery({ name: 'jobId', required: false, type: String, description: 'Job ID if hiring for specific job' })
  @ApiResponse({ status: 201, description: 'Professional hired successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async hireProfessional(@Request() req, @Param('professionalId') professionalId: string, @Query('jobId') jobId?: string) {
    return this.organisationService.hireProfessional(req.user.userId, professionalId, jobId);
  }

  @Put(':orgId/setup')
  @ApiOperation({ summary: 'Complete organisation setup' })
  @ApiParam({ name: 'orgId', description: 'Organisation ID' })
  @ApiResponse({ status: 200, description: 'Organisation profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async setup(@Request() req, @Param('orgId') orgId: string, @Body() setupDto: OrganisationSetupDto) {
    return this.organisationService.setupOrganisation(req.user.userId, orgId, setupDto);
  }

  @Post(':orgId/verification/request')
  @ApiOperation({ summary: 'Request organisation verification' })
  @ApiParam({ name: 'orgId', description: 'Organisation ID' })
  @ApiResponse({ status: 201, description: 'Verification request submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data or setup not completed' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async requestVerification(@Request() req, @Param('orgId') orgId: string, @Body() verificationDto: VerificationRequestDto) {
    return this.organisationService.requestVerification(req.user.userId, orgId, verificationDto);
  }
}

