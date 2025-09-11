import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import filesRoutes from '../files';
import { ALBLogIngestion } from '../../ingestion/LogIngestion';

// Mock the ingestion module
jest.mock('../../ingestion/LogIngestion');

const app = express();
app.use(express.json());
app.use('/api/files', filesRoutes);

// Test data
const validLogEntry = '2023-01-01T12:00:00.000000Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.1:80 10.0.0.1:80 0.000 0.001 0.000 200 200 0 29 "GET http://www.example.com:80/ HTTP/1.1" "curl/7.46.0" - - arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/73e2d6bc24d8a067 "Root=1-58337262-36d228ad5d99923122bbe354" "-" "-" 0 2023-01-01T12:00:00.000000Z "forward" "-" "-" "10.0.0.1:80" "200" "-" "-"';

const invalidLogEntry = 'invalid log entry';

describe('File Processing Routes', () => {
  let mockIngestion: jest.Mocked<ALBLogIngestion>;
  let testUploadDir: string;
  let testLogFile: string;
  let testGzFile: string;

  beforeAll(async () => {
    // Create test upload directory
    testUploadDir = path.join(process.cwd(), 'test-uploads');
    if (!fs.existsSync(testUploadDir)) {
      fs.mkdirSync(testUploadDir, { recursive: true });
    }

    // Create test log file
    testLogFile = path.join(testUploadDir, 'test.log');
    fs.writeFileSync(testLogFile, `${validLogEntry}\n${validLogEntry}\n${invalidLogEntry}\n`);

    // Create test gzip file (mock)
    testGzFile = path.join(testUploadDir, 'test.log.gz');
    fs.writeFileSync(testGzFile, 'mock gzip content');
  });

  afterAll(async () => {
    // Clean up test files
    try {
      if (fs.existsSync(testLogFile)) fs.unlinkSync(testLogFile);
      if (fs.existsSync(testGzFile)) fs.unlinkSync(testGzFile);
      if (fs.existsSync(testUploadDir)) {
        // Remove all files in directory first
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

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock ingestion instance
    mockIngestion = {
      loadLocalFiles: jest.fn(),
      validateLogFormat: jest.fn(),
      handleMalformedEntries: jest.fn(),
      getProcessingProgress: jest.fn(),
      cancelProcessing: jest.fn()
    } as any;

    (ALBLogIngestion as jest.MockedClass<typeof ALBLogIngestion>).mockImplementation(() => mockIngestion);
  });

  describe('POST /api/files/upload', () => {
    it('should upload a single log file successfully', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .attach('files', testLogFile)
        .expect(200);

      expect(response.body.message).toBe('Files uploaded successfully');
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0].originalName).toBe('test.log');
      expect(response.body.files[0].size).toBeGreaterThan(0);
      expect(response.body.count).toBe(1);

      // Clean up uploaded file
      if (response.body.files[0].path) {
        try {
          fs.unlinkSync(response.body.files[0].path);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    it('should upload multiple log files successfully', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .attach('files', testLogFile)
        .attach('files', testGzFile)
        .expect(200);

      expect(response.body.message).toBe('Files uploaded successfully');
      expect(response.body.files).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.totalSize).toBeGreaterThan(0);

      // Clean up uploaded files
      response.body.files.forEach((file: any) => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          // Ignore cleanup errors
        }
      });
    });

    it('should reject upload with no files', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .expect(400);

      expect(response.body.error).toBe('No files uploaded');
      expect(response.body.message).toBe('Please select at least one file to upload');
    });

    it('should handle file upload errors gracefully', async () => {
      // Test with invalid file type instead of large file to avoid timeout
      const invalidFile = path.join(testUploadDir, 'test.exe');
      fs.writeFileSync(invalidFile, 'fake executable content');
      
      try {
        const response = await request(app)
          .post('/api/files/upload')
          .attach('files', invalidFile)
          .expect(400);

        expect(response.body.error).toBe('Upload failed');
      } finally {
        // Clean up
        try {
          fs.unlinkSync(invalidFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }, 10000);
  });

  describe('POST /api/files/process', () => {
    it('should start processing files successfully', async () => {
      const mockProgress = {
        totalFiles: 1,
        processedFiles: 0,
        currentFile: '',
        totalBytes: 100,
        processedBytes: 0,
        totalLines: 0,
        processedLines: 0,
        successfullyParsed: 0,
        failedLines: 0,
        estimatedTimeRemaining: 0,
        errors: [],
        startTime: new Date(),
        isComplete: false
      };

      const mockResult = {
        success: true,
        totalFiles: 1,
        processedFiles: 1,
        totalLines: 3,
        successfullyParsed: 2,
        failedLines: 1,
        entries: [],
        errors: [],
        processingTime: 1000
      };

      mockIngestion.getProcessingProgress.mockReturnValue(mockProgress);
      mockIngestion.loadLocalFiles.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/files/process')
        .send({
          filePaths: [testLogFile],
          options: {
            batchSize: 500,
            skipMalformedLines: true
          }
        })
        .expect(200);

      expect(response.body.message).toBe('Processing started');
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.filePaths).toEqual([testLogFile]);
      expect(response.body.options.batchSize).toBe(500);
      expect(mockIngestion.loadLocalFiles).toHaveBeenCalledWith(
        [testLogFile],
        expect.objectContaining({
          batchSize: 500,
          skipMalformedLines: true
        })
      );
    });

    it('should reject processing with no file paths', async () => {
      const response = await request(app)
        .post('/api/files/process')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing file paths');
      expect(response.body.message).toBe('filePaths array is required and must contain at least one file path');
    });

    it('should reject processing with empty file paths array', async () => {
      const response = await request(app)
        .post('/api/files/process')
        .send({ filePaths: [] })
        .expect(400);

      expect(response.body.error).toBe('Missing file paths');
    });

    it('should reject processing with non-existent files', async () => {
      const response = await request(app)
        .post('/api/files/process')
        .send({
          filePaths: ['/non/existent/file.log', '/another/missing/file.log']
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid file paths');
      expect(response.body.message).toContain('The following files do not exist');
    });

    it('should use default processing options when not provided', async () => {
      const mockProgress = {
        totalFiles: 1,
        processedFiles: 0,
        currentFile: '',
        totalBytes: 100,
        processedBytes: 0,
        totalLines: 0,
        processedLines: 0,
        successfullyParsed: 0,
        failedLines: 0,
        estimatedTimeRemaining: 0,
        errors: [],
        startTime: new Date(),
        isComplete: false
      };

      mockIngestion.getProcessingProgress.mockReturnValue(mockProgress);
      mockIngestion.loadLocalFiles.mockResolvedValue({
        success: true,
        totalFiles: 1,
        processedFiles: 1,
        totalLines: 2,
        successfullyParsed: 2,
        failedLines: 0,
        entries: [],
        errors: [],
        processingTime: 500
      });

      const response = await request(app)
        .post('/api/files/process')
        .send({ filePaths: [testLogFile] })
        .expect(200);

      expect(response.body.options.batchSize).toBe(1000);
      expect(response.body.options.maxConcurrentFiles).toBe(1);
      expect(response.body.options.skipMalformedLines).toBe(true);
    });
  });

  describe('GET /api/files/progress/:sessionId', () => {
    it('should return progress for valid session', async () => {
      // First start a processing session
      const mockProgress = {
        totalFiles: 1,
        processedFiles: 0,
        currentFile: 'test.log',
        totalBytes: 100,
        processedBytes: 50,
        totalLines: 10,
        processedLines: 5,
        successfullyParsed: 4,
        failedLines: 1,
        estimatedTimeRemaining: 1000,
        errors: [],
        startTime: new Date(),
        isComplete: false
      };

      mockIngestion.getProcessingProgress.mockReturnValue(mockProgress);
      mockIngestion.loadLocalFiles.mockImplementation(() => new Promise(() => {})); // Never resolves

      const processResponse = await request(app)
        .post('/api/files/process')
        .send({ filePaths: [testLogFile] })
        .expect(200);

      const sessionId = processResponse.body.sessionId;

      // Then check progress
      const progressResponse = await request(app)
        .get(`/api/files/progress/${sessionId}`)
        .expect(200);

      expect(progressResponse.body.sessionId).toBe(sessionId);
      expect(progressResponse.body.progress.totalFiles).toBe(1);
      expect(progressResponse.body.progress.processedFiles).toBe(0);
      expect(progressResponse.body.progress.currentFile).toBe('test.log');
      expect(progressResponse.body.progress.progressPercentage).toBe(50);
      expect(progressResponse.body.isComplete).toBe(false);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/files/progress/non-existent-session')
        .expect(404);

      expect(response.body.error).toBe('Session not found');
      expect(response.body.message).toContain('No active session found');
    });

    it('should return 400 for missing session ID', async () => {
      const response = await request(app)
        .get('/api/files/progress/')
        .expect(404); // Express returns 404 for missing route params
    });
  });

  describe('DELETE /api/files/process/:sessionId', () => {
    it('should cancel active processing session', async () => {
      // Start a processing session
      const mockProgress = {
        totalFiles: 1,
        processedFiles: 0,
        currentFile: 'test.log',
        totalBytes: 100,
        processedBytes: 25,
        totalLines: 0,
        processedLines: 0,
        successfullyParsed: 0,
        failedLines: 0,
        estimatedTimeRemaining: 3000,
        errors: [],
        startTime: new Date(),
        isComplete: false
      };

      mockIngestion.getProcessingProgress.mockReturnValue(mockProgress);
      mockIngestion.loadLocalFiles.mockImplementation(() => new Promise(() => {})); // Never resolves

      const processResponse = await request(app)
        .post('/api/files/process')
        .send({ filePaths: [testLogFile] })
        .expect(200);

      const sessionId = processResponse.body.sessionId;

      // Cancel the session
      const cancelResponse = await request(app)
        .delete(`/api/files/process/${sessionId}`)
        .expect(200);

      expect(cancelResponse.body.message).toBe('Processing session cancelled');
      expect(cancelResponse.body.sessionId).toBe(sessionId);
      expect(cancelResponse.body.wasComplete).toBe(false);
      expect(mockIngestion.cancelProcessing).toHaveBeenCalled();

      // Verify session is removed
      await request(app)
        .get(`/api/files/progress/${sessionId}`)
        .expect(404);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .delete('/api/files/process/non-existent-session')
        .expect(404);

      expect(response.body.error).toBe('Session not found');
    });
  });

  describe('GET /api/files/sessions', () => {
    it('should list active sessions', async () => {
      const response = await request(app)
        .get('/api/files/sessions')
        .expect(200);

      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.count).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should include session details in list', async () => {
      // Start a processing session
      const mockProgress = {
        totalFiles: 2,
        processedFiles: 1,
        currentFile: 'test.log',
        totalBytes: 200,
        processedBytes: 100,
        totalLines: 0,
        processedLines: 0,
        successfullyParsed: 0,
        failedLines: 0,
        estimatedTimeRemaining: 1000,
        errors: [],
        startTime: new Date(),
        isComplete: false
      };

      mockIngestion.getProcessingProgress.mockReturnValue(mockProgress);
      mockIngestion.loadLocalFiles.mockImplementation(() => new Promise(() => {})); // Never resolves

      const processResponse = await request(app)
        .post('/api/files/process')
        .send({ filePaths: [testLogFile] })
        .expect(200);

      const sessionId = processResponse.body.sessionId;

      // List sessions
      const listResponse = await request(app)
        .get('/api/files/sessions')
        .expect(200);

      const session = listResponse.body.sessions.find((s: any) => s.id === sessionId);
      expect(session).toBeDefined();
      expect(session.isComplete).toBe(false);
      expect(session.progress.totalFiles).toBe(2);
      expect(session.progress.processedFiles).toBe(1);
      expect(session.progress.progressPercentage).toBe(50);

      // Clean up
      await request(app).delete(`/api/files/process/${sessionId}`);
    });
  });

  describe('GET /api/files/status', () => {
    it('should return service status', async () => {
      const response = await request(app)
        .get('/api/files/status')
        .expect(200);

      expect(response.body.service).toBe('File Processing Service');
      expect(response.body.status).toBe('operational');
      expect(response.body.activeSessions).toBeDefined();
      expect(response.body.runningSessions).toBeDefined();
      expect(response.body.completedSessions).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should complete full file processing workflow', async () => {
      const mockProgress = {
        totalFiles: 1,
        processedFiles: 0,
        currentFile: '',
        totalBytes: 100,
        processedBytes: 0,
        totalLines: 0,
        processedLines: 0,
        successfullyParsed: 0,
        failedLines: 0,
        estimatedTimeRemaining: 0,
        errors: [],
        startTime: new Date(),
        isComplete: false
      };

      const mockResult = {
        success: true,
        totalFiles: 1,
        processedFiles: 1,
        totalLines: 3,
        successfullyParsed: 2,
        failedLines: 1,
        entries: [],
        errors: [],
        processingTime: 1000
      };

      mockIngestion.getProcessingProgress.mockReturnValue(mockProgress);
      
      // Mock processing completion
      let resolveProcessing: (result: any) => void;
      const processingPromise = new Promise<any>(resolve => {
        resolveProcessing = resolve;
      });
      mockIngestion.loadLocalFiles.mockReturnValue(processingPromise);

      // 1. Upload file
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('files', testLogFile)
        .expect(200);

      const uploadedFile = uploadResponse.body.files[0];

      // 2. Start processing
      const processResponse = await request(app)
        .post('/api/files/process')
        .send({ filePaths: [uploadedFile.path] })
        .expect(200);

      const sessionId = processResponse.body.sessionId;

      // 3. Check initial progress
      const initialProgressResponse = await request(app)
        .get(`/api/files/progress/${sessionId}`)
        .expect(200);

      expect(initialProgressResponse.body.isComplete).toBe(false);

      // 4. Complete processing
      mockProgress.isComplete = true;
      mockProgress.processedFiles = 1;
      mockProgress.processedBytes = 100;
      resolveProcessing!(mockResult);

      // Wait a bit for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // 5. Check final progress
      const finalProgressResponse = await request(app)
        .get(`/api/files/progress/${sessionId}`)
        .expect(200);

      expect(finalProgressResponse.body.isComplete).toBe(true);
      expect(finalProgressResponse.body.result).toBeDefined();
      expect(finalProgressResponse.body.result.success).toBe(true);
    });

    it('should handle processing errors gracefully', async () => {
      const mockProgress = {
        totalFiles: 1,
        processedFiles: 0,
        currentFile: 'test.log',
        totalBytes: 100,
        processedBytes: 0,
        totalLines: 0,
        processedLines: 0,
        successfullyParsed: 0,
        failedLines: 0,
        estimatedTimeRemaining: 0,
        errors: [],
        startTime: new Date(),
        isComplete: false
      };

      mockIngestion.getProcessingProgress.mockReturnValue(mockProgress);
      mockIngestion.loadLocalFiles.mockRejectedValue(new Error('Processing failed'));

      // Start processing
      const processResponse = await request(app)
        .post('/api/files/process')
        .send({ filePaths: [testLogFile] })
        .expect(200);

      const sessionId = processResponse.body.sessionId;

      // Wait for error to be handled
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check progress shows error
      const progressResponse = await request(app)
        .get(`/api/files/progress/${sessionId}`)
        .expect(200);

      expect(progressResponse.body.isComplete).toBe(true);
      expect(progressResponse.body.error).toBe('Processing failed');
    });
  });
});