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

export interface AuthenticationService {
  validateCredentials(credentials: AWSCredentials): Promise<boolean>;
  storeCredentials(credentials: AWSCredentials): Promise<string>; // returns session token
  getCredentials(sessionToken: string): Promise<AWSCredentials>;
  revokeSession(sessionToken: string): Promise<void>;
}