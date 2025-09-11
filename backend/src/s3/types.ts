export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  storageClass: string;
}

export interface S3Bucket {
  name: string;
  creationDate: Date;
}

export interface S3SearchCriteria {
  prefix?: string;
  fileExtensions?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  maxSize?: number;
  recursive: boolean;
}

export interface S3ObjectMetadata {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  storageClass: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface S3IntegrationService {
  listBuckets(credentials: import('../auth/types').AWSCredentials): Promise<S3Bucket[]>;
  listObjects(bucketName: string, prefix: string, credentials: import('../auth/types').AWSCredentials): Promise<S3Object[]>;
  searchLogFiles(bucketName: string, searchCriteria: S3SearchCriteria, credentials: import('../auth/types').AWSCredentials): Promise<S3Object[]>;
  downloadObject(bucketName: string, key: string, credentials: import('../auth/types').AWSCredentials): Promise<Buffer>;
  getObjectMetadata(bucketName: string, key: string, credentials: import('../auth/types').AWSCredentials): Promise<S3ObjectMetadata>;
}