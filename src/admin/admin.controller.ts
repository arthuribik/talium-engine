import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../utility/jwt/jwt-auth.guard';
import { AdminService } from './admin.service';
import { InviteAdminDto } from './dto/invite-admin.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { AuthService } from '../app/auth/auth.service';
import { CreateBillingPlanDto } from './dto/create-billing-plan.dto';
import { UpdateBillingPlanDto } from './dto/update-billing-plan.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly authService: AuthService,
  ) {}

  @Post('create-super-admin')
  @ApiOperation({
    summary: 'Create the first super admin (only if no super admin exists)',
  })
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
  @ApiResponse({
    status: 201,
    description: 'Admin invitation sent successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only super admins can invite',
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async inviteAdmin(@Request() req, @Body() inviteAdminDto: InviteAdminDto) {
    return this.adminService.inviteAdmin(req.user.userId, inviteAdminDto);
  }

  @Post('onboarding/complete')
  @ApiOperation({ summary: 'Complete admin onboarding' })
  @ApiResponse({
    status: 200,
    description: 'Admin onboarding completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or passwords do not match',
  })
  async completeOnboarding(
    @Body() completeOnboardingDto: CompleteOnboardingDto,
  ) {
    return this.adminService.completeOnboarding(completeOnboardingDto);
  }

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
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
  async getAllUsers(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllUsers(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('organisations')
  @ApiOperation({ summary: 'Get all organisations (Public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Organisations retrieved successfully',
  })
  async getAllOrganisations(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllOrganisations(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('professionals')
  @ApiOperation({ summary: 'Get all professionals (Public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Professionals retrieved successfully',
  })
  async getAllProfessionals(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllProfessionals(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('professionals/:id')
  @ApiOperation({ summary: 'Get professional by ID (Public)' })
  @ApiParam({ name: 'id', description: 'Professional ID' })
  @ApiResponse({
    status: 200,
    description: 'Professional retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async getProfessionalById(@Param('id') id: string) {
    return this.adminService.getProfessionalById(id);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Get all jobs (Public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  async getAllJobs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllJobs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status: all, success, pending, failed',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  async getAllTransactions(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllTransactions(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      status || 'all',
    );
  }

  @Get('transactions/:transactionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction details' })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransaction(
    @Request() req,
    @Param('transactionId') transactionId: string,
  ) {
    return this.adminService.getTransaction(transactionId);
  }

  @Put('transactions/:transactionId/validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually validate a pending payment' })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Payment validated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async validatePayment(
    @Request() req,
    @Param('transactionId') transactionId: string,
    @Body() body: { reason: string; proofOfPayment?: string },
  ) {
    return this.adminService.validatePayment(
      req.user.userId,
      transactionId,
      body.reason,
      body.proofOfPayment,
    );
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
  @ApiResponse({
    status: 200,
    description: 'Organisation verified successfully',
  })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async approveOrganisationVerification(
    @Request() req,
    @Param('orgId') orgId: string,
  ) {
    return this.adminService.approveOrganisationVerification(
      orgId,
      req.user.userId,
    );
  }

  @Put('organisations/:orgId/verification-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organisation verification status' })
  @ApiParam({ name: 'orgId', description: 'Organisation ID' })
  @ApiResponse({
    status: 200,
    description: 'Verification status updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async updateOrganisationVerificationStatus(
    @Request() req,
    @Param('orgId') orgId: string,
    @Body() body: { status: string },
  ) {
    return this.adminService.updateOrganisationVerificationStatus(
      orgId,
      body.status,
      req.user.userId,
    );
  }

  @Put('professionals/:profId/verify/:type/:verificationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject professional verification' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiParam({ name: 'type', enum: ['identity', 'education', 'experience', 'project'] })
  @ApiParam({ name: 'verificationId', description: 'Verification ID' })
  @ApiResponse({
    status: 200,
    description: 'Verification status updated successfully',
  })
  async approveProfessionalVerification(
    @Request() req,
    @Param('profId') profId: string,
    @Param('type') type: 'identity' | 'education' | 'experience' | 'project',
    @Param('verificationId') verificationId: string,
    @Body() body: { status?: 'verified' | 'rejected' },
  ) {
    return this.adminService.approveProfessionalVerification(
      profId,
      type,
      verificationId,
      req.user.userId,
      body?.status ?? 'verified',
    );
  }

  @Put('professionals/:profId/verify-location/:locationIndex')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject a saved location row (JSON locations array)' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiParam({ name: 'locationIndex', description: 'Zero-based index in the locations array' })
  @ApiResponse({ status: 200, description: 'Location verification status updated' })
  async approveProfessionalLocation(
    @Request() req,
    @Param('profId') profId: string,
    @Param('locationIndex', ParseIntPipe) locationIndex: number,
    @Body() body: { status?: 'verified' | 'rejected' },
  ) {
    return this.adminService.approveProfessionalLocation(
      profId,
      locationIndex,
      req.user.userId,
      body?.status ?? 'verified',
    );
  }

  @Put('professionals/:profId/verification-complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark professional as fully verified when all sections are done' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({
    status: 200,
    description: 'Professional marked as fully verified',
  })
  @ApiResponse({
    status: 400,
    description: 'Not all sections verified or rejected',
  })
  async markProfessionalVerificationComplete(
    @Request() req,
    @Param('profId') profId: string,
  ) {
    return this.adminService.markProfessionalVerificationComplete(
      profId,
      req.user.userId,
    );
  }

  @Get('registrations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all organisation registrations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Registrations retrieved successfully',
  })
  async getAllRegistrations(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 20;
    const allRegistrations = await this.authService.getAllRegistrations();

    // Paginate
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;
    const paginatedRegistrations = allRegistrations.slice(start, end);
    const total = allRegistrations.length;

    return {
      status: 'success',
      data: {
        registrations: paginatedRegistrations,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };
  }

  @Get('registrations/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get registration details' })
  @ApiParam({ name: 'id', description: 'Registration ID' })
  @ApiResponse({
    status: 200,
    description: 'Registration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async getRegistration(@Request() req, @Param('id') id: string) {
    return {
      status: 'success',
      data: await this.authService.getRegistrationForAdmin(id),
    };
  }

  @Post('jobs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a job (Admin)' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async createJob(
    @Request() req,
    @Body() createJobDto: any,
    @Query('organisationId') organisationId?: string,
  ) {
    return this.adminService.createJob(
      req.user.userId,
      organisationId,
      createJobDto,
    );
  }

  @Put('jobs/:jobId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update job status (Admin)' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job status updated successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async updateJobStatus(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body() body: { status: string },
  ) {
    return this.adminService.updateJobStatus(jobId, body.status);
  }

  @Get('billing/plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription plans' })
  @ApiQuery({
    name: 'entityType',
    required: false,
    enum: ['professional', 'organisation'],
  })
  @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
  async getSubscriptionPlans(
    @Request() req,
    @Query('entityType') entityType?: 'professional' | 'organisation',
  ) {
    return this.adminService.getSubscriptionPlans(entityType);
  }

  @Post('billing/plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a subscription billing plan' })
  @ApiResponse({ status: 201, description: 'Plan created' })
  async createBillingPlan(
    @Request() req,
    @Body() body: CreateBillingPlanDto,
  ) {
    return this.adminService.createBillingPlan(body);
  }

  @Put('billing/plans/:planRecordId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a subscription billing plan' })
  @ApiParam({ name: 'planRecordId', description: 'Plan record id (cuid)' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  async updateBillingPlan(
    @Request() req,
    @Param('planRecordId') planRecordId: string,
    @Body() body: UpdateBillingPlanDto,
  ) {
    return this.adminService.updateBillingPlan(planRecordId, body);
  }
}
