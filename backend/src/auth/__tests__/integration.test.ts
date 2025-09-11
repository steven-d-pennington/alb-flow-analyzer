import { AuthenticationService } from '../AuthenticationService';
import { AWSCredentials } from '../../types';

describe('Authentication Integration Tests', () => {
  let authService: AuthenticationService;

  beforeEach(() => {
    authService = new AuthenticationService();
  });

  afterEach(() => {
    authService.clearAllSessions();
  });

  it('should integrate with main types module', () => {
    const credentials: AWSCredentials = {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    };

    // Should be able to use AWSCredentials from main types
    expect(credentials.accessKeyId).toBeDefined();
    expect(credentials.secretAccessKey).toBeDefined();
    expect(credentials.region).toBeDefined();
  });

  it('should work with the complete authentication flow', async () => {
    const credentials: AWSCredentials = {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    };

    // This would normally validate against AWS, but we're testing the flow
    // In a real scenario, this would require valid AWS credentials
    
    // Store credentials
    const sessionToken = await authService.storeCredentials(credentials);
    expect(sessionToken).toBeDefined();

    // Retrieve credentials
    const retrievedCredentials = await authService.getCredentials(sessionToken);
    expect(retrievedCredentials).toEqual(credentials);

    // Clean up
    await authService.revokeSession(sessionToken);
    
    // Verify session is gone
    await expect(authService.getCredentials(sessionToken))
      .rejects.toThrow('Invalid session token');
  });
});