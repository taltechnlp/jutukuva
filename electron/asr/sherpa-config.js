import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Get the platform-specific sherpa-onnx library package name
 */
export function getLibraryPackageName() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') {
    return 'sherpa-onnx-darwin-arm64';
  } else if (platform === 'darwin') {
    return 'sherpa-onnx-darwin-x64';
  } else if (platform === 'win32') {
    return 'sherpa-onnx-win-x64';
  } else if (platform === 'linux' && arch === 'arm64') {
    return 'sherpa-onnx-linux-arm64';
  } else {
    return 'sherpa-onnx-linux-x64';
  }
}

/**
 * Get the path to the sherpa-onnx native libraries
 */
export function getLibraryPath() {
  const libPackage = getLibraryPackageName();

  if (app.isPackaged) {
    // In packaged app, libraries are in resources/sherpa-libs
    return path.join(process.resourcesPath, 'sherpa-libs');
  } else {
    // In development, libraries are in node_modules
    return path.join(process.cwd(), 'node_modules', libPackage);
  }
}

/**
 * Setup library paths in environment variables.
 * MUST be called BEFORE requiring sherpa-onnx-node.
 */
export function setupLibraryPath() {
  const libPath = getLibraryPath();
  const platform = process.platform;

  console.log('[ASR] Setting up library path:', libPath);
  console.log('[ASR] Platform:', platform, 'Arch:', process.arch);
  console.log('[ASR] Is packaged:', app.isPackaged);

  // Verify library path exists
  if (!fs.existsSync(libPath)) {
    console.error('[ASR] Library path does not exist:', libPath);
    throw new Error(`Sherpa-onnx libraries not found at ${libPath}`);
  }

  // Set platform-specific environment variables
  if (platform === 'darwin') {
    process.env.DYLD_LIBRARY_PATH = `${libPath}:${process.env.DYLD_LIBRARY_PATH || ''}`;
  } else if (platform === 'linux') {
    process.env.LD_LIBRARY_PATH = `${libPath}:${process.env.LD_LIBRARY_PATH || ''}`;
  } else if (platform === 'win32') {
    process.env.PATH = `${libPath};${process.env.PATH || ''}`;
  }

  return libPath;
}

/**
 * Get the path to store downloaded models
 */
export function getModelsDirectory() {
  return path.join(app.getPath('userData'), 'models');
}

/**
 * Get the path for a specific model
 */
export function getModelPath(modelName) {
  return path.join(getModelsDirectory(), modelName);
}

/**
 * Get the recognizer configuration for the streaming Zipformer model
 * Using fp32 model for better compatibility
 */
export function getRecognizerConfig(modelDir) {
  return {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      transducer: {
        encoder: path.join(modelDir, 'encoder.onnx'),
        decoder: path.join(modelDir, 'decoder.onnx'),
        joiner: path.join(modelDir, 'joiner.onnx'),
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
  };
}

/**
 * Model information
 */
export const MODEL_INFO = {
  name: 'streaming-zipformer-large.et-en',
  huggingFaceRepo: 'TalTechNLP/streaming-zipformer-large.et-en',
  // Using fp32 models for better compatibility with sherpa-onnx-node
  files: [
    'encoder.onnx',
    'decoder.onnx',
    'joiner.onnx',
    'tokens.txt'
  ],
  // Base URL for downloading from HuggingFace
  getDownloadUrl: (filename) =>
    `https://huggingface.co/TalTechNLP/streaming-zipformer-large.et-en/resolve/main/${filename}`
};
