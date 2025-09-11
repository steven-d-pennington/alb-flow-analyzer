// Parser module exports
import { ALBLogParser } from './LogParser';
export { ALBLogParser } from './LogParser';
export * from './types';

// Factory function for creating parser instances
export function createLogParser(): ALBLogParser {
  return new ALBLogParser();
}