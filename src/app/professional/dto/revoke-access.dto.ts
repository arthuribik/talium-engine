import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeAccessDto {
  @ApiProperty({ required: false, description: 'Reason for revoking access' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
