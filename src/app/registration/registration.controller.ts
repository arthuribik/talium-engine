import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RegistrationService } from './registration.service';
import {
  Step1Dto,
  Step2Dto,
  Step3Dto,
  Step4Dto,
  Step5Dto,
  Step7Dto,
  Step8Dto,
} from '../auth/dto/registration-step.dto';
import { RegistrationStepDto } from './dto/registration-step.dto';

@ApiTags('Registration')
@Controller('v1/registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('step/1')
  @ApiOperation({ summary: 'Save step 1 data (Registration Status)' })
  @ApiResponse({ status: 201, description: 'Step 1 data saved successfully' })
  async saveStep1(@Body() data: Step1Dto, @Query('id') id?: string) {
    return this.registrationService.saveStep1(id || null, data);
  }

  @Post('step/2')
  @ApiOperation({ summary: 'Save step 2 data (Incorporation Details)' })
  @ApiQuery({ name: 'id', required: true, description: 'Registration ID' })
  @ApiResponse({ status: 201, description: 'Step 2 data saved successfully' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async saveStep2(@Body() data: Step2Dto, @Query('id') id: string) {
    if (!id) {
      throw new BadRequestException('Registration ID is required');
    }
    return this.registrationService.saveStep2(id, data);
  }

  @Post('step/3')
  @ApiOperation({ summary: 'Save step 3 data (Category)' })
  @ApiQuery({ name: 'id', required: true, description: 'Registration ID' })
  @ApiResponse({ status: 201, description: 'Step 3 data saved successfully' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async saveStep3(@Body() data: Step3Dto, @Query('id') id: string) {
    if (!id) {
      throw new BadRequestException('Registration ID is required');
    }
    return this.registrationService.saveStep3(id, data);
  }

  @Post('step/4')
  @ApiOperation({ summary: 'Save step 4 data (Description)' })
  @ApiQuery({ name: 'id', required: true, description: 'Registration ID' })
  @ApiResponse({ status: 201, description: 'Step 4 data saved successfully' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async saveStep4(@Body() data: Step4Dto, @Query('id') id: string) {
    if (!id) {
      throw new BadRequestException('Registration ID is required');
    }
    return this.registrationService.saveStep4(id, data);
  }

  @Post('step/5')
  @ApiOperation({ summary: 'Save step 5 data (Email Verification)' })
  @ApiQuery({ name: 'id', required: true, description: 'Registration ID' })
  @ApiResponse({ status: 201, description: 'Step 5 data saved successfully' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async saveStep5(@Body() data: Step5Dto, @Query('id') id: string) {
    if (!id) {
      throw new BadRequestException('Registration ID is required');
    }
    return this.registrationService.saveStep5(id, data);
  }

  @Post('step/7')
  @ApiOperation({
    summary: 'Save step 7 data (Organisation Details for non-registered)',
  })
  @ApiResponse({ status: 201, description: 'Step 7 data saved successfully' })
  async saveStep7(@Body() data: Step7Dto, @Query('id') id?: string) {
    return this.registrationService.saveStep7(id || null, data);
  }

  @Post('step/8')
  @ApiOperation({ summary: 'Save step 8 data (Category for non-registered)' })
  @ApiQuery({ name: 'id', required: true, description: 'Registration ID' })
  @ApiResponse({ status: 201, description: 'Step 8 data saved successfully' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async saveStep8(@Body() data: Step8Dto, @Query('id') id: string) {
    if (!id) {
      throw new BadRequestException('Registration ID is required');
    }
    return this.registrationService.saveStep8(id, data);
  }

  @Post('step')
  @ApiOperation({
    summary: 'Save registration step data (unified endpoint)',
    description:
      'Single endpoint to save data for any registration step. The step number determines which fields are required. Steps 1 and 7 can create new registrations (ID optional), while other steps require an existing registration ID.',
  })
  @ApiResponse({ status: 201, description: 'Step data saved successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid step number or missing required fields',
  })
  @ApiResponse({
    status: 404,
    description: 'Registration not found (for steps requiring ID)',
  })
  async saveStep(@Body() dto: RegistrationStepDto) {
    return this.registrationService.saveStep(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get registration progress' })
  @ApiParam({ name: 'id', description: 'Registration ID' })
  @ApiResponse({
    status: 200,
    description: 'Registration data retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async getRegistration(@Param('id') id: string) {
    return this.registrationService.getRegistration(id);
  }
}
