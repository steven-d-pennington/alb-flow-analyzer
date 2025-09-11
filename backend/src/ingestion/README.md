# ALB Log Ingestion Module

This module provides a comprehensive log ingestion pipeline for processing AWS Application Load Balancer (ALB) flow logs. It supports both local file processing and compressed file formats with real-time progress tracking and robust error handling.

## Features

- **File Format Support**: Processes both uncompressed and gzip-compressed log files
- **Batch Processing**: Configurable batch sizes for memory-efficient processing
- **Progress Tracking**: Real-time progress updates with time estimation
- **Error Handling**: Graceful handling of malformed entries with detailed error reporting
- **Concurrent Processing**: Support for processing multiple files concurrently
- **Validation**: Built-in log format validation
- **Cancellation**: Support for cancelling long-running operations

## Usage

### Basic Usage

```typescript
import { ALBLogIngestion } from './ingestion';

const ingestion = new ALBLogIngestion();

// Process local files
const result = await ingestion.loadLocalFiles([
  '/path/to/logs/access.log',
  '/path/to/logs/access.log.gz'
]);

console.log(`Processed ${result.successfullyParsed} entries`);
console.log(`Found ${result.failedLines} malformed entries`);
```

### Advanced Usage with Options

```typescript
import { ALBLogIngestion, ProcessingOptions } from './ingestion';

const ingestion = new ALBLogIngestion();

const options: ProcessingOptions = {
  batchSize: 1000,                    // Process in batches of 1000 entries
  maxConcurrentFiles: 3,              // Process up to 3 files concurrently
  skipMalformedLines: true,           // Skip malformed entries (default: true)
  progressCallback: (progress) => {
    console.log(`Progress: ${progress.processedLines}/${progress.totalLines}`);
    console.log(`ETA: ${progress.estimatedTimeRemaining}ms`);
  },
  errorCallback: (error) => {
    console.warn(`Error in ${error.fileName}:${error.lineNumber}: ${error.error}`);
  }
};

const result = await ingestion.loadLocalFiles(['/path/to/logs'], options);
```

### Progress Tracking

```typescript
const ingestion = new ALBLogIngestion();

// Start processing in background
const processingPromise = ingestion.loadLocalFiles(['/path/to/large-log.gz']);

// Monitor progress
const progressInterval = setInterval(() => {
  const progress = ingestion.getProcessingProgress();
  
  if (progress.isComplete) {
    clearInterval(progressInterval);
    console.log('Processing complete!');
  } else {
    const percentage = (progress.processedBytes / progress.totalBytes) * 100;
    console.log(`Progress: ${percentage.toFixed(1)}%`);
  }
}, 1000);

const result = await processingPromise;
```

### Validation

```typescript
const ingestion = new ALBLogIngestion();

// Validate log format before processing
const isValid = await ingestion.validateLogFormat('/path/to/log.txt');

if (isValid) {
  console.log('Log format is valid');
  const result = await ingestion.loadLocalFiles(['/path/to/log.txt']);
} else {
  console.log('Invalid log format detected');
}
```

### Error Handling

```typescript
const ingestion = new ALBLogIngestion();

const result = await ingestion.loadLocalFiles(['/path/to/logs'], {
  skipMalformedLines: false,  // Treat malformed entries as errors
  errorCallback: (error) => {
    if (error.severity === 'critical') {
      console.error(`Critical error: ${error.error}`);
    } else if (error.severity === 'error') {
      console.error(`Parse error in ${error.fileName}:${error.lineNumber}`);
    } else {
      console.warn(`Warning: ${error.error}`);
    }
  }
});

if (!result.success) {
  console.error('Processing failed');
  result.errors.forEach(error => {
    console.error(`${error.severity}: ${error.error}`);
  });
}
```

### Cancellation

```typescript
const ingestion = new ALBLogIngestion();

// Start processing
const processingPromise = ingestion.loadLocalFiles(['/path/to/huge-log.gz']);

// Cancel after 30 seconds if still running
setTimeout(() => {
  ingestion.cancelProcessing();
  console.log('Processing cancelled');
}, 30000);

const result = await processingPromise;
console.log(`Processed ${result.successfullyParsed} entries before cancellation`);
```

