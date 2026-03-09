import { IsString, IsBoolean, IsInt, Min } from 'class-validator';

/** Single field in a verification requirement: name, whether it's required, and order of asking. */
export class VerificationFieldDto {
  @IsString()
  field: string;

  @IsBoolean()
  required: boolean;

  @IsInt()
  @Min(1)
  order: number;
}

export type VerificationFieldEntry = {
  field: string;
  required: boolean;
  order: number;
};
