export class RegisterDto {
  email: string;
  password: string;
  fullName: string;
  role?: 'ADMIN' | 'AGENT' | 'CLINIC' | 'PATIENT';

  // Required only for role: PATIENT
  dob?: string;
  insuranceProvider?: string;
  memberId?: string;
}

export class LoginDto {
  email: string;
  password: string;
}
