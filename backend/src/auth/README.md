# Authentication Service

This module provides secure AWS credential management for the ALB Flow Analyzer application.

## Overview

The `AuthenticationService` handles:
- AWS credential validation using AWS STS
- Secure in-memory credential storage
- Session token management
- Automatic session cleanup

## Features

- **Credential Validation**: Validates AWS credentials by calling AWS STS `getCallerIdentity`
- **Session Management**: Creates secure session tokens for credential storage
- **Memory Storage**: Stores credentials in memory only (not persisted to disk)
- **Automatic Cleanup**: Removes expired sessions automatically
- **Security**: Uses cryptographically secure random tokens

## Usage

```typescript
import { AuthenticationService } from './auth';

const authService = new AuthenticationService();

// Validate credentials
const credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1'
};

const isValid = await authService.validateCredentials(credentials);

if (isValid) {
  // Store credentials and get session token
  const sessionToken = await authService.storeCredentials(credentials);
  
  // Later, retrieve credentials using session token
  const retrievedCredentials = await authService.getCredentials(sessionToken);
  
  // Revoke session when done
  await authService.revokeSession(sessionToken);
}
```

## Security Considerations

- Credentials are stored in memory only and never persisted to disk
- Session tokens are generated using cryptographically secure random bytes
- Sessions automatically expire after 24 hours
- Expired sessions are automatically cleaned up
- Credentials are copied when stored/retrieved to prevent reference issues

## API Reference

### `validateCredentials(credentials: AWSCredentials): Promise<boolean>`

Validates AWS credentials by attempting to call AWS STS `getCallerIdentity`.

**Parameters:**
- `credentials`: AWS credentials object containing accessKeyId, secretAccessKey, optional sessionToken, and region

**Returns:**
- `Promise<boolean>`: True if credentials are valid, false otherwise

### `storeCredentials(credentials: AWSCredentials): Promise<string>`

Stores credentials in memory and returns a session token.

**Parameters:**
- `credentials`: AWS credentials to store

**Returns:**
- `Promise<string>`: Session token for retrieving credentials later

### `getCredentials(sessionToken: string): Promise<AWSCredentials>`

Retrieves stored credentials using a session token.

**Parameters:**
- `sessionToken`: Session token returned from `storeCredentials`

**Returns:**
- `Promise<AWSCredentials>`: The stored credentials

**Throws:**
- `Error`: If session token is invalid or expired

### `revokeSession(sessionToken: string): Promise<void>`

Revokes a session by removing it from memory.

**Parameters:**
- `sessionToken`: Session token to revoke

## Types

### `AWSCredentials`

```typescript
interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}
```

### `SessionData`

```typescript
interface SessionData {
  credentials: AWSCredentials;
  createdAt: Date;
  expiresAt: Date;
}
```

## Testing

The module includes comprehensive tests covering:
- Credential validation with valid/invalid credentials
- Session token generation and uniqueness
- Credential storage and retrieval
- Session expiration and cleanup
- Error handling
- Security considerations

Run tests with:
```bash
npm test -- auth
```