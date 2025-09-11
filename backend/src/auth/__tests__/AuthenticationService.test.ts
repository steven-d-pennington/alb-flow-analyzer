import { AuthenticationService } from '../AuthenticationService';
import { AWSCredentials } from '../types';
import { STS } from 'aws-sdk';

// Mock AWS SDK
jest.mock('aws-sdk');

const mockSTS = {
  getCallerIdentity: jest.fn(),
};

(STS as jest.MockedClass<typeof STS>).mockImplementation(() => mockSTS as any);

describe('AuthenticationService', () => {
  let authService: AuthenticationService;
  let validCredentials: AWSCredentials;
  let invalidCredentials: AWSCredentials;

  beforeEach(() => {
    authService = new AuthenticationService();
    
    validCredentials = {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    };

    invalidCredentials = {
      accessKeyId: 'INVALID_KEY',
      secretAccessKey: 'INVALID_SECRET',
      region: 'us-east-1',
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    authService.clearAllSessions();
  });

  describe('validateCredentials', () => {
    it('should return true for valid credentials', async () => {
      mockSTS.getCallerIdentity.mockReturnValue({
        promise: () => Promise.resolve({
          UserId: 'AIDACKCEVSQ6C2EXAMPLE',
          Account: '123456789012',
          Arn: 'arn:aws:iam::123456789012:user/DevAdmin',
        }),
      });

      const result = await authService.validateCredentials(validCredentials);
      expect(result).toBe(true);
      expect(STS).toHaveBeenCalledWith({
        accessKeyId: validCredentials.accessKeyId,
        secretAccessKey: validCredentials.secretAccessKey,
        sessionToken: validCredentials.sessionToken,
        region: validCredentials.region,
      });
    });

    it('should return false for invalid credentials', async () => {
      mockSTS.getCallerIdentity.mockReturnValue({
        promise: () => Promise.reject(new Error('InvalidUserID.NotFound')),
      });

      const result = await authService.validateCredentials(invalidCredentials);
      expect(result).toBe(false);
    });

    it('should handle credentials with session token', async () => {
      const credentialsWithToken = {
        ...validCredentials,
        sessionToken: 'AQoDYXdzEJr...',
      };

      mockSTS.getCallerIdentity.mockReturnValue({
        promise: () => Promise.resolve({
          UserId: 'AIDACKCEVSQ6C2EXAMPLE',
          Account: '123456789012',
          Arn: 'arn:aws:sts::123456789012:assumed-role/S3Access/MySessionName',
        }),
      });

      const result = await authService.validateCredentials(credentialsWithToken);
      expect(result).toBe(true);
      expect(STS).toHaveBeenCalledWith({
        accessKeyId: credentialsWithToken.accessKeyId,
        secretAccessKey: credentialsWithToken.secretAccessKey,
        sessionToken: credentialsWithToken.sessionToken,
        region: credentialsWithToken.region,
      });
    });

    it('should handle network errors gracefully', async () => {
      mockSTS.getCallerIdentity.mockReturnValue({
        promise: () => Promise.reject(new Error('NetworkingError')),
      });

      const result = await authService.validateCredentials(validCredentials);
      expect(result).toBe(false);
    });
  });

  describe('storeCredentials', () => {
    it('should store credentials and return a session token', async () => {
      const sessionToken = await authService.storeCredentials(validCredentials);
      
      expect(sessionToken).toBeDefined();
      expect(typeof sessionToken).toBe('string');
      expect(sessionToken.length).toBe(64); // 32 bytes as hex = 64 characters
      expect(authService.getActiveSessionCount()).toBe(1);
    });

    it('should generate unique session tokens', async () => {
      const token1 = await authService.storeCredentials(validCredentials);
      const token2 = await authService.storeCredentials(validCredentials);
      
      expect(token1).not.toBe(token2);
      expect(authService.getActiveSessionCount()).toBe(2);
    });

    it('should store a copy of credentials to avoid reference issues', async () => {
      const originalCredentials = { ...validCredentials };
      const sessionToken = await authService.storeCredentials(validCredentials);
      
      // Modify original credentials
      validCredentials.accessKeyId = 'MODIFIED';
      
      const retrievedCredentials = await authService.getCredentials(sessionToken);
      expect(retrievedCredentials.accessKeyId).toBe(originalCredentials.accessKeyId);
    });
  });

  describe('getCredentials', () => {
    it('should retrieve stored credentials', async () => {
      const sessionToken = await authService.storeCredentials(validCredentials);
      const retrievedCredentials = await authService.getCredentials(sessionToken);
      
      expect(retrievedCredentials).toEqual(validCredentials);
    });

    it('should return a copy of credentials', async () => {
      const sessionToken = await authService.storeCredentials(validCredentials);
      const retrievedCredentials = await authService.getCredentials(sessionToken);
      
      // Modify retrieved credentials
      retrievedCredentials.accessKeyId = 'MODIFIED';
      
      const retrievedAgain = await authService.getCredentials(sessionToken);
      expect(retrievedAgain.accessKeyId).toBe(validCredentials.accessKeyId);
    });

    it('should throw error for invalid session token', async () => {
      await expect(authService.getCredentials('invalid-token'))
        .rejects.toThrow('Invalid session token');
    });

    it('should throw error for expired session', async () => {
      // Create a service with very short session duration for testing
      const shortLivedService = new (class extends AuthenticationService {
        constructor() {
          super();
          // Override session duration to 1ms for testing
          (this as any).sessionDurationMs = 1;
        }
      })();

      const sessionToken = await shortLivedService.storeCredentials(validCredentials);
      
      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await expect(shortLivedService.getCredentials(sessionToken))
        .rejects.toThrow('Session expired');
    });
  });

  describe('revokeSession', () => {
    it('should remove session from memory', async () => {
      const sessionToken = await authService.storeCredentials(validCredentials);
      expect(authService.getActiveSessionCount()).toBe(1);
      
      await authService.revokeSession(sessionToken);
      expect(authService.getActiveSessionCount()).toBe(0);
      
      await expect(authService.getCredentials(sessionToken))
        .rejects.toThrow('Invalid session token');
    });

    it('should handle revoking non-existent session gracefully', async () => {
      await expect(authService.revokeSession('non-existent-token'))
        .resolves.not.toThrow();
    });
  });

  describe('session management', () => {
    it('should clean up expired sessions automatically', async () => {
      // Create a service with very short session duration
      const shortLivedService = new (class extends AuthenticationService {
        constructor() {
          super();
          (this as any).sessionDurationMs = 1;
        }
      })();

      const sessionToken1 = await shortLivedService.storeCredentials(validCredentials);
      expect(shortLivedService.getActiveSessionCount()).toBe(1);
      
      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Creating a new session should trigger cleanup
      await shortLivedService.storeCredentials(validCredentials);
      
      // Should have only 1 active session (the new one)
      expect(shortLivedService.getActiveSessionCount()).toBe(1);
      
      // Original session should be gone (either expired or cleaned up)
      await expect(shortLivedService.getCredentials(sessionToken1))
        .rejects.toThrow(/Invalid session token|Session expired/);
    });

    it('should handle multiple concurrent sessions', async () => {
      const credentials1 = { ...validCredentials, accessKeyId: 'KEY1' };
      const credentials2 = { ...validCredentials, accessKeyId: 'KEY2' };
      const credentials3 = { ...validCredentials, accessKeyId: 'KEY3' };

      const token1 = await authService.storeCredentials(credentials1);
      const token2 = await authService.storeCredentials(credentials2);
      const token3 = await authService.storeCredentials(credentials3);

      expect(authService.getActiveSessionCount()).toBe(3);

      const retrieved1 = await authService.getCredentials(token1);
      const retrieved2 = await authService.getCredentials(token2);
      const retrieved3 = await authService.getCredentials(token3);

      expect(retrieved1.accessKeyId).toBe('KEY1');
      expect(retrieved2.accessKeyId).toBe('KEY2');
      expect(retrieved3.accessKeyId).toBe('KEY3');
    });

    it('should clear all sessions', () => {
      // This is tested in beforeEach/afterEach, but let's be explicit
      expect(authService.getActiveSessionCount()).toBe(0);
      
      authService.clearAllSessions();
      expect(authService.getActiveSessionCount()).toBe(0);
    });
  });

  describe('security considerations', () => {
    it('should generate cryptographically secure session tokens', async () => {
      const tokens = new Set<string>();
      
      // Generate multiple tokens and ensure they're all unique
      for (let i = 0; i < 100; i++) {
        const token = await authService.storeCredentials(validCredentials);
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }
      
      expect(tokens.size).toBe(100);
    });

    it('should not expose credentials in error messages', async () => {
      const sessionToken = await authService.storeCredentials(validCredentials);
      await authService.revokeSession(sessionToken);
      
      try {
        await authService.getCredentials(sessionToken);
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).not.toContain(validCredentials.accessKeyId);
        expect((error as Error).message).not.toContain(validCredentials.secretAccessKey);
      }
    });

    it('should handle credentials with special characters', async () => {
      const specialCredentials = {
        accessKeyId: 'AKIA+/=EXAMPLE',
        secretAccessKey: 'secret+/=with/special/chars',
        region: 'us-west-2',
      };

      mockSTS.getCallerIdentity.mockReturnValue({
        promise: () => Promise.resolve({
          UserId: 'AIDACKCEVSQ6C2EXAMPLE',
          Account: '123456789012',
          Arn: 'arn:aws:iam::123456789012:user/DevAdmin',
        }),
      });

      const isValid = await authService.validateCredentials(specialCredentials);
      expect(isValid).toBe(true);

      const sessionToken = await authService.storeCredentials(specialCredentials);
      const retrieved = await authService.getCredentials(sessionToken);
      
      expect(retrieved).toEqual(specialCredentials);
    });
  });
});