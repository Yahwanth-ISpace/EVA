import { IsString, IsBoolean, IsInt, Min, IsOptional } from 'class-validator';

/** Single field in a verification requirement: name, whether it's required, order of asking, and optional exact question to ask. */
export class VerificationFieldDto {
  @IsString()
  field: string;

  @IsBoolean()
  required: boolean;

  @IsInt()
  @Min(1)
  order: number;

  /** When set, EVA asks this exact question instead of generating one from the field name. */
  @IsOptional()
  @IsString()
  question?: string;
}

export type VerificationFieldEntry = {
  field: string;
  required: boolean;
  order: number;
  /** When set, use this exact question when asking for the field; otherwise use field-based phrasing. */
  question?: string;
};
