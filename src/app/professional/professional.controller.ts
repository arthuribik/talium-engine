import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../utility/jwt/jwt-auth.guard';
import { ProfessionalService } from './professional.service';
import { IdentityVerifyDto } from './dto/identity-verify.dto';
import { AddEducationDto } from './dto/add-education.dto';
import { AddExperienceDto } from './dto/add-experience.dto';

@ApiTags('Professionals')
@Controller('professionals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfessionalController {
  constructor(private readonly professionalService: ProfessionalService) {}

  @Post(':profId/identity/verify')
  @ApiOperation({ summary: 'Verify professional identity' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({ status: 200, description: 'Identity verification completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async verifyIdentity(@Request() req, @Param('profId') profId: string, @Body() identityDto: IdentityVerifyDto) {
    return this.professionalService.verifyIdentity(req.user.userId, profId, identityDto);
  }

  @Post(':profId/education')
  @ApiOperation({ summary: 'Add educational information' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({ status: 201, description: 'Education added successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async addEducation(@Request() req, @Param('profId') profId: string, @Body() educationDto: AddEducationDto) {
    return this.professionalService.addEducation(req.user.userId, profId, educationDto);
  }

  @Post(':profId/experience')
  @ApiOperation({ summary: 'Add work experience' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({ status: 201, description: 'Work experience added successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async addExperience(@Request() req, @Param('profId') profId: string, @Body() experienceDto: AddExperienceDto) {
    return this.professionalService.addExperience(req.user.userId, profId, experienceDto);
  }

  @Get(':profId/setup/status')
  @ApiOperation({ summary: 'Get profile completion status' })
  @ApiParam({ name: 'profId', description: 'Professional ID' })
  @ApiResponse({ status: 200, description: 'Profile status retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getSetupStatus(@Request() req, @Param('profId') profId: string) {
    return this.professionalService.getSetupStatus(req.user.userId, profId);
  }
}

