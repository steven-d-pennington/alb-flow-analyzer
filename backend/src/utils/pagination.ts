/**
 * Pagination utilities and middleware for consistent pagination across all ALB Flow Analyzer routes
 */

import { Request, Response, NextFunction } from 'express';

export interface PaginationQuery {
  page?: string;
  limit?: string;
  offset?: string;
  sort?: string;
  order?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  sort?: string;
  order: 'ASC' | 'DESC';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  offset: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextPage?: number;
  prevPage?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  meta?: {
    processingTimeMs?: number;
    queryTimeMs?: number;
    cacheHit?: boolean;
    rawDataPagination?: {
      totalRawRecords: number;
      analyzedRecords: number;
      rawDataPage?: number;
      rawDataTotalPages?: number;
    };
    sessionStats?: {
      total: number;
      running: number;
      completed: number;
      failed: number;
    };
    workflowStats?: any;
  };
}

export interface PaginationConfig {
  defaultLimit?: number;
  maxLimit?: number;
  defaultSort?: string;
  defaultOrder?: 'ASC' | 'DESC';
  allowedSortFields?: string[];
}

/**
 * Default pagination configuration
 */
export const DEFAULT_PAGINATION_CONFIG: Required<PaginationConfig> = {
  defaultLimit: 20,
  maxLimit: 1000,
  defaultSort: 'timestamp',
  defaultOrder: 'DESC',
  allowedSortFields: [
    'id', 'timestamp', 'client_ip', 'request_url', 'elb_status_code', 
    'target_status_code', 'request_processing_time', 'target_processing_time',
    'response_processing_time', 'received_bytes', 'sent_bytes', 'domain_name',
    'created_at'
  ]
};

/**
 * Parse pagination parameters from request query
 */
export function parsePaginationParams(
  query: PaginationQuery, 
  config: PaginationConfig = {}
): PaginationParams {
  const mergedConfig = { ...DEFAULT_PAGINATION_CONFIG, ...config };
  
  // Parse page number (1-based)
  let page = 1;
  if (query.page) {
    const parsedPage = parseInt(query.page, 10);
    if (!isNaN(parsedPage) && parsedPage >= 1) {
      page = parsedPage;
    }
  }

  // Parse limit with bounds checking
  let limit = mergedConfig.defaultLimit;
  if (query.limit) {
    const parsedLimit = parseInt(query.limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, mergedConfig.maxLimit);
    }
  }

  // Parse offset (if provided, takes precedence over page-based calculation)
  let offset = (page - 1) * limit;
  if (query.offset) {
    const parsedOffset = parseInt(query.offset, 10);
    if (!isNaN(parsedOffset) && parsedOffset >= 0) {
      offset = parsedOffset;
      // Recalculate page based on offset and limit
      page = Math.floor(offset / limit) + 1;
    }
  }

  // Parse sort field with validation
  let sort = mergedConfig.defaultSort;
  if (query.sort) {
    const requestedSort = query.sort.toLowerCase().trim();
    if (mergedConfig.allowedSortFields.includes(requestedSort)) {
      sort = requestedSort;
    }
  }

  // Parse sort order
  let order: 'ASC' | 'DESC' = mergedConfig.defaultOrder;
  if (query.order) {
    const requestedOrder = query.order.toUpperCase();
    if (requestedOrder === 'ASC' || requestedOrder === 'DESC') {
      order = requestedOrder;
    }
  }

  return {
    page,
    limit,
    offset,
    sort,
    order
  };
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  params: PaginationParams,
  totalCount: number
): PaginationMeta {
  const totalPages = Math.ceil(totalCount / params.limit);
  const hasNext = params.page < totalPages;
  const hasPrev = params.page > 1;

  return {
    page: params.page,
    limit: params.limit,
    offset: params.offset,
    totalCount,
    totalPages,
    hasNext,
    hasPrev,
    nextPage: hasNext ? params.page + 1 : undefined,
    prevPage: hasPrev ? params.page - 1 : undefined
  };
}

/**
 * Create paginated response object
 */
export function createPaginatedResponse<T>(
  data: T[],
  params: PaginationParams,
  totalCount: number,
  processingTimeMs?: number
): PaginatedResponse<T> {
  const pagination = createPaginationMeta(params, totalCount);
  
  return {
    data,
    pagination,
    meta: processingTimeMs !== undefined ? { processingTimeMs } : undefined
  };
}

/**
 * Express middleware to parse pagination parameters and attach to request
 */
export function paginationMiddleware(config: PaginationConfig = {}) {
  return (req: Request & { pagination?: PaginationParams }, res: Response, next: NextFunction) => {
    try {
      req.pagination = parsePaginationParams(req.query, config);
      next();
    } catch (error) {
      res.status(400).json({
        error: 'Invalid pagination parameters',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Please check your page, limit, offset, sort, and order parameters'
      });
      return;
    }
  };
}

