import React, { useState, useEffect } from 'react';
import { AnalysisResult } from '../types/analysis';
import { 
  AWSLoadTestConfig, 
  ExportOptions, 
  DownloadProgress, 
  EXPORT_FORMATS
} from '../types/export';
import { exportService } from '../services/exportService';

interface ExportInterfaceProps {
  analysisResult: AnalysisResult | null;
  isVisible: boolean;
  onClose: () => void;
}

export const ExportInterface: React.FC<ExportInterfaceProps> = ({
  analysisResult,
  isVisible,
  onClose
}) => {
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    includeCharts: true,
    includeRawData: false
  });
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    isDownloading: false,
    progress: 0
  });
  const [awsLoadTestConfig, setAwsLoadTestConfig] = useState<AWSLoadTestConfig | null>(null);
  const [showConfigPreview, setShowConfigPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = exportService.onProgressUpdate(setDownloadProgress);
    return unsubscribe;
  }, []);

  useEffect(() => {
    setExportOptions(prev => ({ ...prev, format: selectedFormat }));
  }, [selectedFormat]);

  const handleExport = async () => {
    if (!analysisResult) {
      setError('No analysis data available for export');
      return;
    }

    try {
      setError(null);
      const downloadUrl = await exportService.exportData(selectedFormat, exportOptions);
      const selectedFormatObj = EXPORT_FORMATS.find(f => f.id === selectedFormat);
      const filename = `alb-analysis-${new Date().toISOString().split('T')[0]}.${selectedFormatObj?.fileExtension || 'txt'}`;
      
      exportService.downloadFile(downloadUrl, filename);
    } catch (err) {
      setError('Export failed. Please try again.');
    }
  };

  const handlePreviewAWSConfig = async () => {
    if (!analysisResult) {
      setError('No analysis data available for preview');
      return;
    }

    try {
      setError(null);
      const config = await exportService.previewAWSLoadTestConfig(analysisResult);
      setAwsLoadTestConfig(config);
      setShowConfigPreview(true);
    } catch (err) {
      setError('Failed to generate AWS Load Test configuration preview');
    }
  };

  const handleDownloadAWSConfig = async () => {
    if (!analysisResult) return;

    try {
      setError(null);
      const downloadUrl = await exportService.exportData('aws-load-test', exportOptions);
      const filename = `alb-load-test-${new Date().toISOString().split('T')[0]}.jmx`;
      
      exportService.downloadFile(downloadUrl, filename);
    } catch (err) {
      setError('Failed to download JMeter test plan');
    }
  };

  if (!isVisible) return null;

  const selectedFormatObj = EXPORT_FORMATS.find(f => f.id === selectedFormat);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Export Analysis Results</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!analysisResult && (
            <div className="text-center py-8">
              <p className="text-gray-500">No analysis data available. Please process some log files first.</p>
            </div>
          )}

          {analysisResult && (
            <div className="space-y-6">
              {/* Format Selection */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Export Format</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {EXPORT_FORMATS.map((format) => (
                    <div
                      key={format.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedFormat === format.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedFormat(format.id)}
                    >
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="format"
                          value={format.id}
                          checked={selectedFormat === format.id}
                          onChange={() => setSelectedFormat(format.id)}
                          className="mr-3"
                        />
                        <div>
                          <h4 className="font-medium text-gray-900">{format.name}</h4>
                          <p className="text-sm text-gray-600">{format.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Options */}
              {selectedFormat !== 'aws-load-test' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Export Options</h3>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportOptions.includeCharts}
                        onChange={(e) => setExportOptions(prev => ({
                          ...prev,
                          includeCharts: e.target.checked
                        }))}
                        className="mr-2"
                      />
                      <span className="text-gray-700">Include chart data</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportOptions.includeRawData}
                        onChange={(e) => setExportOptions(prev => ({
                          ...prev,
                          includeRawData: e.target.checked
                        }))}
                        className="mr-2"
                      />
                      <span className="text-gray-700">Include raw log entries</span>
                    </label>
                  </div>
                </div>
              )}

              {/* JMeter Test Plan Preview */}
              {selectedFormat === 'aws-load-test' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">JMeter Test Plan</h3>
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">Test Plan Features</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Generated from actual ALB log traffic patterns</li>
                        <li>• Weighted scenarios based on endpoint popularity</li>
                        <li>• Realistic think times based on response times</li>
                        <li>• Proper HTTP headers and parameters</li>
                        <li>• Built-in result collectors and reporting</li>
                      </ul>
                    </div>

                    <button
                      onClick={handlePreviewAWSConfig}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      disabled={!analysisResult}
                    >
                      Preview Test Configuration
                    </button>

                    {showConfigPreview && awsLoadTestConfig && (
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-medium text-gray-900">Test Configuration Summary</h4>
                          <button
                            onClick={handleDownloadAWSConfig}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                          >
                            Download JMeter File (.jmx)
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">Test Name</p>
                            <p className="font-semibold">{awsLoadTestConfig.testName}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Scenarios</p>
                            <p className="font-semibold">{awsLoadTestConfig.scenarios.length}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Concurrent Users</p>
                            <p className="font-semibold">{awsLoadTestConfig.concurrency}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Test Duration</p>
                            <p className="font-semibold">{Math.round((awsLoadTestConfig.rampUpTime + awsLoadTestConfig.holdForTime + awsLoadTestConfig.rampDownTime) / 60)} minutes</p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="text-sm text-gray-600 mb-2"><strong>Test Scenarios:</strong></p>
                          <div className="space-y-1">
                            {awsLoadTestConfig.scenarios.map((scenario, index) => (
                              <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                                <span className="font-medium">{scenario.name}</span> - {scenario.weight}% of traffic
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Download Progress */}
              {downloadProgress.isDownloading && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Download Progress</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Downloading {downloadProgress.fileName}...</span>
                      <span>{downloadProgress.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${downloadProgress.progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Analysis Summary */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Analysis Summary</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Total Requests</p>
                      <p className="font-semibold">{analysisResult.metrics.totalRequests.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Filtered Entries</p>
                      <p className="font-semibold">{analysisResult.filteredEntryCount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Processing Time</p>
                      <p className="font-semibold">{analysisResult.processingTime}ms</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Last Updated</p>
                      <p className="font-semibold">{analysisResult.lastUpdated.toLocaleTimeString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {analysisResult && (
          <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={downloadProgress.isDownloading || selectedFormat === 'aws-load-test'}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {downloadProgress.isDownloading ? 'Exporting...' : `Export ${selectedFormatObj?.name || ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportInterface;