import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  NotFoundException,
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
import { JwtOptionalAuthGuard } from '../../utility/jwt/jwt-optional-auth.guard';
import { JobService } from './job.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ApplyJobDto } from './dto/apply-job.dto';

@ApiTags('Jobs')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Post('draft')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a job draft' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Organisation not found' })
  async createJob(
    @Request() req,
    @Body() createJobDto: CreateJobDto,
    @Query('organisationId') organisationId?: string,
  ) {
    // Simple: get organisationId from query param, or fetch from database using userId
    const orgId =
      organisationId ||
      (await this.jobService.getOrganisationIdByUserId(req.user.userId));

    if (!orgId) {
      throw new NotFoundException(
        'Organisation not found. Please complete your organisation setup.',
      );
    }

    return this.jobService.createJob(req.user.userId, orgId, createJobDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs' })
  @ApiQuery({
    name: 'organisationId',
    required: false,
    description: 'Filter by organisation ID',
  })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  async getJobs(@Query('organisationId') organisationId?: string) {
    return this.jobService.getJobs(organisationId);
  }

  @Get(':jobId')
  @UseGuards(JwtOptionalAuthGuard)
  @ApiOperation({
    summary: 'Get a specific job',
    description:
      'Accepts requests with or without Authorization. When Bearer token is present and valid, response includes hasApplied for that user. When no token or invalid token, returns job with hasApplied: false.',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiQuery({ name: 'isUniqueView', required: false, type: Boolean, description: 'Whether this is a unique view (tracked by frontend)' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully. Always includes hasApplied (true/false when authenticated, false when not).' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(
    @Param('jobId') jobId: string,
    @Request() req: { user?: { userId: string } },
    @Query('isUniqueView') isUniqueView?: string,
  ) {
    const userId = req?.user?.userId ?? undefined;
    const isUnique = isUniqueView === 'true' || isUniqueView === undefined;
    return this.jobService.getJob(jobId, userId, isUnique);
  }

  @Post(':jobId/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to a job' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({
    status: 201,
    description: 'Application submitted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid application or requirements not met',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async applyToJob(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body() applyJobDto: ApplyJobDto,
  ) {
    return this.jobService.applyToJob(req.user.userId, jobId, applyJobDto);
  }

  @Put(':jobId/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a job' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job published successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async publishJob(@Request() req, @Param('jobId') jobId: string) {
    return this.jobService.publishJob(req.user.userId, jobId);
  }
}