/**
 * Validation middleware for pagination parameters
 */
export function validatePagination(config: PaginationConfig = {}) {
  const mergedConfig = { ...DEFAULT_PAGINATION_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const { page, limit, offset, sort, order } = req.query;
    const errors: string[] = [];

    // Validate page
    if (page !== undefined) {
      const parsedPage = parseInt(page as string, 10);
      if (isNaN(parsedPage) || parsedPage < 1) {
        errors.push('Page must be a positive integer starting from 1');
      }
    }

    // Validate limit
    if (limit !== undefined) {
      const parsedLimit = parseInt(limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        errors.push('Limit must be a positive integer');
      } else if (parsedLimit > mergedConfig.maxLimit) {
        errors.push(`Limit cannot exceed ${mergedConfig.maxLimit}`);
      }
    }

    // Validate offset
    if (offset !== undefined) {
      const parsedOffset = parseInt(offset as string, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        errors.push('Offset must be a non-negative integer');
      }
    }

    // Validate sort field
    if (sort !== undefined) {
      const sortField = (sort as string).toLowerCase().trim();
      if (!mergedConfig.allowedSortFields.includes(sortField)) {
        errors.push(`Invalid sort field. Allowed fields: ${mergedConfig.allowedSortFields.join(', ')}`);
      }
    }

    // Validate sort order
    if (order !== undefined) {
      const sortOrder = (order as string).toUpperCase();
      if (sortOrder !== 'ASC' && sortOrder !== 'DESC') {
        errors.push('Order must be either "ASC" or "DESC"');
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: 'Invalid pagination parameters',
        message: 'One or more pagination parameters are invalid',
        details: errors
      });
      return;
    }

    next();
  };
}

/**
 * Helper to convert database result to FilterCriteria for pagination
 */
export function paginationToFilterCriteria(params: PaginationParams) {
  return {
    limit: params.limit,
    offset: params.offset,
    sortBy: params.sort,
    sortOrder: params.order
  };
}

/**
 * Cursor-based pagination utilities (alternative to offset-based)
 */
export interface CursorPaginationParams {
  limit: number;
  cursor?: string;
  direction: 'forward' | 'backward';
}

export interface CursorPaginationMeta {
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor?: string;
  prevCursor?: string;
  count: number;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: CursorPaginationMeta;
  meta?: {
    processingTimeMs?: number;
    queryTimeMs?: number;
  };
}

/**
 * Parse cursor pagination parameters
 */
export function parseCursorParams(query: any): CursorPaginationParams {
  let limit = 20;
  if (query.limit) {
    const parsedLimit = parseInt(query.limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, 1000);
    }
  }

  const cursor = query.cursor as string | undefined;
  const direction = query.direction === 'backward' ? 'backward' : 'forward';

  return { limit, cursor, direction };
}

/**
 * Create cursor-based pagination response
 */
export function createCursorPaginatedResponse<T>(
  data: T[],
  hasNext: boolean,
  hasPrev: boolean,
  nextCursor?: string,
  prevCursor?: string,
  processingTimeMs?: number
): CursorPaginatedResponse<T> {
  return {
    data,
    pagination: {
      hasNext,
      hasPrev,
      nextCursor,
      prevCursor,
      count: data.length
    },
    meta: processingTimeMs !== undefined ? { processingTimeMs } : undefined
  };
}

/**
 * Stream pagination for very large datasets
 */
export interface StreamPaginationOptions {
  batchSize: number;
  maxBatches?: number;
  onBatch?: (batch: any[], batchNumber: number) => Promise<void>;
  onError?: (error: Error, batchNumber: number) => void;
}

/**
 * Helper for streaming large datasets in batches
 */
export async function streamPaginated<T>(
  queryFunction: (offset: number, limit: number) => Promise<T[]>,
  totalCount: number,
  options: StreamPaginationOptions
): Promise<void> {
  const { batchSize, maxBatches, onBatch, onError } = options;
  let offset = 0;
  let batchNumber = 0;
  const actualMaxBatches = maxBatches || Math.ceil(totalCount / batchSize);

  while (offset < totalCount && batchNumber < actualMaxBatches) {
    try {
      const batch = await queryFunction(offset, batchSize);
      
      if (batch.length === 0) {
        break; // No more data
      }

      if (onBatch) {
        await onBatch(batch, batchNumber + 1);
      }

      offset += batch.length;
      batchNumber++;

      // Break if we got fewer results than requested (end of data)
      if (batch.length < batchSize) {
        break;
      }
    } catch (error) {
      if (onError) {
        onError(error as Error, batchNumber + 1);
      }
      throw error;
    }
  }
}