import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import filesRoutes from '../files';

const app = express();
app.use(express.json());
app.use('/api/files', filesRoutes);

// Test data
const validLogEntry = '2023-01-01T12:00:00.000000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.1:80 10.0.0.1:80 0.000 0.001 0.000 200 200 0 29 "GET http://www.example.com:80/ HTTP/1.1" "curl/7.46.0" - - arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "-" "-" 0 2023-01-01T12:00:00.000000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"';

describe('File Processing Integration Tests', () => {
  let testUploadDir: string;
  let testLogFile: string;

  beforeAll(async () => {
    // Create test upload directory
    testUploadDir = path.join(process.cwd(), 'test-integration-uploads');
    if (!fs.existsSync(testUploadDir)) {
      fs.mkdirSync(testUploadDir, { recursive: true });
    }

    // Create test log file
    testLogFile = path.join(testUploadDir, 'integration-test.log');
    fs.writeFileSync(testLogFile, `${validLogEntry}\n${validLogEntry}\n`);
  });

  afterAll(async () => {
    // Clean up test files
    try {
      if (fs.existsSync(testLogFile)) fs.unlinkSync(testLogFile);
      if (fs.existsSync(testUploadDir)) {
        const files = fs.readdirSync(testUploadDir);
        for (const file of files) {
          fs.unlinkSync(path.join(testUploadDir, file));
        }
        fs.rmdirSync(testUploadDir);
      }
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  });

  it('should handle complete file upload and processing workflow', async () => {
    // 1. Upload file
    const uploadResponse = await request(app)
      .post('/api/files/upload')
      .attach('files', testLogFile)
      .expect(200);

    expect(uploadResponse.body.message).toBe('Files uploaded successfully');
    expect(uploadResponse.body.files).toHaveLength(1);
    
    const uploadedFile = uploadResponse.body.files[0];
    expect(uploadedFile.originalName).toBe('integration-test.log');

    // 2. Check service status
    const statusResponse = await request(app)
      .get('/api/files/status')
      .expect(200);

    expect(statusResponse.body.service).toBe('File Processing Service');
    expect(statusResponse.body.status).toBe('operational');

    // 3. List sessions (should be empty initially)
    const sessionsResponse = await request(app)
      .get('/api/files/sessions')
      .expect(200);

    expect(sessionsResponse.body.sessions).toBeDefined();
    expect(Array.isArray(sessionsResponse.body.sessions)).toBe(true);

    // Clean up uploaded file
    try {
      fs.unlinkSync(uploadedFile.path);
    } catch (error) {
      console.warn('Failed to cleanup uploaded file:', error);
    }
  });

  it('should handle file upload validation', async () => {
    // Test with no files
    const noFilesResponse = await request(app)
      .post('/api/files/upload')
      .expect(400);

    expect(noFilesResponse.body.error).toBe('No files uploaded');

    // Test with valid file
    const validResponse = await request(app)
      .post('/api/files/upload')
      .attach('files', testLogFile)
      .expect(200);

    expect(validResponse.body.files).toHaveLength(1);

    // Clean up
    try {
      fs.unlinkSync(validResponse.body.files[0].path);
    } catch (error) {
      console.warn('Failed to cleanup uploaded file:', error);
    }
  });

  it('should handle processing validation', async () => {
    // Test with no file paths
    const noPathsResponse = await request(app)
      .post('/api/files/process')
      .send({})
      .expect(400);

    expect(noPathsResponse.body.error).toBe('Missing file paths');

    // Test with empty array
    const emptyArrayResponse = await request(app)
      .post('/api/files/process')
      .send({ filePaths: [] })
      .expect(400);

    expect(emptyArrayResponse.body.error).toBe('Missing file paths');

    // Test with non-existent file
    const nonExistentResponse = await request(app)
      .post('/api/files/process')
      .send({ filePaths: ['/non/existent/file.log'] })
      .expect(400);

    expect(nonExistentResponse.body.error).toBe('Invalid file paths');
  });

  it('should handle progress endpoint validation', async () => {
    // Test with non-existent session
    const nonExistentResponse = await request(app)
      .get('/api/files/progress/non-existent-session')
      .expect(404);

    expect(nonExistentResponse.body.error).toBe('Session not found');
  });

  it('should handle session cancellation validation', async () => {
    // Test with non-existent session
    const nonExistentResponse = await request(app)
      .delete('/api/files/process/non-existent-session')
      .expect(404);

    expect(nonExistentResponse.body.error).toBe('Session not found');
  });
});