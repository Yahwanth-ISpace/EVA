export class CreateOfficeDto {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  code: string;
  providerId: string;
}
