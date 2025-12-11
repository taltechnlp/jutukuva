interface ReleaseAsset {
	name: string;
	browser_download_url: string;
}

interface Release {
	tag_name: string;
	assets: ReleaseAsset[];
}

export type Platform = 'windows' | 'macos' | 'linux';

export function detectPlatform(): Platform {
	const ua = navigator.userAgent.toLowerCase();
	if (ua.includes('win')) return 'windows';
	if (ua.includes('mac')) return 'macos';
	return 'linux';
}

export async function fetchLatestRelease(): Promise<Release> {
	const url =
		import.meta.env.VITE_OVERLAY_RELEASE_URL ||
		'https://api.github.com/repos/aivo0/jutukuva/releases/latest';
	const response = await fetch(url);
	if (!response.ok) throw new Error('Failed to fetch release');
	return response.json();
}

export function getAssetForPlatform(assets: ReleaseAsset[], platform: Platform): ReleaseAsset | null {
	// Match overlay-captions binaries (contain "Subtiitrid" in name)
	// Naming pattern: Jutukuva.Subtiitrid_0.4.1_{arch}.{ext}
	const subtiitridAssets = assets.filter((a) => a.name.includes('Subtiitrid'));

	const patterns: Record<Platform, RegExp> = {
		windows: /\.exe$/i,
		macos: /\.dmg$/i,
		linux: /\.AppImage$/i
	};

	return subtiitridAssets.find((a) => patterns[platform].test(a.name)) || null;
}
