import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { getModelsDirectory, getModelPath, MODEL_INFO } from './sherpa-config.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Check if the model is already downloaded and valid
 */
export async function isModelDownloaded() {
  const modelDir = getModelPath(MODEL_INFO.name);

  if (!fs.existsSync(modelDir)) {
    return false;
  }

  // Check all required files exist and have non-zero size
  for (const filename of MODEL_INFO.files) {
    const filePath = path.join(modelDir, filename);
    if (!fs.existsSync(filePath)) {
      console.log('[ASR] Missing model file:', filename);
      return false;
    }
    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      console.log('[ASR] Empty model file:', filename);
      return false;
    }
  }

  console.log('[ASR] Model already downloaded at:', modelDir);
  return true;
}

/**
 * Get the total size of model files to download
 */
async function getFileSizes() {
  const sizes = {};
  let totalSize = 0;

  for (const filename of MODEL_INFO.files) {
    try {
      const url = MODEL_INFO.getDownloadUrl(filename);
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        const size = parseInt(response.headers.get('content-length') || '0', 10);
        sizes[filename] = size;
        totalSize += size;
      }
    } catch (error) {
      console.warn('[ASR] Could not get size for:', filename, error.message);
    }
  }

  return { sizes, totalSize };
}

/**
 * Download a single file with retry logic
 */
async function downloadFile(url, destPath, onProgress) {
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[ASR] Downloading ${path.basename(destPath)} (attempt ${attempt}/${MAX_RETRIES})`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      let downloadedBytes = 0;

      // Create write stream
      const fileStream = fs.createWriteStream(destPath);

      // Read response body as stream
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Write chunk to file
        fileStream.write(Buffer.from(value));
        downloadedBytes += value.length;

        // Report progress
        if (onProgress && contentLength > 0) {
          onProgress({
            file: path.basename(destPath),
            fileProgress: Math.round((downloadedBytes / contentLength) * 100),
            downloadedBytes,
            totalBytes: contentLength
          });
        }
      }

      // Close file stream
      await new Promise((resolve, reject) => {
        fileStream.end();
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });

      console.log(`[ASR] Downloaded ${path.basename(destPath)} (${downloadedBytes} bytes)`);
      return;
    } catch (error) {
      console.error(`[ASR] Download failed (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

      // Clean up partial file
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }

      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to download ${path.basename(destPath)} after ${MAX_RETRIES} attempts: ${error.message}`);
      }

      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
}

/**
 * Download the ASR model from HuggingFace
 * @param {Function} onProgress - Callback for progress updates: { overallProgress: 0-100, currentFile, fileProgress }
 * @returns {Promise<string>} - Path to the downloaded model directory
 */
export async function downloadModel(onProgress) {
  const modelDir = getModelPath(MODEL_INFO.name);

  console.log('[ASR] Starting model download to:', modelDir);
  console.log('[ASR] Model files:', MODEL_INFO.files);

  // Create model directory
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  // Get file sizes for progress calculation
  const { sizes, totalSize } = await getFileSizes();
  console.log('[ASR] Total download size:', Math.round(totalSize / 1024 / 1024), 'MB');

  let downloadedTotal = 0;
  let completedFiles = 0;

  // Download each file
  for (const filename of MODEL_INFO.files) {
    const url = MODEL_INFO.getDownloadUrl(filename);
    const destPath = path.join(modelDir, filename);

    // Skip if file already exists and has correct size
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (sizes[filename] && stat.size === sizes[filename]) {
        console.log('[ASR] Skipping already downloaded:', filename);
        downloadedTotal += stat.size;
        completedFiles++;
        if (onProgress) {
          onProgress({
            overallProgress: Math.round((downloadedTotal / totalSize) * 100),
            currentFile: filename,
            fileProgress: 100,
            completedFiles,
            totalFiles: MODEL_INFO.files.length
          });
        }
        continue;
      }
    }

    const fileStartBytes = downloadedTotal;

    await downloadFile(url, destPath, (fileInfo) => {
      if (onProgress && totalSize > 0) {
        const currentTotal = fileStartBytes + fileInfo.downloadedBytes;
        onProgress({
          overallProgress: Math.round((currentTotal / totalSize) * 100),
          currentFile: filename,
          fileProgress: fileInfo.fileProgress,
          completedFiles,
          totalFiles: MODEL_INFO.files.length
        });
      }
    });

    downloadedTotal += sizes[filename] || 0;
    completedFiles++;

    if (onProgress) {
      onProgress({
        overallProgress: Math.round((downloadedTotal / totalSize) * 100),
        currentFile: filename,
        fileProgress: 100,
        completedFiles,
        totalFiles: MODEL_INFO.files.length
      });
    }
  }

  console.log('[ASR] Model download complete:', modelDir);
  return modelDir;
}

/**
 * Delete the downloaded model (for cleanup/re-download)
 */
export async function deleteModel() {
  const modelDir = getModelPath(MODEL_INFO.name);
  if (fs.existsSync(modelDir)) {
    fs.rmSync(modelDir, { recursive: true });
    console.log('[ASR] Deleted model:', modelDir);
  }
}

/**
 * Get model information
 */
export function getModelInfo() {
  const modelDir = getModelPath(MODEL_INFO.name);
  const isDownloaded = fs.existsSync(modelDir);

  let totalSize = 0;
  if (isDownloaded) {
    for (const filename of MODEL_INFO.files) {
      const filePath = path.join(modelDir, filename);
      if (fs.existsSync(filePath)) {
        totalSize += fs.statSync(filePath).size;
      }
    }
  }

  return {
    name: MODEL_INFO.name,
    isDownloaded,
    modelDir: isDownloaded ? modelDir : null,
    totalSize,
    files: MODEL_INFO.files
  };
}
