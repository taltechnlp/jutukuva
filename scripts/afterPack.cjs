const fs = require('fs');
const path = require('path');

/**
 * electron-builder afterPack hook
 * Copies sherpa-onnx dylibs to the Frameworks directory for macOS builds
 * This ensures the native module can find its dependencies at runtime
 */
exports.default = async function(context) {
    // Only run for macOS builds
    if (context.electronPlatformName !== 'darwin') {
        console.log('[afterPack] Skipping non-macOS platform:', context.electronPlatformName);
        return;
    }

    const appPath = context.appOutDir;
    const arch = context.arch === 1 ? 'x64' : 'arm64'; // electron-builder arch enum: 1=x64, 3=arm64

    console.log('[afterPack] Processing macOS build');
    console.log('[afterPack] App output dir:', appPath);
    console.log('[afterPack] Architecture:', arch);

    // Find the .app bundle
    const appName = context.packager.appInfo.productFilename + '.app';
    const appBundlePath = path.join(appPath, appName);
    const frameworksDir = path.join(appBundlePath, 'Contents', 'Frameworks');
    const resourcesDir = path.join(appBundlePath, 'Contents', 'Resources');
    const sherpaLibsDir = path.join(resourcesDir, 'sherpa-libs');

    console.log('[afterPack] App bundle:', appBundlePath);
    console.log('[afterPack] Frameworks dir:', frameworksDir);
    console.log('[afterPack] Sherpa libs dir:', sherpaLibsDir);

    // Check if sherpa-libs exists
    if (!fs.existsSync(sherpaLibsDir)) {
        console.log('[afterPack] Warning: sherpa-libs directory not found, skipping dylib copy');
        return;
    }

    // Ensure Frameworks directory exists
    if (!fs.existsSync(frameworksDir)) {
        console.log('[afterPack] Creating Frameworks directory');
        fs.mkdirSync(frameworksDir, { recursive: true });
    }

    // List of dylibs to copy/symlink
    const dylibs = [
        'libonnxruntime.1.17.1.dylib',
        'libonnxruntime.dylib',
        'libsherpa-onnx-c-api.dylib',
        'libsherpa-onnx-cxx-api.dylib'
    ];

    for (const dylib of dylibs) {
        const srcPath = path.join(sherpaLibsDir, dylib);
        const dstPath = path.join(frameworksDir, dylib);

        if (fs.existsSync(srcPath)) {
            // Check if source is a symlink
            const srcStats = fs.lstatSync(srcPath);

            if (srcStats.isSymbolicLink()) {
                // If source is a symlink, read its target and create a similar symlink
                const linkTarget = fs.readlinkSync(srcPath);
                console.log('[afterPack] Creating symlink:', dylib, '->', linkTarget);

                // If the symlink points to a file in the same directory, adjust the path
                if (!path.isAbsolute(linkTarget)) {
                    // Relative symlink - create relative symlink pointing to sherpa-libs
                    const relativePath = path.join('..', 'Resources', 'sherpa-libs', linkTarget);
                    fs.symlinkSync(relativePath, dstPath);
                } else {
                    // Absolute symlink - copy the actual file instead
                    const realPath = fs.realpathSync(srcPath);
                    fs.copyFileSync(realPath, dstPath);
                }
            } else {
                // Regular file - create symlink pointing to the file in sherpa-libs
                const relativePath = path.join('..', 'Resources', 'sherpa-libs', dylib);
                console.log('[afterPack] Creating symlink:', dylib, '->', relativePath);
                fs.symlinkSync(relativePath, dstPath);
            }
        } else {
            console.log('[afterPack] Warning: dylib not found:', srcPath);
        }
    }

    console.log('[afterPack] macOS dylib setup complete');
};
