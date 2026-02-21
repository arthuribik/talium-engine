import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateVerificationStatusDto {
  @ApiProperty({ enum: ['verified', 'rejected'], default: 'verified' })
  @IsEnum(['verified', 'rejected'])
  @IsOptional()
  status?: 'verified' | 'rejected' = 'verified';
}
