import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, IsObject, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

class SocialMediaDto {
  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  linkedin?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  twitter?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  facebook?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  instagram?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  github?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  portfolio?: string;
}

export class UpdateProfessionalProfileDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({ type: SocialMediaDto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMediaDto)
  socialMedia?: SocialMediaDto;
}

