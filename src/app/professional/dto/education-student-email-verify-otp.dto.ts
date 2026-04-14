import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, Length, MaxLength } from 'class-validator';

export class EducationStudentEmailVerifyOtpDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}
