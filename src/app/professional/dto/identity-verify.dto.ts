import { IsString, IsNotEmpty, IsEnum, IsDateString, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class LivenessCheckDataDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  status: string;
}

export class IdentityVerifyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nationality: string;

  @ApiProperty({ enum: ['national_id', 'passport', 'drivers_license', 'voters_card'] })
  @IsEnum(['national_id', 'passport', 'drivers_license', 'voters_card'])
  @IsNotEmpty()
  idType: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  idNumber: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({ type: LivenessCheckDataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => LivenessCheckDataDto)
  livenessCheckData: LivenessCheckDataDto;
}

