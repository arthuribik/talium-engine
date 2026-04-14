import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class EducationStudentEmailSendOtpDto {
  @ApiProperty({ example: 'student@university.edu' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(320)
  email!: string;
}
