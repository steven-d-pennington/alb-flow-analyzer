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

export interface S3BrowserState {
  buckets: S3Bucket[];
  currentBucket: string | null;
  currentPrefix: string;
  objects: S3Object[];
  selectedObjects: S3Object[];
  searchCriteria: S3SearchCriteria;
  loading: boolean;
  error: string | null;
}

export interface S3BrowserProps {
  onFilesSelected: (objects: S3Object[]) => void;
  searchCriteria?: Partial<S3SearchCriteria>;
  onSearchCriteriaChange?: (criteria: S3SearchCriteria) => void;
  maxSelections?: number;
  allowMultipleSelection?: boolean;
  onError?: (error: string) => void;
  onBucketSelected?: (bucketName: string | null) => void;
}