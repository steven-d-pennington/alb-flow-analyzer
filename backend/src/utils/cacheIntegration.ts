/**
 * Utility functions for cache integration across the application
 */

import { ProcessingResult } from '../ingestion/types';

// Global cache manager reference - set by main index.ts
declare global {
  var onDataIngestion: ((event: any) => Promise<void>) | undefined;
}

/**
 * Trigger cache invalidation after data ingestion
 */
export async function triggerCacheInvalidation(
  processingResult: ProcessingResult,
  type: 'file' | 's3' | 'stream' = 'file'
): Promise<void> {
  try {
    if (typeof global.onDataIngestion === 'function') {
      const event = {
        type,
        recordCount: processingResult.processedFiles?.length || 0,
        fileSize: Array.isArray(processingResult.processedFiles) 
          ? processingResult.processedFiles.reduce((sum: number, f: any) => sum + (f.fileSize || 0), 0)
          : 0,
        timestamp: Date.now()
      };
      
      console.log(`🗄️  Triggering cache invalidation for ${event.recordCount} records`);
      await global.onDataIngestion(event);
      console.log('✅ Cache invalidation completed');
    } else {
      console.log('⚠️  Cache invalidation not available (cache manager not initialized)');
    }
  } catch (error) {
    console.error('❌ Cache invalidation failed:', error);
    // Don't throw - cache invalidation failure shouldn't break ingestion
  }
}

/**
 * Calculate cache invalidation priority based on data volume
 */
export function calculateInvalidationPriority(recordCount: number): 'light' | 'medium' | 'heavy' | 'full' {
  if (recordCount < 1000) {
    return 'light';   // < 1k records - minimal invalidation
  } else if (recordCount < 50000) {
    return 'medium';  // 1k-50k records - moderate invalidation
  } else if (recordCount < 500000) {
    return 'heavy';   // 50k-500k records - aggressive invalidation
  } else {
    return 'full';    // 500k+ records - full cache clear
  }
}

/**
 * Generate cache tags based on ingestion metadata
 */
export function generateCacheTags(
  processingResult: ProcessingResult,
  additionalTags: string[] = []
): string[] {
  const tags = ['ingestion', ...additionalTags];
  
  // Add time-based tags
  const now = new Date();
  tags.push(`hour-${now.getHours()}`);
  tags.push(`day-${now.getDate()}`);
  tags.push(`month-${now.getMonth() + 1}`);
  
  // Add volume-based tags
  const priority = calculateInvalidationPriority(processingResult.processedFiles?.length || 0);
  tags.push(`volume-${priority}`);
  
  // Add file-based tags
  if (Array.isArray(processingResult.processedFiles) && processingResult.processedFiles.length > 0) {
    tags.push(`files-${processingResult.processedFiles.length}`);
  }
  
  return tags;
}

/**
 * Smart cache preloading after ingestion
 */
export async function schedulePostIngestionWarmup(
  processingResult: ProcessingResult,
  delay: number = 5000 // 5 second delay
): Promise<void> {
  setTimeout(async () => {
    try {
      // This would trigger cache warming for frequently accessed data
      // For now, just log the intention
      console.log(`🔥 Post-ingestion cache warmup scheduled for ${processingResult.processedFiles?.length || 0} files`);
      
      // In a real implementation, this would:
      // 1. Identify which caches are most likely to be accessed
      // 2. Pre-compute expensive aggregations
      // 3. Warm up dashboard queries
      // 4. Preload time-based summaries
      
    } catch (error) {
      console.error('Post-ingestion warmup failed:', error);
    }
  }, delay);
}

/**
 * Cache-aware file processing callback
 */
export function createCacheAwareCallback(
  originalCallback?: (progress: any) => void,
  type: 'file' | 's3' | 'stream' = 'file'
) {
  return async (progress: any) => {
    // Call original callback
    if (originalCallback) {
      originalCallback(progress);
    }
    
    // Handle cache operations on completion
    if (progress.isComplete && progress.result) {
      try {
        // Trigger cache invalidation
        await triggerCacheInvalidation(progress.result, type);
        
        // Schedule post-ingestion warmup
        await schedulePostIngestionWarmup(progress.result);
        
      } catch (error) {
        console.error('Cache-aware callback error:', error);
      }
    }
  };
}