import { Controller, Post, Body, Get, Query, Param, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RegistrationStepDto } from './dto/registration-step-unified.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new professional user' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('createbusiness')
  @ApiOperation({ summary: 'Register a new organisation' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async createBusiness(@Body() createBusinessDto: CreateBusinessDto) {
    return this.authService.createBusiness(createBusinessDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account not verified' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Reset link sent if email exists' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid token or passwords do not match' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email with token (legacy endpoint)' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmailWithToken(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Verify email with code (for registration)',
    description: 'Verify email address using a 6-digit verification code. No authentication required.'
  })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification code' })
  async verifyEmailWithCode(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmailWithCode(verifyEmailDto.email, verifyEmailDto.code);
  }

  @Post('send-verification-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Send verification code to email',
    description: 'Send a 6-digit verification code to the specified email address. No authentication required.'
  })
  @ApiResponse({ status: 200, description: 'Verification code sent successfully' })
  async sendVerificationCode(@Body() body: { email: string }) {
    return this.authService.sendVerificationCode(body.email);
  }

  @Post('registration/step')
  @ApiOperation({ 
    summary: 'Save registration step data (unified endpoint)',
    description: 'Single endpoint to save data for any registration step. The step number determines which fields are required. Steps 1 and 7 can create new registrations (ID optional), while other steps require an existing registration ID.'
  })
  @ApiResponse({ status: 201, description: 'Step data saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid step number or missing required fields' })
  @ApiResponse({ status: 404, description: 'Registration not found (for steps requiring ID)' })
  async saveRegistrationStep(@Body() dto: RegistrationStepDto) {
    return this.authService.saveRegistrationStep(dto);
  }

  @Get('registration/:id')
  @ApiOperation({ summary: 'Get registration progress' })
  @ApiParam({ name: 'id', description: 'Registration ID' })
  @ApiResponse({ status: 200, description: 'Registration data retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  async getRegistration(@Param('id') id: string) {
    return this.authService.getRegistration(id);
  }
}

