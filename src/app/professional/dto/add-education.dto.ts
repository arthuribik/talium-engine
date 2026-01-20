import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class VerificationDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName: string;
}

export class AddEducationDto {
  @ApiProperty({ enum: ['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma'] })
  @IsEnum(['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma'])
  @IsNotEmpty()
  levelOfEducation: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  institutionName: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  degreeType?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fieldOfStudy: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  currentlyAttending: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  grade?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  costOfEducation?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ type: [VerificationDocumentDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => VerificationDocumentDto)
  verificationDocuments?: VerificationDocumentDto[];
}

