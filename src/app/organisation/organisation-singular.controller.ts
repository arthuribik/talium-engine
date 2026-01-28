import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../utility/jwt/jwt-auth.guard';
import { OrganisationService } from './organisation.service';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';

@ApiTags('Organisation')
@Controller('organisation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganisationSingularController {
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
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  async getOrganisationJobs(@Request() req) {
    return this.organisationService.getOrganisationJobs(req.user.userId, 1, 1000);
  }

  @Get('applications')
  @ApiOperation({ summary: 'Get organisation job applications' })
  @ApiResponse({ status: 200, description: 'Applications retrieved successfully' })
  async getApplications(@Request() req) {
    return this.organisationService.getApplications(req.user.userId, 1, 1000);
  }

  @Get('professionals')
  @ApiOperation({ summary: 'Get hired professionals' })
  @ApiResponse({ status: 200, description: 'Professionals retrieved successfully' })
  async getHiredProfessionals(@Request() req) {
    return this.organisationService.getHiredProfessionals(req.user.userId, 1, 1000);
  }
}

