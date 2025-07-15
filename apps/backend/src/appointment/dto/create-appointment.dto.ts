export class CreateAppointmentDto {
  payeeId: string;
  providerId: string;
  officeId: string;
  date: string;
  notes?: string;
}
