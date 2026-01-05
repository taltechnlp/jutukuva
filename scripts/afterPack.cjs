const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * electron-builder afterPack hook
 * - macOS: Copies sherpa-onnx dylibs to the Frameworks directory
 * - Linux: Verifies sherpa-libs are present and fixes RPATH if needed
 * This ensures the native module can find its dependencies at runtime
 */
exports.default = async function(context) {
    const platform = context.electronPlatformName;

    if (platform === 'linux') {
        await handleLinux(context);
        return;
    }

    if (platform !== 'darwin') {
        console.log('[afterPack] Skipping platform:', platform);
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

/**
 * Handle Linux builds - verify sherpa-libs and fix RPATH if needed
 */
async function handleLinux(context) {
    const appPath = context.appOutDir;

    console.log('[afterPack] Processing Linux build');
    console.log('[afterPack] App output dir:', appPath);

    const resourcesDir = path.join(appPath, 'resources');
    const sherpaLibsDir = path.join(resourcesDir, 'sherpa-libs');

    // Check if sherpa-libs exists
    if (!fs.existsSync(sherpaLibsDir)) {
        console.error('[afterPack] ERROR: sherpa-libs directory not found at:', sherpaLibsDir);
        return;
    }

    console.log('[afterPack] Found sherpa-libs at:', sherpaLibsDir);

    // List contents
    const files = fs.readdirSync(sherpaLibsDir);
    console.log('[afterPack] sherpa-libs contents:', files);

    // Verify required files exist
    const requiredFiles = ['sherpa-onnx.node', 'libsherpa-onnx-c-api.so', 'libonnxruntime.so'];
    const missingFiles = requiredFiles.filter(f => !files.includes(f));

    if (missingFiles.length > 0) {
        console.error('[afterPack] ERROR: Missing required files:', missingFiles);
        return;
    }

    console.log('[afterPack] All required sherpa-onnx files present');

    // Fix RPATH if patchelf is available
    const nodeModule = path.join(sherpaLibsDir, 'sherpa-onnx.node');
    try {
        // Check current RUNPATH
        const readelfOutput = execSync(`readelf -d "${nodeModule}" 2>/dev/null | grep RUNPATH || echo "no runpath"`, { encoding: 'utf8' });
        console.log('[afterPack] Current RUNPATH:', readelfOutput.trim());

        // If RUNPATH contains $ORIGIN, we're good
        if (readelfOutput.includes('$ORIGIN')) {
            console.log('[afterPack] RPATH already set to $ORIGIN');
        } else {
            // Try to fix with patchelf
            try {
                execSync(`patchelf --set-rpath '$ORIGIN' "${nodeModule}"`, { encoding: 'utf8' });
                console.log('[afterPack] Fixed RPATH to $ORIGIN');
            } catch (e) {
                console.log('[afterPack] Warning: Could not run patchelf (may not be installed):', e.message);
                console.log('[afterPack] The RPATH should have been fixed during npm postinstall');
            }
        }
    } catch (e) {
        console.log('[afterPack] Warning: Could not check RUNPATH:', e.message);
    }

    console.log('[afterPack] Linux setup complete');
}
