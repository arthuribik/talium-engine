import { IsIn, IsString } from 'class-validator';

export const PROFESSIONAL_PROFILE_EDIT_REASONS = [
  'legal_name_change',
  'clerical_error',
  'outdated_information',
  'government_id_reissued',
  'other',
] as const;

export type ProfessionalProfileEditReason = (typeof PROFESSIONAL_PROFILE_EDIT_REASONS)[number];

export class SubmitProfessionalProfileEditRequestDto {
  @IsString()
  fields: string;

  @IsString()
  @IsIn([...PROFESSIONAL_PROFILE_EDIT_REASONS])
  reason: string;
}
