import React, { useState } from 'react';
import S3Browser from '../S3Browser';
import { S3Object, S3SearchCriteria } from '../../types/s3';

const S3BrowserExample: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<S3Object[]>([]);
  const [searchCriteria, setSearchCriteria] = useState<S3SearchCriteria>({
    recursive: false,
    fileExtensions: ['.log', '.gz', '.txt'],
  });

  const handleFilesSelected = (files: S3Object[]) => {
    setSelectedFiles(files);
    console.log('Selected files:', files);
  };

  const handleSearchCriteriaChange = (criteria: S3SearchCriteria) => {
    setSearchCriteria(criteria);
    console.log('Search criteria changed:', criteria);
  };

  return (
    <div className="container mt-4">
      <h2>S3 Browser Example</h2>
      <p>This example demonstrates the S3Browser component functionality.</p>
      
      <div className="row">
        <div className="col-md-8">
          <S3Browser
            onFilesSelected={handleFilesSelected}
            searchCriteria={searchCriteria}
            onSearchCriteriaChange={handleSearchCriteriaChange}
            maxSelections={10}
            allowMultipleSelection={true}
          />
        </div>
        
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h5>Selected Files</h5>
            </div>
            <div className="card-body">
              {selectedFiles.length === 0 ? (
                <p className="text-muted">No files selected</p>
              ) : (
                <ul className="list-group list-group-flush">
                  {selectedFiles.map((file, index) => (
                    <li key={index} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <strong>{file.key.split('/').pop()}</strong>
                          <br />
                          <small className="text-muted">
                            {(file.size / 1024).toFixed(2)} KB
                          </small>
                        </div>
                        <span className="badge bg-primary rounded-pill">
                          {file.storageClass}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          <div className="card mt-3">
            <div className="card-header">
              <h5>Current Search Criteria</h5>
            </div>
            <div className="card-body">
              <p><strong>Prefix:</strong> {searchCriteria.prefix || 'None'}</p>
              <p><strong>Extensions:</strong> {searchCriteria.fileExtensions?.join(', ') || 'None'}</p>
              <p><strong>Recursive:</strong> {searchCriteria.recursive ? 'Yes' : 'No'}</p>
              {searchCriteria.dateRange && (
                <p><strong>Date Range:</strong> {searchCriteria.dateRange.start.toLocaleDateString()} - {searchCriteria.dateRange.end.toLocaleDateString()}</p>
              )}
              {searchCriteria.maxSize && (
                <p><strong>Max Size:</strong> {(searchCriteria.maxSize / 1024 / 1024).toFixed(2)} MB</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default S3BrowserExample;