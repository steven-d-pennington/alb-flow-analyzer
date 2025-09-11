import AWS from 'aws-sdk';
import { AWSCredentials } from '../auth/types';
import { 
  S3IntegrationService as IS3IntegrationService, 
  S3Bucket, 
  S3Object, 
  S3SearchCriteria, 
  S3ObjectMetadata 
} from './types';

export class S3IntegrationService implements IS3IntegrationService {
  private createS3Client(credentials: AWSCredentials): AWS.S3 {
    return new AWS.S3({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      region: credentials.region,
      httpOptions: {
        timeout: 30000, // 30 second timeout for individual AWS calls
      },
    });
  }

  async listBuckets(credentials: AWSCredentials): Promise<S3Bucket[]> {
    const s3 = this.createS3Client(credentials);
    
    try {
      const result = await s3.listBuckets().promise();
      
      return (result.Buckets || []).map(bucket => ({
        name: bucket.Name!,
        creationDate: bucket.CreationDate!,
      }));
    } catch (error) {
      throw new Error(`Failed to list S3 buckets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listObjects(bucketName: string, prefix: string, credentials: AWSCredentials): Promise<S3Object[]> {
    const s3 = this.createS3Client(credentials);
    const objects: S3Object[] = [];
    let continuationToken: string | undefined;
    const maxObjects = 1000; // Limit to prevent timeout
    let objectCount = 0;

    try {
      do {
        const params: AWS.S3.ListObjectsV2Request = {
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: Math.min(100, maxObjects - objectCount), // Fetch in batches of 100
        };

        const result = await s3.listObjectsV2(params).promise();
        
        if (result.Contents) {
          const newObjects = result.Contents.map(obj => ({
            key: obj.Key!,
            size: obj.Size!,
            lastModified: obj.LastModified!,
            etag: obj.ETag!,
            storageClass: obj.StorageClass || 'STANDARD',
          }));
          
          objects.push(...newObjects);
          objectCount += newObjects.length;
        }

        continuationToken = result.NextContinuationToken;
        
        // Stop if we've reached our limit
        if (objectCount >= maxObjects) {
          console.log(`⚠️  Limited S3 listing to ${maxObjects} objects for performance`);
          break;
        }
      } while (continuationToken);

      return objects;
    } catch (error) {
      throw new Error(`Failed to list objects in bucket ${bucketName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchLogFiles(bucketName: string, searchCriteria: S3SearchCriteria, credentials: AWSCredentials): Promise<S3Object[]> {
    const s3 = this.createS3Client(credentials);
    const objects: S3Object[] = [];
    
    try {
      if (searchCriteria.recursive) {
        // Recursive search through all prefixes
        await this.recursiveSearch(s3, bucketName, searchCriteria.prefix || '', objects, searchCriteria);
      } else {
        // Non-recursive search in specified prefix only
        const prefixObjects = await this.listObjects(bucketName, searchCriteria.prefix || '', credentials);
        objects.push(...prefixObjects);
      }

      // Apply filters
      return this.applySearchFilters(objects, searchCriteria);
    } catch (error) {
      throw new Error(`Failed to search log files in bucket ${bucketName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async recursiveSearch(
    s3: AWS.S3, 
    bucketName: string, 
    prefix: string, 
    objects: S3Object[], 
    searchCriteria: S3SearchCriteria
  ): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      };

      const result = await s3.listObjectsV2(params).promise();
      
      if (result.Contents) {
        objects.push(...result.Contents.map(obj => ({
          key: obj.Key!,
          size: obj.Size!,
          lastModified: obj.LastModified!,
          etag: obj.ETag!,
          storageClass: obj.StorageClass || 'STANDARD',
        })));
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);
  }

  private applySearchFilters(objects: S3Object[], searchCriteria: S3SearchCriteria): S3Object[] {
    return objects.filter(obj => {
      // Filter by file extensions
      if (searchCriteria.fileExtensions && searchCriteria.fileExtensions.length > 0) {
        const hasMatchingExtension = searchCriteria.fileExtensions.some(ext => 
          obj.key.toLowerCase().endsWith(ext.toLowerCase())
        );
        if (!hasMatchingExtension) return false;
      }

      // Filter by date range
      if (searchCriteria.dateRange) {
        const objDate = obj.lastModified;
        if (searchCriteria.dateRange.start && objDate < searchCriteria.dateRange.start) return false;
        if (searchCriteria.dateRange.end && objDate > searchCriteria.dateRange.end) return false;
      }

      // Filter by max size
      if (searchCriteria.maxSize && obj.size > searchCriteria.maxSize) return false;

      return true;
    });
  }

  async downloadObject(bucketName: string, key: string, credentials: AWSCredentials): Promise<Buffer> {
    const s3 = this.createS3Client(credentials);

    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: bucketName,
        Key: key,
      };

      const result = await s3.getObject(params).promise();
      
      if (!result.Body) {
        throw new Error(`Object ${key} has no body`);
      }

      return result.Body as Buffer;
    } catch (error) {
      throw new Error(`Failed to download object ${key} from bucket ${bucketName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getObjectMetadata(bucketName: string, key: string, credentials: AWSCredentials): Promise<S3ObjectMetadata> {
    const s3 = this.createS3Client(credentials);

    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: bucketName,
        Key: key,
      };

      const result = await s3.headObject(params).promise();
      
      return {
        key,
        size: result.ContentLength!,
        lastModified: result.LastModified!,
        etag: result.ETag!,
        storageClass: result.StorageClass || 'STANDARD',
        contentType: result.ContentType,
        metadata: result.Metadata,
      };
    } catch (error) {
      throw new Error(`Failed to get metadata for object ${key} in bucket ${bucketName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Utility method for streaming large files efficiently
  createDownloadStream(bucketName: string, key: string, credentials: AWSCredentials): AWS.Request<AWS.S3.GetObjectOutput, AWS.AWSError> {
    const s3 = this.createS3Client(credentials);
    
    const params: AWS.S3.GetObjectRequest = {
      Bucket: bucketName,
      Key: key,
    };

    return s3.getObject(params);
  }

  async listFolders(bucketName: string, prefix: string, credentials: AWSCredentials): Promise<string[]> {
    const s3 = this.createS3Client(credentials);
    const folders = new Set<string>();
    let continuationToken: string | undefined;

    try {
      do {
        const params: AWS.S3.ListObjectsV2Request = {
          Bucket: bucketName,
          Prefix: prefix,
          Delimiter: '/', // This is key - it groups objects by common prefixes (folders)
          ContinuationToken: continuationToken,
        };

        const result = await s3.listObjectsV2(params).promise();

        // Add common prefixes (folders) to our set
        if (result.CommonPrefixes) {
          result.CommonPrefixes.forEach(commonPrefix => {
            if (commonPrefix.Prefix) {
              // Extract just the folder name from the full prefix
              const folderPath = commonPrefix.Prefix;
              const folderName = folderPath.replace(prefix, '').replace(/\/$/, '');
              if (folderName) {
                folders.add(folderName);
              }
            }
          });
        }

        continuationToken = result.NextContinuationToken;
      } while (continuationToken);

      // Convert Set to sorted array
      return Array.from(folders).sort();
      
    } catch (error) {
      throw new Error(`Failed to list folders in bucket ${bucketName} with prefix ${prefix}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}