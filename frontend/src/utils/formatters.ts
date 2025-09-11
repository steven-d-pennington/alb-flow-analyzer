/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date to human readable string
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return 'N/A';
  }
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Check if the date is valid
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }
  
  return d.toLocaleString();
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format percentage to string
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}