## API Reference

### ALBLogIngestion Class

#### Constructor
```typescript
constructor(parser?: LogParser)
```
- `parser`: Optional custom log parser (defaults to ALBLogParser)

#### Methods

##### loadLocalFiles(filePaths, options?)
```typescript
loadLocalFiles(filePaths: string[], options?: ProcessingOptions): Promise<ProcessingResult>
```
Process local log files.

**Parameters:**
- `filePaths`: Array of file paths to process
- `options`: Optional processing configuration

**Returns:** Promise resolving to ProcessingResult

##### validateLogFormat(filePath)
```typescript
validateLogFormat(filePath: string): Promise<boolean>
```
Validate if a file contains valid ALB log format.

**Parameters:**
- `filePath`: Path to the file to validate

**Returns:** Promise resolving to boolean indicating validity

##### getProcessingProgress()
```typescript
getProcessingProgress(): ProcessingProgress
```
Get current processing progress.

**Returns:** Current progress information

##### cancelProcessing()
```typescript
cancelProcessing(): void
```
Cancel current processing operation.

##### handleMalformedEntries(entry, error, fileName, lineNumber)
```typescript
handleMalformedEntries(entry: string, error: Error, fileName: string, lineNumber: number): void
```
Handle malformed log entries (called internally).

## Types

### ProcessingOptions
```typescript
interface ProcessingOptions {
  batchSize?: number;                                    // Default: 1000
  maxConcurrentFiles?: number;                          // Default: 1
  skipMalformedLines?: boolean;                         // Default: true
  progressCallback?: (progress: ProcessingProgress) => void;
  errorCallback?: (error: ProcessingError) => void;
}
```

### ProcessingResult
```typescript
interface ProcessingResult {
  success: boolean;
  totalFiles: number;
  processedFiles: number;
  totalLines: number;
  successfullyParsed: number;
  failedLines: number;
  entries: ParsedLogEntry[];
  errors: ProcessingError[];
  processingTime: number;
}
```

### ProcessingProgress
```typescript
interface ProcessingProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  totalBytes: number;
  processedBytes: number;
  totalLines: number;
  processedLines: number;
  successfullyParsed: number;
  failedLines: number;
  estimatedTimeRemaining: number;
  errors: ProcessingError[];
  startTime: Date;
  isComplete: boolean;
}
```

### ProcessingError
```typescript
interface ProcessingError {
  fileName: string;
  lineNumber?: number;
  error: string;
  timestamp: Date;
  severity: 'warning' | 'error' | 'critical';
}
```

## Performance Considerations

### Memory Usage
- Use appropriate batch sizes (default: 1000) to control memory usage
- For very large files, consider smaller batch sizes
- The system processes files in streams to minimize memory footprint

### Concurrent Processing
- Default concurrent file limit is 1 to prevent resource exhaustion
- Increase `maxConcurrentFiles` for better performance with multiple small files
- Monitor system resources when processing many files concurrently

### File Size Recommendations
- Files up to 1GB: Use default settings
- Files 1GB-10GB: Consider batchSize: 500, maxConcurrentFiles: 1
- Files >10GB: Consider batchSize: 100-500, enable progress monitoring

## Error Handling Strategy

### Error Severities
- **warning**: Malformed entries when `skipMalformedLines: true`
- **error**: Malformed entries when `skipMalformedLines: false`
- **critical**: System errors (file access, parsing failures)

### Best Practices
1. Always check `result.success` before using parsed entries
2. Use `skipMalformedLines: true` for production logs with occasional corruption
3. Use `skipMalformedLines: false` for validation and testing
4. Implement error callbacks for real-time error monitoring
5. Log critical errors for debugging and monitoring

## Testing

The module includes comprehensive tests covering:
- Valid and malformed log entries
- Compressed file processing
- Progress tracking
- Error handling
- Concurrent processing
- Memory management
- Integration scenarios

Run tests with:
```bash
npm test -- --testPathPattern="ingestion"
```