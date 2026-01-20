import { Controller, Post, Get, Put, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../utility/jwt/jwt-auth.guard';
import { AdminService } from './admin.service';
import { InviteAdminDto } from './dto/invite-admin.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('create-super-admin')
  @ApiOperation({ summary: 'Create the first super admin (only if no super admin exists)' })
  @ApiResponse({ status: 201, description: 'Super admin created successfully' })
  @ApiResponse({ status: 403, description: 'Super admin already exists' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async createSuperAdmin(@Body() createSuperAdminDto: CreateSuperAdminDto) {
    return this.adminService.createSuperAdmin(createSuperAdminDto);
  }

  @Post('users/invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a new admin user (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Admin invitation sent successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only super admins can invite' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async inviteAdmin(@Request() req, @Body() inviteAdminDto: InviteAdminDto) {
    return this.adminService.inviteAdmin(req.user.userId, inviteAdminDto);
  }

  @Post('onboarding/complete')
  @ApiOperation({ summary: 'Complete admin onboarding' })
  @ApiResponse({ status: 200, description: 'Admin onboarding completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or passwords do not match' })
  async completeOnboarding(@Body() completeOnboardingDto: CompleteOnboardingDto) {
    return this.adminService.completeOnboarding(completeOnboardingDto);
  }

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getDashboardStats(@Request() req) {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getAllUsers(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getAllUsers(page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Get('organisations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all organisations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Organisations retrieved successfully' })
  async getAllOrganisations(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getAllOrganisations(page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Get('professionals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all professionals' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Professionals retrieved successfully' })
  async getAllProfessionals(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getAllProfessionals(page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all jobs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  async getAllJobs(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getAllJobs(page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Put('users/:userId/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User activated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async activateUser(@Request() req, @Param('userId') userId: string) {
    return this.adminService.activateUser(userId);
  }

  @Put('users/:userId/suspend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User suspended successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async suspendUser(@Request() req, @Param('userId') userId: string) {
    return this.adminService.suspendUser(userId);
  }

  @Put('organisations/:orgId/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve organisation verification' })
  @ApiParam({ name: 'orgId', description: 'Organisation ID' })
  @ApiResponse({ status: 200, description: 'Organisation verified successfully' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async approveOrganisationVerification(@Request() req, @Param('orgId') orgId: string) {
    return this.adminService.approveOrganisationVerification(orgId, req.user.userId);
  }

  @Put('professionals/:profId/verify/:type/:verificationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve professional verification' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiParam({ name: 'type', enum: ['identity', 'education', 'experience'] })
  @ApiParam({ name: 'verificationId', description: 'Verification ID' })
  @ApiResponse({ status: 200, description: 'Verification approved successfully' })
  async approveProfessionalVerification(
    @Request() req,
    @Param('profId') profId: string,
    @Param('type') type: 'identity' | 'education' | 'experience',
    @Param('verificationId') verificationId: string,
  ) {
    return this.adminService.approveProfessionalVerification(profId, type, verificationId, req.user.userId);
  }
}


