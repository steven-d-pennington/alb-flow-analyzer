import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Alert,
  Chip,
  Checkbox,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  CircularProgress,
  Tooltip
} from '@mui/material';
import { S3Bucket, S3Object, S3SearchCriteria, S3BrowserProps } from '../types/s3';
import { S3Service } from '../services/s3Service';
import { IngestionService, IngestionResult, IngestionProgress } from '../services/ingestionService';
// import styles from './S3Browser.module.css';

const S3Browser: React.FC<S3BrowserProps> = ({
  onFilesSelected,
  searchCriteria: initialSearchCriteria,
  onSearchCriteriaChange,
  maxSelections,
  allowMultipleSelection = true,
  onError,
  onBucketSelected,
}) => {
  // Remove the isAuthenticated check since we now allow unauthenticated access with backend fallback
  // const { isAuthenticated } = useAuth();
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [currentBucket, setCurrentBucket] = useState<string | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState<string>('');
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [showingFolders, setShowingFolders] = useState<boolean>(true);
  const [selectedObjects, setSelectedObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, { downloaded: boolean; fileCount: number; lastDownloaded?: Date }>>({})
  const [searchCriteria, setSearchCriteria] = useState<S3SearchCriteria>({
    recursive: false,
    fileExtensions: ['.log', '.gz', '.txt'],
    ...initialSearchCriteria,
  });

  // Ingestion state
  const [showIngestionDialog, setShowIngestionDialog] = useState<boolean>(false);
  const [ingestionInProgress, setIngestionInProgress] = useState<boolean>(false);
  const [ingestionResult, setIngestionResult] = useState<IngestionResult | null>(null);
  const [, setIngestionProgress] = useState<IngestionProgress | null>(null);
  const [selectingFolder, setSelectingFolder] = useState<string | null>(null);

  // Load buckets on component mount - attempt to load buckets using backend fallback credentials
  useEffect(() => {
    loadBuckets();
  }, []);

  // Update search criteria when prop changes
  useEffect(() => {
    if (initialSearchCriteria) {
      setSearchCriteria(prev => ({ ...prev, ...initialSearchCriteria }));
    }
  }, [initialSearchCriteria]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+A or Cmd+A to select all log files
      if ((event.ctrlKey || event.metaKey) && event.key === 'a' && currentBucket && objects.length > 0) {
        event.preventDefault();
        selectAllFiles();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentBucket, objects.length]);

  const loadBuckets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const bucketList = await S3Service.listBuckets();
      setBuckets(bucketList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load buckets';
      setError(errorMessage);
      
      // Check if this is an authentication error and call onError if provided
      if (onError && (
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('credentials') ||
        errorMessage.toLowerCase().includes('auth') ||
        errorMessage.toLowerCase().includes('forbidden') ||
        errorMessage.toLowerCase().includes('access denied')
      )) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Determine if we should show folders or files based on the prefix depth and file extensions
  const shouldShowFolders = (prefix: string): boolean => {
    // If prefix ends with a specific log file pattern (contains time stamps), show files
    const logFilePattern = /\d{8}T\d{4}Z_/;
    if (logFilePattern.test(prefix)) {
      return false;
    }
    
    // If prefix looks like a day folder (year/month/day pattern), show files
    // Example: .../2025/08/01/ should show files
    const dayFolderPattern = /\/\d{4}\/\d{2}\/\d{2}\/?$/;
    if (dayFolderPattern.test(prefix)) {
      return false;
    }
    
    // Otherwise show folders for navigation (including month folders like .../2025/08/)
    return true;
  };

  const loadFolders = async (bucketName: string, prefix: string = '') => {
    setLoading(true);
    setError(null);
    
    try {
      const folderList = await S3Service.listFolders(bucketName, prefix);
      setFolders(folderList);
      setObjects([]); // Clear objects when showing folders
      setCurrentPrefix(prefix);
      setShowingFolders(true);
      
      // Check download status for these folders
      if (folderList.length > 0) {
        const prefixesToCheck = folderList.map(folder => {
          const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
          return cleanPrefix ? `${cleanPrefix}/${folder}` : folder;
        });
        
        const status = await S3Service.checkDownloadStatus(bucketName, prefixesToCheck);
        setDownloadStatus(status);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load folders';
      setError(errorMessage);
      
      if (onError && (
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('credentials') ||
        errorMessage.toLowerCase().includes('auth') ||
        errorMessage.toLowerCase().includes('forbidden') ||
        errorMessage.toLowerCase().includes('access denied')
      )) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadObjects = async (bucketName: string, prefix: string = '') => {
    setLoading(true);
    setError(null);
    
    try {
      const objectList = await S3Service.listObjects(bucketName, prefix);
      setObjects(objectList);
      setFolders([]); // Clear folders when showing objects
      setCurrentPrefix(prefix);
      setShowingFolders(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load objects';
      setError(errorMessage);
      
      // Check if this is an authentication error and call onError if provided
      if (onError && (
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('credentials') ||
        errorMessage.toLowerCase().includes('auth') ||
        errorMessage.toLowerCase().includes('forbidden') ||
        errorMessage.toLowerCase().includes('access denied')
      )) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Intelligently load folders or objects based on the prefix
  const loadContent = async (bucketName: string, prefix: string = '') => {
    if (shouldShowFolders(prefix)) {
      await loadFolders(bucketName, prefix);
    } else {
      await loadObjects(bucketName, prefix);
    }
  };

  const searchObjects = async () => {
    if (!currentBucket) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // If user entered a prefix, navigate to it first
      const targetPrefix = searchCriteria.prefix || currentPrefix;
      
      if (searchCriteria.recursive) {
        // Use recursive search
        const searchResults = await S3Service.searchLogFiles(currentBucket, {
          ...searchCriteria,
          prefix: targetPrefix,
        });
        setObjects(searchResults);
        setCurrentPrefix(targetPrefix);
      } else {
        // Navigate to the prefix and list objects there
        await loadContent(currentBucket, targetPrefix);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search objects');
    } finally {
      setLoading(false);
    }
  };

  const handleBucketSelect = (bucketName: string) => {
    setCurrentBucket(bucketName);
    setCurrentPrefix('');
    setSelectedObjects([]);
    loadContent(bucketName);
    
    // Notify parent component of bucket selection
    if (onBucketSelected) {
      onBucketSelected(bucketName);
    }
  };

  const handleObjectSelect = (object: S3Object) => {
    if (!allowMultipleSelection) {
      setSelectedObjects([object]);
      onFilesSelected([object]);
      return;
    }

    const isSelected = selectedObjects.some(obj => obj.key === object.key);
    let newSelection: S3Object[];

    if (isSelected) {
      newSelection = selectedObjects.filter(obj => obj.key !== object.key);
    } else {
      if (maxSelections && selectedObjects.length >= maxSelections) {
        setError(`Maximum ${maxSelections} files can be selected`);
        return;
      }
      newSelection = [...selectedObjects, object];
    }

    setSelectedObjects(newSelection);
    onFilesSelected(newSelection);
  };

  const handlePrefixNavigation = (prefix: string) => {
    if (currentBucket) {
      setCurrentPrefix(prefix);
      loadContent(currentBucket, prefix);
    }
  };

  const handleSearchCriteriaChange = (updates: Partial<S3SearchCriteria>) => {
    const newCriteria = { ...searchCriteria, ...updates };
    setSearchCriteria(newCriteria);
    onSearchCriteriaChange?.(newCriteria);
  };

  const clearSelection = () => {
    setSelectedObjects([]);
    onFilesSelected([]);
  };

  const selectAllFiles = () => {
    setError(null); // Clear any existing errors
    const filesInCurrentFolder = getFilesInCurrentFolder();
    const logFiles = filesInCurrentFolder.filter(obj => S3Service.isLikelyLogFile(obj.key));
    
    if (logFiles.length === 0) {
      setError('No log files found in current folder');
      return;
    }
    
    // If maxSelections is set, limit the selection
    const filesToSelect = maxSelections 
      ? logFiles.slice(0, maxSelections) 
      : logFiles;
    
    if (maxSelections && logFiles.length > maxSelections) {
      setError(`Only selecting first ${maxSelections} of ${logFiles.length} log files due to limit`);
    }
    
    setSelectedObjects(filesToSelect);
    onFilesSelected(filesToSelect);
  };

  const selectAllVisibleFiles = () => {
    setError(null); // Clear any existing errors
    const filesInCurrentFolder = getFilesInCurrentFolder();
    
    if (filesInCurrentFolder.length === 0) {
      setError('No files found in current folder');
      return;
    }
    
    // If maxSelections is set, limit the selection
    const filesToSelect = maxSelections 
      ? filesInCurrentFolder.slice(0, maxSelections) 
      : filesInCurrentFolder;
    
    if (maxSelections && filesInCurrentFolder.length > maxSelections) {
      setError(`Only selecting first ${maxSelections} of ${filesInCurrentFolder.length} files due to limit`);
    }
    
    setSelectedObjects(filesToSelect);
    onFilesSelected(filesToSelect);
  };

  const selectFolderContents = async (folderPrefix: string) => {
    setError(null);
    setSelectingFolder(folderPrefix);
    
    try {
      // Fetch all files in the folder recursively
      // Ensure we don't have double slashes by removing trailing slash from currentPrefix
      const cleanPrefix = currentPrefix.endsWith('/') ? currentPrefix.slice(0, -1) : currentPrefix;
      const fullPrefix = cleanPrefix ? `${cleanPrefix}/${folderPrefix}` : folderPrefix;
      const { files, totalSize } = await S3Service.getFolderContents(
        currentBucket!,
        fullPrefix,
        searchCriteria.fileExtensions
      );
      
      if (files.length === 0) {
        setError(`No files found in folder ${folderPrefix}`);
        return;
      }
      
      // If maxSelections is set, limit the selection
      const filesToSelect = maxSelections 
        ? files.slice(0, maxSelections) 
        : files;
      
      if (maxSelections && files.length > maxSelections) {
        setError(`Only selecting first ${maxSelections} of ${files.length} files due to limit`);
      }
      
      setSelectedObjects(filesToSelect);
      onFilesSelected(filesToSelect);
      
      // Show success message
      setError(`Selected ${filesToSelect.length} files from folder "${folderPrefix}" (${S3Service.formatFileSize(totalSize)})`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to select folder contents');
    } finally {
      setSelectingFolder(null);
    }
  };

  const selectAllInCurrentFolder = async () => {
    if (!currentBucket) return;
    
    setError(null);
    setLoading(true);
    
    try {
      // Fetch all files in the current folder recursively
      const { files, totalSize } = await S3Service.getFolderContents(
        currentBucket,
        currentPrefix,
        searchCriteria.fileExtensions
      );
      
      if (files.length === 0) {
        setError('No files found in current folder and subfolders');
        return;
      }
      
      // If maxSelections is set, limit the selection
      const filesToSelect = maxSelections 
        ? files.slice(0, maxSelections) 
        : files;
      
      if (maxSelections && files.length > maxSelections) {
        setError(`Only selecting first ${maxSelections} of ${files.length} files due to limit`);
      }
      
      setSelectedObjects(filesToSelect);
      onFilesSelected(filesToSelect);
      
      // Show success message with count and size
      console.log(`Selected ${filesToSelect.length} files (${S3Service.formatFileSize(totalSize)}) from current folder and all subfolders`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to select folder contents');
    } finally {
      setLoading(false);
    }
  };

  const startIngestion = async () => {
    if (!currentBucket || selectedObjects.length === 0) {
      setError('Please select files to ingest');
      return;
    }

    setIngestionInProgress(true);
    setIngestionResult(null);
    setIngestionProgress(null);
    setShowIngestionDialog(true);

    try {
      console.log('Starting ingestion of', selectedObjects.length, 'files from bucket', currentBucket);
      
      const result = await IngestionService.ingestS3Objects({
        bucket: currentBucket,
        objects: selectedObjects,
        options: {
          batchSize: 1000,
          skipMalformedLines: true
        }
      });

      setIngestionResult(result);
      
      if (result.success) {
        // Clear selection after successful ingestion
        clearSelection();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start ingestion');
    } finally {
      setIngestionInProgress(false);
    }
  };

  const closeIngestionDialog = () => {
    setShowIngestionDialog(false);
    setIngestionResult(null);
    setIngestionProgress(null);
  };

  const getBreadcrumbs = () => {
    if (!currentPrefix) return [];
    const parts = currentPrefix.split('/').filter(Boolean);
    const breadcrumbs = [];
    let path = '';
    
    for (const part of parts) {
      path += part + '/';
      breadcrumbs.push({ name: part, path: path.slice(0, -1) });
    }
    
    return breadcrumbs;
  };

  const getFolders = () => {
    // If we're explicitly showing folders, use the dedicated folders state
    if (showingFolders) {
      return folders;
    }
    
    // Otherwise, extract folders from objects (old behavior)
    const folderSet = new Set<string>();
    objects.forEach(obj => {
      const relativePath = currentPrefix ? obj.key.replace(currentPrefix + '/', '') : obj.key;
      const slashIndex = relativePath.indexOf('/');
      if (slashIndex > 0) {
        folderSet.add(relativePath.substring(0, slashIndex));
      }
    });
    return Array.from(folderSet).sort();
  };

  const getFilesInCurrentFolder = () => {
    return objects.filter(obj => {
      const relativePath = currentPrefix ? obj.key.replace(currentPrefix + '/', '') : obj.key;
      return !relativePath.includes('/') && relativePath.length > 0;
    });
  };

  // Remove authentication check - let backend handle credentials fallback

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">S3 Browser</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {currentBucket && (objects.length > 0 || folders.length > 0) && (
            <>
              <Tooltip title="Select all files that appear to be log files (Ctrl+A)">
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={selectAllFiles}
                  disabled={loading}
                >
                  Select All Log Files
                </Button>
              </Tooltip>
              <Tooltip title="Select all files in current folder">
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={selectAllVisibleFiles}
                  disabled={loading}
                >
                  Select All Visible
                </Button>
              </Tooltip>
              <Tooltip title="Select all files in current folder and all subfolders">
                <Button 
                  size="small" 
                  variant="contained"
                  color="secondary"
                  onClick={selectAllInCurrentFolder}
                  disabled={loading}
                >
                  Select Entire Folder
                </Button>
              </Tooltip>
            </>
          )}
          {selectedObjects.length > 0 && (
            <>
              <Typography variant="body2">
                {selectedObjects.length} file(s) selected
              </Typography>
              <Button 
                size="small" 
                variant="contained" 
                color="primary"
                onClick={startIngestion}
                disabled={ingestionInProgress}
              >
                {ingestionInProgress ? 'Ingesting...' : 'Ingest Selected Files'}
              </Button>
              <Button size="small" variant="outlined" onClick={clearSelection}>
                Clear Selection
              </Button>
            </>
          )}
        </Box>
      </Box>

      {error && (
        <Alert 
          severity={error.includes('Selected') ? 'success' : 'error'}
          onClose={() => setError(null)}
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      {/* Bucket Selection */}
      <div className="bucket-selection mb-3">
        <label htmlFor="bucket-select" className="form-label">Select Bucket:</label>
        <select
          id="bucket-select"
          className="form-select"
          value={currentBucket || ''}
          onChange={(e) => handleBucketSelect(e.target.value)}
          disabled={loading}
        >
          <option value="">Choose a bucket...</option>
          {buckets.map(bucket => (
            <option key={bucket.name} value={bucket.name}>
              {bucket.name}
            </option>
          ))}
        </select>
      </div>

      {/* Search Criteria */}
      {currentBucket && (
        <div className="search-criteria mb-3">
          <div className="row">
            <div className="col-md-6">
              <label htmlFor="prefix-input" className="form-label">Prefix:</label>
              <input
                id="prefix-input"
                type="text"
                className="form-control"
                value={searchCriteria.prefix || ''}
                onChange={(e) => handleSearchCriteriaChange({ prefix: e.target.value })}
                placeholder="e.g., logs/2024/"
              />
            </div>
            <div className="col-md-6">
              <label htmlFor="extensions-input" className="form-label">File Extensions:</label>
              <input
                id="extensions-input"
                type="text"
                className="form-control"
                value={searchCriteria.fileExtensions?.join(', ') || ''}
                onChange={(e) => handleSearchCriteriaChange({ 
                  fileExtensions: e.target.value.split(',').map(ext => ext.trim()).filter(Boolean)
                })}
                placeholder=".log, .gz, .txt"
              />
            </div>
          </div>
          <div className="row mt-2">
            <div className="col-md-4">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="recursive-search"
                  checked={searchCriteria.recursive}
                  onChange={(e) => handleSearchCriteriaChange({ recursive: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="recursive-search">
                  Recursive Search
                </label>
              </div>
            </div>
            <div className="col-md-8">
              <button
                onClick={() => {
                  if (searchCriteria.prefix && currentBucket) {
                    handlePrefixNavigation(searchCriteria.prefix);
                  }
                }}
                className="btn btn-success me-2"
                disabled={loading || !searchCriteria.prefix}
              >
                Go to Prefix
              </button>
              <button
                onClick={searchObjects}
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button
                onClick={() => currentBucket && loadContent(currentBucket, currentPrefix)}
                className="btn btn-outline-secondary ms-2"
                disabled={loading}
              >
                Reset
              </button>
              {currentBucket && (
                <button
                  onClick={() => currentBucket && (showingFolders ? loadObjects(currentBucket, currentPrefix) : loadFolders(currentBucket, currentPrefix))}
                  className={`btn ms-2 ${showingFolders ? 'btn-outline-primary' : 'btn-outline-success'}`}
                  disabled={loading}
                >
                  {showingFolders ? '📄 Show Files' : '📁 Show Folders'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {currentBucket && (
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <button
                className="btn btn-link p-0"
                onClick={() => handlePrefixNavigation('')}
              >
                {currentBucket}
              </button>
            </li>
            {getBreadcrumbs().map((crumb, index) => (
              <li key={index} className="breadcrumb-item">
                <button
                  className="btn btn-link p-0"
                  onClick={() => handlePrefixNavigation(crumb.path)}
                >
                  {crumb.name}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Object List */}
      {currentBucket && (
        <Box sx={{ mt: 2 }}>
          {loading && (
            <div className="text-center">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          )}

          {!loading && objects.length === 0 && folders.length === 0 && (
            <div className="alert alert-info">
              No objects or folders found in this location.
            </div>
          )}

          {!loading && (objects.length > 0 || folders.length > 0) && (
            <>
              {/* File count information */}
              <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {getFolders().length > 0 && `${getFolders().length} folder(s), `}
                  {getFilesInCurrentFolder().length} file(s) 
                  ({getFilesInCurrentFolder().filter(obj => S3Service.isLikelyLogFile(obj.key)).length} log files)
                </Typography>
              </Box>

              {/* Folders */}
              {getFolders().map(folder => {
                const cleanPrefix = currentPrefix.endsWith('/') ? currentPrefix.slice(0, -1) : currentPrefix;
                const fullPath = cleanPrefix ? `${cleanPrefix}/${folder}` : folder;
                const status = downloadStatus[fullPath];
                const isDownloaded = status?.downloaded || false;
                
                return (
                  <Paper key={folder} sx={{ 
                    p: 1, 
                    mb: 1, 
                    cursor: 'pointer',
                    backgroundColor: isDownloaded ? 'rgba(76, 175, 80, 0.05)' : 'inherit',
                    border: isDownloaded ? '1px solid rgba(76, 175, 80, 0.3)' : undefined
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Button
                        variant="text"
                        sx={{ textAlign: 'left', justifyContent: 'flex-start', flex: 1 }}
                        onClick={() => handlePrefixNavigation(currentPrefix ? `${currentPrefix}/${folder}` : folder)}
                      >
                        📁 {folder}/
                        {isDownloaded && (
                          <Chip 
                            label={`✓ Downloaded (${status.fileCount} files)`}
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ ml: 2 }}
                          />
                        )}
                      </Button>
                      <Tooltip title={
                        isDownloaded 
                          ? `Already downloaded ${status.fileCount} files from ${folder}` 
                          : `Select all files in ${folder} and its subfolders`
                      }>
                        <Button
                          size="small"
                          variant="outlined"
                          color={isDownloaded ? "success" : "primary"}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectFolderContents(folder);
                          }}
                          disabled={loading || selectingFolder !== null}
                          sx={{ ml: 2 }}
                        >
                          {selectingFolder === folder ? (
                            <>
                              <CircularProgress size={16} sx={{ mr: 1 }} />
                              Selecting...
                            </>
                          ) : isDownloaded ? (
                            'Re-download'
                          ) : (
                            'Select Folder'
                          )}
                        </Button>
                      </Tooltip>
                    </Box>
                  </Paper>
                );
              })}

              {/* Files */}
              {getFilesInCurrentFolder().map(object => {
                const isSelected = selectedObjects.some(obj => obj.key === object.key);
                const isLogFile = S3Service.isLikelyLogFile(object.key);
                
                return (
                  <Paper
                    key={object.key}
                    sx={{ 
                      p: 2, 
                      mb: 1, 
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'primary.light' : 'background.paper',
                      border: isLogFile ? '2px solid #4caf50' : '1px solid #e0e0e0'
                    }}
                    onClick={() => handleObjectSelect(object)}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleObjectSelect(object)}
                        />
                        <Typography variant="body2">
                          {isLogFile ? '📄' : '📋'} {S3Service.getFileName(object.key)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          {S3Service.formatFileSize(object.size)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {object.lastModified.toLocaleDateString()} {object.lastModified.toLocaleTimeString()}
                        </Typography>
                        <Chip label={object.storageClass} size="small" variant="outlined" />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </>
          )}
        </Box>
      )}

      {/* Ingestion Dialog */}
      <Dialog 
        open={showIngestionDialog} 
        onClose={closeIngestionDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          File Ingestion
        </DialogTitle>
        <DialogContent>
          {ingestionInProgress && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Processing {selectedObjects.length} files...
              </Typography>
              <LinearProgress />
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                <Typography variant="caption">
                  Ingesting log files into database...
                </Typography>
              </Box>
            </Box>
          )}

          {ingestionResult && (
            <Box>
              <Alert 
                severity={ingestionResult.success ? 'success' : 'error'}
                sx={{ mb: 2 }}
              >
                {ingestionResult.success 
                  ? `Successfully processed ${ingestionResult.successfulFiles}/${ingestionResult.totalFiles} files`
                  : `Failed to process files`
                }
              </Alert>

              <Typography variant="h6" sx={{ mb: 1 }}>
                Ingestion Summary
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">
                  • Total Files: {ingestionResult.totalFiles}
                </Typography>
                <Typography variant="body2">
                  • Successful: {ingestionResult.successfulFiles}
                </Typography>
                <Typography variant="body2">
                  • Failed: {ingestionResult.failedFiles}
                </Typography>
                <Typography variant="body2">
                  • Total Log Entries: {ingestionResult.totalEntriesProcessed}
                </Typography>
              </Box>

              {ingestionResult.processingResults.length > 0 && (
                <Box>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    File Details
                  </Typography>
                  {ingestionResult.processingResults.map((result, index) => (
                    <Paper key={index} sx={{ p: 1, mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2">
                          {result.filename}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {result.success ? (
                            <>
                              <Chip label="Success" color="success" size="small" />
                              <Typography variant="caption">
                                {result.successfulEntries} entries
                              </Typography>
                            </>
                          ) : (
                            <>
                              <Chip label="Failed" color="error" size="small" />
                              <Typography variant="caption" color="error">
                                {result.error}
                              </Typography>
                            </>
                          )}
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeIngestionDialog}>
            {ingestionInProgress ? 'Cancel' : 'Close'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default S3Browser;