import { IsString, IsOptional, IsNumber, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScoutSearchDto {
  @ApiProperty({ required: false, description: 'Job title / role to scout for' })
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiProperty({ required: false, enum: ['strict', 'partial'], description: 'Strict = exact job title match' })
  @IsString()
  @IsIn(['strict', 'partial'])
  @IsOptional()
  searchType?: 'strict' | 'partial';

  @ApiProperty({ required: false, description: 'Location to scout (e.g. "Global" or country name)' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ required: false, description: 'Where the role would be domiciled (e.g. Lagos, Nigeria)' })
  @IsString()
  @IsOptional()
  domicile?: string;

  @ApiProperty({ required: false, description: 'Work mode (remote, hybrid, on_site, global_remote)' })
  @IsString()
  @IsOptional()
  workMode?: string;

  @ApiProperty({ required: false, description: 'Employment type (full_time, part_time, contract, internship)' })
  @IsString()
  @IsOptional()
  employmentType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  salaryMin?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  salaryMax?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  benefits?: string[];

  @ApiProperty({ required: false, description: 'Job description (for reference / future use)' })
  @IsString()
  @IsOptional()
  description?: string;
}
