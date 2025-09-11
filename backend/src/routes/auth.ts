import { Router, Request, Response } from 'express';
import { AuthenticationService } from '../auth/AuthenticationService';
import { AWSCredentials } from '../auth/types';

const router = Router();

// Middleware to extract session token from Authorization header
const extractSessionToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

/**
 * POST /api/auth/credentials
 * Validate AWS credentials and create a session
 */
router.post('/credentials', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials: AWSCredentials = req.body;

    // Validate required fields
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.region) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'accessKeyId, secretAccessKey, and region are required'
      });
      return;
    }

    // Validate credentials with AWS
    const authService = AuthenticationService.getInstance();
    const isValid = await authService.validateCredentials(credentials);
    
    if (!isValid) {
      res.status(401).json({
        error: 'Invalid credentials',
        message: 'The provided AWS credentials are invalid or lack necessary permissions'
      });
      return;
    }

    // Store credentials and create session
    const sessionToken = await authService.storeCredentials(credentials);

    res.json({
      sessionToken,
      message: 'Credentials validated successfully'
    });

  } catch (error) {
    console.error('Error validating credentials:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to validate credentials'
    });
  }
});

/**
 * POST /api/auth/test
 * Test AWS credentials without creating a session
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials: AWSCredentials = req.body;

    // Validate required fields
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.region) {
      res.status(400).json({
        valid: false,
        error: 'Missing required fields'
      });
      return;
    }

    // Test credentials with AWS
    const authService = AuthenticationService.getInstance();
    const isValid = await authService.validateCredentials(credentials);

    res.json({
      valid: isValid,
      message: isValid ? 'Credentials are valid' : 'Credentials are invalid'
    });

  } catch (error) {
    console.error('Error testing credentials:', error);
    res.json({
      valid: false,
      error: 'Failed to test credentials'
    });
  }
});

/**
 * GET /api/auth/session
 * Get current session information
 */
router.get('/session', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionToken = extractSessionToken(req);
    
    if (!sessionToken) {
      res.status(401).json({
        error: 'No session token provided',
        message: 'Authorization header with Bearer token is required'
      });
      return;
    }

    // Get credentials for the session
    const authService = AuthenticationService.getInstance();
    const credentials = await authService.getCredentials(sessionToken);

    // Return session info without sensitive data
    res.json({
      accessKeyId: credentials.accessKeyId,
      region: credentials.region,
      hasSessionToken: !!credentials.sessionToken,
      authenticated: true
    });

  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid session') || error.message.includes('Session expired'))) {
      res.status(401).json({
        error: 'Invalid session',
        message: error.message
      });
      return;
    }

    console.error('Error getting session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get session information'
    });
  }
});

/**
 * DELETE /api/auth/session
 * Revoke current session
 */
router.delete('/session', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionToken = extractSessionToken(req);
    
    if (!sessionToken) {
      res.status(401).json({
        error: 'No session token provided',
        message: 'Authorization header with Bearer token is required'
      });
      return;
    }

    // Revoke the session
    const authService = AuthenticationService.getInstance();
    await authService.revokeSession(sessionToken);

    res.json({
      message: 'Session revoked successfully'
    });

  } catch (error) {
    console.error('Error revoking session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to revoke session'
    });
  }
});

/**
 * POST /api/auth/environment-session
 * Get session token for environment credentials (if available)
 */
router.post('/environment-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const authService = AuthenticationService.getInstance();
    const defaultToken = authService.getDefaultSessionToken();
    
    if (!defaultToken) {
      res.status(404).json({
        error: 'No environment credentials',
        message: 'No environment credentials are available on the server'
      });
      return;
    }

    // Return the default session token so frontend can use it
    res.json({
      sessionToken: defaultToken,
      message: 'Environment session token retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting environment session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get environment session'
    });
  }
});

/**
 * GET /api/auth/status
 * Get authentication service status (for monitoring)
 */
router.get('/status', (req: Request, res: Response) => {
  const authService = AuthenticationService.getInstance();
  res.json({
    service: 'Authentication Service',
    status: 'operational',
    activeSessions: authService.getActiveSessionCount(),
    timestamp: new Date().toISOString()
  });
});

export default router;