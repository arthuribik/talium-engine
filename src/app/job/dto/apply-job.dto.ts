import { IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyJobDto {
  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  applicationData?: any;
}

