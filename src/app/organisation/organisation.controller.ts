import {
  Controller,
  Put,
  Patch,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
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
import { OrganisationService } from './organisation.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';
import { KybIncorporationDto } from './dto/kyb-incorporation.dto';
import { UpdateOrganisationProfileDto } from './dto/update-profile.dto';
import { CreateJobDto } from '../job/dto/create-job.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { InitiateWalletFundDto } from './dto/initiate-wallet-fund.dto';
import { ScoutSearchDto } from './dto/scout-search.dto';
import { SendScoutRequestDto } from './dto/send-scout-request.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  CreateKeyEmployeeDto,
  UpdateKeyEmployeeDto,
  ReorderKeyEmployeesDto,
} from './dto/key-employee.dto';
import {
  CreateOrganisationCustomRoleDto,
  UpdateOrganisationCustomRoleDto,
} from './dto/organisation-custom-role.dto';

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

  @Post('upload-logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload organisation logo (image → S3)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Logo uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  async uploadOrganisationLogo(
    @Request() req,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('No file uploaded');
    }
    return this.organisationService.uploadOrganisationLogo(req.user.userId, {
      buffer: file.buffer,
      originalname: file.originalname ?? 'logo',
      mimetype: file.mimetype,
    });
  }

  @Delete('logo')
  @ApiOperation({ summary: 'Remove organisation logo' })
  @ApiResponse({ status: 200, description: 'Logo cleared' })
  async deleteOrganisationLogo(@Request() req) {
    return this.organisationService.deleteOrganisationLogo(req.user.userId);
  }

  @Get('settings/roles')
  @ApiOperation({
    summary: 'List organisation roles (system + custom) for Settings → Roles',
  })
  @ApiResponse({ status: 200, description: 'Roles retrieved' })
  async getSettingsRoles(@Request() req) {
    return this.organisationService.getSettingsRoles(req.user.userId);
  }

  @Post('settings/roles')
  @ApiOperation({ summary: 'Create a custom organisation role' })
  @ApiResponse({ status: 201, description: 'Role created' })
  async createOrganisationCustomRole(
    @Request() req,
    @Body() dto: CreateOrganisationCustomRoleDto,
  ) {
    return this.organisationService.createOrganisationCustomRole(
      req.user.userId,
      dto,
    );
  }

  @Put('settings/roles/:roleId')
  @ApiOperation({ summary: 'Update a custom organisation role' })
  @ApiParam({ name: 'roleId', description: 'Custom role id (cuid)' })
  async updateOrganisationCustomRole(
    @Request() req,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateOrganisationCustomRoleDto,
  ) {
    return this.organisationService.updateOrganisationCustomRole(
      req.user.userId,
      roleId,
      dto,
    );
  }

  @Delete('settings/roles/:roleId')
  @ApiOperation({ summary: 'Delete a custom organisation role' })
  @ApiParam({ name: 'roleId', description: 'Custom role id (cuid)' })
  async deleteOrganisationCustomRole(
    @Request() req,
    @Param('roleId') roleId: string,
  ) {
    return this.organisationService.deleteOrganisationCustomRole(
      req.user.userId,
      roleId,
    );
  }

  @Get('settings/activity')
  @ApiOperation({
    summary: 'Organisation activity log (Settings → Activity Log)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max 100',
    example: 50,
  })
  @ApiResponse({ status: 200, description: 'Activity entries retrieved' })
  async getSettingsActivity(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 50;
    return this.organisationService.getSettingsActivityLog(req.user.userId, {
      page: Number.isFinite(p) ? p : 1,
      limit: Number.isFinite(l) ? l : 50,
    });
  }

  @Get('settings/integrations')
  @ApiOperation({ summary: 'Organisation integrations catalog and connection state' })
  @ApiResponse({ status: 200, description: 'Sections with items and connected flags' })
  async getSettingsIntegrations(@Request() req) {
    return this.organisationService.getSettingsIntegrations(req.user.userId);
  }

  @Post('settings/integrations/:provider/connect')
  @ApiOperation({
    summary:
      'Mark an integration as connected (OAuth placeholder — stores state only)',
  })
  @ApiParam({
    name: 'provider',
    description:
      'google_calendar | calendly | microsoft_teams | zoom | slack | sap_successfactors | workday',
  })
  async connectIntegration(
    @Request() req,
    @Param('provider') provider: string,
  ) {
    return this.organisationService.connectIntegration(
      req.user.userId,
      provider,
    );
  }

  @Delete('settings/integrations/:provider')
  @ApiOperation({ summary: 'Disconnect an integration' })
  @ApiParam({ name: 'provider', description: 'Same slugs as connect' })
  async disconnectIntegration(
    @Request() req,
    @Param('provider') provider: string,
  ) {
    return this.organisationService.disconnectIntegration(
      req.user.userId,
      provider,
    );
  }

  @Post('verification/kyb-incorporation')
  @ApiOperation({
    summary: 'Submit KYB incorporation details (moves organisation to under review)',
  })
  @ApiResponse({ status: 200, description: 'KYB details submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or already verified' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async submitKybIncorporation(
    @Request() req,
    @Body() dto: KybIncorporationDto,
  ) {
    return this.organisationService.submitKybIncorporationDetails(
      req.user.userId,
      dto,
    );
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get organisation dashboard statistics' })
  @ApiQuery({ name: 'country', required: false, type: String, description: 'Filter by job location country' })
  @ApiQuery({ name: 'workMode', required: false, type: String, description: 'Filter by work mode (remote, hybrid, on_site, global_remote)' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by job status (draft, published, paused, closed)' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getDashboardStats(
    @Request() req,
    @Query('country') country?: string,
    @Query('workMode') workMode?: string,
    @Query('status') status?: string,
  ) {
    const filters = [country, workMode, status].some(Boolean)
      ? { country, workMode, status }
      : undefined;
    return this.organisationService.getDashboardStats(req.user.userId, filters);
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

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get a single job by ID (full details)' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobById(@Request() req, @Param('jobId') jobId: string) {
    return this.organisationService.getJobById(req.user.userId, jobId);
  }

  @Post('jobs')
  @ApiOperation({ summary: 'Create a job (Organisation)' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async createJob(@Request() req, @Body() createJobDto: CreateJobDto) {
    return this.organisationService.createJob(req.user.userId, createJobDto);
  }

  @Put('jobs/:jobId')
  @ApiOperation({ summary: 'Update a job (Organisation)' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async updateJob(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body() updateDto: CreateJobDto,
  ) {
    return this.organisationService.updateJob(req.user.userId, jobId, updateDto);
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
    @Body() body: { status: string; reason?: string },
  ) {
    return this.organisationService.updateApplicationStatus(
      req.user.userId,
      applicationId,
      body.status,
      body.reason,
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

  @Post('professionals/scout-search')
  @ApiOperation({ summary: 'Start direct scout: search professionals by job criteria' })
  @ApiResponse({ status: 200, description: 'Scout search results (professionals list)' })
  async scoutSearch(@Request() req, @Body() body: ScoutSearchDto) {
    return this.organisationService.scoutSearch(req.user.userId, {
      jobTitle: body.jobTitle,
      searchType: body.searchType,
      location: body.location,
      domicile: body.domicile,
      workMode: body.workMode,
      employmentType: body.employmentType,
      currency: body.currency,
      salaryMin: body.salaryMin,
      salaryMax: body.salaryMax,
      benefits: body.benefits,
      description: body.description,
      salaryPeriod: body.salaryPeriod,
      name: body.name,
    });
  }

  @Get('professionals/scouts')
  @ApiOperation({ summary: 'List saved direct scout searches for this organisation' })
  @ApiResponse({ status: 200, description: 'Scout lists' })
  async listTalentScouts(@Request() req) {
    return this.organisationService.listTalentScouts(req.user.userId);
  }

  @Get('professionals/scouts/:scoutId')
  @ApiOperation({ summary: 'Get a saved scout list with matched professionals' })
  @ApiParam({ name: 'scoutId', description: 'Talent scout list id' })
  @ApiResponse({ status: 200, description: 'Scout detail and professionals' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getTalentScoutDetail(@Request() req, @Param('scoutId') scoutId: string) {
    return this.organisationService.getTalentScoutDetail(req.user.userId, scoutId);
  }

  @Patch('professionals/scouts/:scoutId')
  @ApiOperation({ summary: 'Re-run scout search criteria and update saved list' })
  @ApiParam({ name: 'scoutId', description: 'Talent scout list id' })
  @ApiResponse({ status: 200, description: 'Updated scout results' })
  async updateTalentScout(
    @Request() req,
    @Param('scoutId') scoutId: string,
    @Body() body: ScoutSearchDto,
  ) {
    return this.organisationService.updateTalentScout(req.user.userId, scoutId, {
      jobTitle: body.jobTitle,
      searchType: body.searchType,
      location: body.location,
      domicile: body.domicile,
      workMode: body.workMode,
      employmentType: body.employmentType,
      currency: body.currency,
      salaryMin: body.salaryMin,
      salaryMax: body.salaryMax,
      benefits: body.benefits,
      description: body.description,
      salaryPeriod: body.salaryPeriod,
      name: body.name,
    });
  }

  @Delete('professionals/scouts/:scoutId')
  @ApiOperation({ summary: 'Delete a saved scout list' })
  @ApiParam({ name: 'scoutId', description: 'Talent scout list id' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  async deleteTalentScout(@Request() req, @Param('scoutId') scoutId: string) {
    return this.organisationService.deleteTalentScout(req.user.userId, scoutId);
  }

  @Get('professionals')
  @ApiOperation({ summary: 'Search and get professionals with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or email' })
  @ApiQuery({ name: 'jobTitle', required: false, type: String, description: 'Filter by job title' })
  @ApiQuery({ name: 'searchType', required: false, type: String, description: 'strict, partial, or fuzzy for job title match' })
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
    @Query('searchType') searchType?: 'strict' | 'partial' | 'fuzzy',
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
        searchType: searchType || 'partial',
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

  @Get('professionals/:professionalId')
  @ApiOperation({ summary: 'Get professional profile by ID (for organisation view)' })
  @ApiParam({ name: 'professionalId', description: 'Professional ID' })
  @ApiResponse({ status: 200, description: 'Professional profile' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async getProfessionalById(
    @Request() req,
    @Param('professionalId') professionalId: string,
  ) {
    return this.organisationService.getProfessionalByIdForOrganisation(
      req.user.userId,
      professionalId,
    );
  }

  @Post('professionals/:professionalId/hire')
  @ApiOperation({ summary: 'Send scout request (hire) to a professional' })
  @ApiParam({ name: 'professionalId', description: 'Professional ID' })
  @ApiQuery({
    name: 'jobId',
    required: false,
    type: String,
    description: 'Optional job ID if hiring for a specific job',
  })
  @ApiResponse({ status: 200, description: 'Scout request sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request (missing required fields)' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async hireProfessional(
    @Request() req,
    @Param('professionalId') professionalId: string,
    @Body() body: SendScoutRequestDto,
    @Query('jobId') jobId?: string,
  ) {
    return this.organisationService.hireProfessional(req.user.userId, professionalId, jobId, {
      jobTitle: body.jobTitle,
      employmentType: body.employmentType,
      workMode: body.workMode,
      location: body.location,
      description: body.description,
      message: body.message,
    });
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

  @Get('team/stats')
  @ApiOperation({ summary: 'Get team statistics' })
  @ApiResponse({ status: 200, description: 'Team stats retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getTeamStats(@Request() req) {
    return this.organisationService.getTeamStats(req.user.userId);
  }

  @Get('team/members')
  @ApiOperation({ summary: 'Get team members list' })
  @ApiResponse({ status: 200, description: 'Team members retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getTeamMembers(@Request() req) {
    return this.organisationService.getTeamMembers(req.user.userId);
  }

  @Post('team/invite')
  @ApiOperation({ summary: 'Invite a team member' })
  @ApiResponse({ status: 200, description: 'Invitation sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or already member/invited' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async inviteMember(@Request() req, @Body() body: InviteMemberDto) {
    return this.organisationService.inviteMember(req.user.userId, {
      email: body.email,
      role: body.role,
    });
  }

  @Post('team/invitations')
  @ApiOperation({ summary: 'Invite a team member' })
  @ApiResponse({ status: 200, description: 'Invitation sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or already member/invited' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async createTeamInvitation(@Request() req, @Body() body: InviteMemberDto) {
    return this.organisationService.inviteMember(req.user.userId, {
      email: body.email,
      role: body.role,
    });
  }

  @Put('team/members/:memberId/role')
  @ApiOperation({ summary: 'Update a member role' })
  @ApiParam({ name: 'memberId', description: 'Organisation member ID' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async updateMemberRole(
    @Request() req,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ) {
    return this.organisationService.updateMemberRole(req.user.userId, memberId, body.role);
  }

  @Delete('team/members/:memberId')
  @ApiOperation({ summary: 'Remove a team member' })
  @ApiParam({ name: 'memberId', description: 'Organisation member ID' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async removeMember(@Request() req, @Param('memberId') memberId: string) {
    return this.organisationService.removeMember(req.user.userId, memberId);
  }

  @Get('employees')
  @ApiOperation({ summary: 'Get key employees & associates' })
  @ApiResponse({ status: 200, description: 'Key employees retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async getKeyEmployees(@Request() req) {
    return this.organisationService.getKeyEmployees(req.user.userId);
  }

  @Post('employees')
  @ApiOperation({ summary: 'Add a key employee or associate' })
  @ApiResponse({ status: 201, description: 'Key employee added successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async createKeyEmployee(@Request() req, @Body() body: CreateKeyEmployeeDto) {
    return this.organisationService.createKeyEmployee(req.user.userId, body);
  }

  @Put('employees/reorder')
  @ApiOperation({ summary: 'Reorder key employees / associates' })
  @ApiResponse({ status: 200, description: 'Order updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid id list' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async reorderKeyEmployees(
    @Request() req,
    @Body() body: ReorderKeyEmployeesDto,
  ) {
    return this.organisationService.reorderKeyEmployees(
      req.user.userId,
      body.employeeIds,
    );
  }

  @Put('employees/:employeeId')
  @ApiOperation({ summary: 'Update a key employee or associate' })
  @ApiParam({ name: 'employeeId', description: 'Key employee ID' })
  @ApiResponse({ status: 200, description: 'Key employee updated successfully' })
  @ApiResponse({ status: 404, description: 'Key employee not found' })
  async updateKeyEmployee(
    @Request() req,
    @Param('employeeId') employeeId: string,
    @Body() body: UpdateKeyEmployeeDto,
  ) {
    return this.organisationService.updateKeyEmployee(req.user.userId, employeeId, body);
  }

  @Delete('employees/:employeeId')
  @ApiOperation({ summary: 'Remove a key employee or associate' })
  @ApiParam({ name: 'employeeId', description: 'Key employee ID' })
  @ApiResponse({ status: 200, description: 'Key employee removed successfully' })
  @ApiResponse({ status: 404, description: 'Key employee not found' })
  async deleteKeyEmployee(@Request() req, @Param('employeeId') employeeId: string) {
    return this.organisationService.deleteKeyEmployee(req.user.userId, employeeId);
  }

  @Get('billing')
  @ApiOperation({ summary: 'Get organisation billing information' })
  @ApiResponse({
    status: 200,
    description: 'Billing information retrieved successfully',
  })
  async getBilling(@Request() req, @Query('period') period?: string) {
    return this.organisationService.getBilling(req.user.userId, period);
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

  @Post('billing/wallet/initiate')
  @ApiOperation({ summary: 'Initiate wallet (TTK) top-up payment' })
  @ApiResponse({ status: 200, description: 'Top-up initiated' })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
  async initiateWalletFund(
    @Request() req,
    @Body() body: InitiateWalletFundDto,
  ) {
    return this.organisationService.initiateWalletFund(req.user.userId, body);
  }

  @Post('billing/payment/:reference/confirm')
  @ApiOperation({ summary: 'Confirm bank transfer payment has been made' })
  @ApiResponse({ status: 200, description: 'Payment submitted for verification' })
  @ApiResponse({ status: 404, description: 'Pending payment not found' })
  async confirmBankTransferPayment(
    @Request() req,
    @Param('reference') reference: string,
  ) {
    return this.organisationService.confirmBankTransferPayment(
      req.user.userId,
      reference,
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

  @Get('billing/invoices')
  @ApiOperation({ summary: 'List organisation invoices (hosted PDFs when available)' })
  @ApiResponse({ status: 200, description: 'Invoices retrieved successfully' })
  async getBillingInvoices(@Request() req) {
    return this.organisationService.getBillingInvoices(req.user.userId);
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
