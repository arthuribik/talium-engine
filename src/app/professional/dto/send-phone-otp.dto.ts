import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';

export class SendPhoneOtpDto {
  @ApiProperty({
    example: '+2348012345678',
    description: 'Full phone number in E.164 format (country code + national digits)',
  })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneE164 must be a valid E.164 number (e.g. +2348012345678)',
  })
  phoneE164!: string;

  @ApiProperty({ enum: ['sms', 'email'] })
  @IsEnum(['sms', 'email'] as const)
  channel!: 'sms' | 'email';
}
