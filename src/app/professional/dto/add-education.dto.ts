import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ProgramProgressionItemDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  currentlyActive?: boolean;
}

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
  @ApiProperty({
    enum: [
      'high_school',
      'associate',
      'bachelor',
      'master',
      'doctorate',
      'certificate',
      'diploma',
    ],
  })
  @IsEnum([
    'high_school',
    'associate',
    'bachelor',
    'master',
    'doctorate',
    'certificate',
    'diploma',
  ])
  @IsNotEmpty()
  levelOfEducation: string;

  @ApiProperty({ required: false, enum: ['undergraduate', 'postgraduate'], description: 'Program level' })
  @IsString()
  @IsOptional()
  programLevel?: string;

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
  @IsString()
  @IsOptional()
  schoolType?: string;

  @ApiProperty({ required: false, description: 'Sector or focus area of the institution' })
  @IsString()
  @IsOptional()
  institutionIndustry?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  costOfEducation?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ required: false, description: 'e.g. one_time, monthly, annually' })
  @IsString()
  @IsOptional()
  costFrequency?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pendingLoanAmount?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  loanCurrency?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  loanRepaymentFrequency?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  scholarshipsAndAid?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  programDescription?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  academicResponsibilities?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  academicAchievements?: string;

  @ApiProperty({ type: [ProgramProgressionItemDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProgramProgressionItemDto)
  programProgression?: ProgramProgressionItemDto[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  activitiesSocieties?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  associatedSkills?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  supportingMediaUrl?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  verificationMethod?: string;

  @ApiProperty({ type: [VerificationDocumentDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => VerificationDocumentDto)
  verificationDocuments?: VerificationDocumentDto[];
}
