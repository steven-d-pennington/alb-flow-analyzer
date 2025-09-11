import { api } from './authService';
import { S3Bucket, S3Object, S3SearchCriteria, S3ObjectMetadata } from '../types/s3';

export class S3Service {
  /**
   * List all available S3 buckets
   */
  static async listBuckets(): Promise<S3Bucket[]> {
    try {
      const response = await api.get('/api/s3/buckets');
      
      // The backend returns { buckets: [...], count: ..., timestamp: ... }
      const buckets = response.data.buckets || response.data;
      return buckets.map((bucket: any) => ({
        ...bucket,
        creationDate: new Date(bucket.creationDate),
      }));
    } catch (error) {
      console.error('Failed to list S3 buckets:', error);
      throw new Error('Failed to list S3 buckets');
    }
  }

  /**
   * List objects in a specific bucket with optional prefix
   */
  static async listObjects(bucketName: string, prefix: string = ''): Promise<S3Object[]> {
    try {
      const response = await api.get(`/api/s3/objects`, {
        params: { bucket: bucketName, prefix },
      });
      // The backend returns { bucket: ..., prefix: ..., objects: [...], count: ..., timestamp: ... }
      const objects = response.data.objects || response.data;
      return objects.map((obj: any) => ({
        ...obj,
        lastModified: new Date(obj.lastModified),
      }));
    } catch (error) {
      console.error('Failed to list S3 objects:', error);
      throw new Error('Failed to list S3 objects');
    }
  }

  /**
   * Search for log files with specific criteria
   */
  static async searchLogFiles(bucketName: string, searchCriteria: S3SearchCriteria): Promise<S3Object[]> {
    try {
      const response = await api.post('/api/s3/search', {
        bucket: bucketName,
        searchCriteria: {
          ...searchCriteria,
          dateRange: searchCriteria.dateRange ? {
            start: searchCriteria.dateRange.start.toISOString(),
            end: searchCriteria.dateRange.end.toISOString(),
          } : undefined,
        },
      });
      // The backend returns { bucket: ..., searchCriteria: ..., objects: [...], count: ..., timestamp: ... }
      const objects = response.data.objects || response.data;
      return objects.map((obj: any) => ({
        ...obj,
        lastModified: new Date(obj.lastModified),
      }));
    } catch (error) {
      console.error('Failed to search log files:', error);
      throw new Error('Failed to search log files');
    }
  }

  /**
   * Get all files in a folder recursively
   */
  static async getFolderContents(
    bucketName: string, 
    prefix: string, 
    fileExtensions?: string[]
  ): Promise<{ files: S3Object[], totalSize: number }> {
    try {
      const params: any = { bucket: bucketName, prefix };
      if (fileExtensions && fileExtensions.length > 0) {
        params.fileExtensions = fileExtensions.join(',');
      }
      
      const response = await api.get('/api/s3/folder-contents', { params });
      
      const files = (response.data.files || []).map((obj: any) => ({
        ...obj,
        lastModified: new Date(obj.lastModified),
      }));
      
      return {
        files,
        totalSize: response.data.totalSize || 0
      };
    } catch (error) {
      console.error('Failed to get folder contents:', error);
      throw new Error('Failed to get folder contents');
    }
  }

  /**
   * List folders/directories in a bucket with optional prefix
   */
  static async listFolders(bucketName: string, prefix: string = ''): Promise<string[]> {
    try {
      const response = await api.get(`/api/s3/folders`, {
        params: { bucket: bucketName, prefix },
      });
      // The backend returns { bucket: ..., prefix: ..., folders: [...], count: ..., timestamp: ... }
      return response.data.folders || [];
    } catch (error) {
      console.error('Failed to list S3 folders:', error);
      throw new Error('Failed to list S3 folders');
    }
  }

  /**
   * Check which folders have been downloaded
   */
  static async checkDownloadStatus(
    bucketName: string, 
    prefixes: string[]
  ): Promise<Record<string, { downloaded: boolean; fileCount: number; lastDownloaded?: Date }>> {
    try {
      const response = await api.get('/api/s3/check-downloaded', {
        params: { 
          bucket: bucketName, 
          prefixes: prefixes.join(',') 
        },
      });
      
      // Convert date strings to Date objects
      const results = response.data.results || {};
      Object.keys(results).forEach(key => {
        if (results[key].lastDownloaded) {
          results[key].lastDownloaded = new Date(results[key].lastDownloaded);
        }
      });
      
      return results;
    } catch (error) {
      console.error('Failed to check download status:', error);
      return {};
    }
  }

  /**
   * Get metadata for a specific object
   */
  static async getObjectMetadata(bucketName: string, key: string): Promise<S3ObjectMetadata> {
    try {
      const response = await api.get(`/api/s3/metadata`, {
        params: { bucket: bucketName, key },
      });
      return {
        ...response.data,
        lastModified: new Date(response.data.lastModified),
      };
    } catch (error) {
      console.error('Failed to get object metadata:', error);
      throw new Error('Failed to get object metadata');
    }
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if a file is likely an ALB log file based on its key
   */
  static isLikelyLogFile(key: string): boolean {
    const logExtensions = ['.log', '.gz', '.txt'];
    const logPatterns = [
      /elasticloadbalancing/i,
      /alb/i,
      /access[_-]?log/i,
      /flow[_-]?log/i,
    ];
    
    const hasLogExtension = logExtensions.some(ext => key.toLowerCase().endsWith(ext));
    const matchesPattern = logPatterns.some(pattern => pattern.test(key));
    
    return hasLogExtension || matchesPattern;
  }

  /**
   * Extract folder path from object key
   */
  static getFolderPath(key: string): string {
    const lastSlashIndex = key.lastIndexOf('/');
    return lastSlashIndex > 0 ? key.substring(0, lastSlashIndex) : '';
  }

  /**
   * Extract filename from object key
   */
  static getFileName(key: string): string {
    const lastSlashIndex = key.lastIndexOf('/');
    return lastSlashIndex >= 0 ? key.substring(lastSlashIndex + 1) : key;
  }
}