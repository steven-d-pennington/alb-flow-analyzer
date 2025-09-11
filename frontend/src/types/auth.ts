export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface SessionData {
  credentials: AWSCredentials;
  createdAt: Date;
  expiresAt: Date;
}

export interface CredentialValidationResult {
  isValid: boolean;
  error?: string;
  sessionToken?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  credentials: AWSCredentials | null;
  sessionToken: string | null;
  loading: boolean;
  error: string | null;
}