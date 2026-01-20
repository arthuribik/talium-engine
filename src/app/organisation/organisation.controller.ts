import { Controller, Put, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../utility/jwt/jwt-auth.guard';
import { OrganisationService } from './organisation.service';
import { OrganisationSetupDto } from './dto/organisation-setup.dto';
import { VerificationRequestDto } from './dto/verification-request.dto';

@ApiTags('Organisations')
@Controller('organisations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganisationController {
  constructor(private readonly organisationService: OrganisationService) {}

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

