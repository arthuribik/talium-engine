import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class VerifyPhoneOtpDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
