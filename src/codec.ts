import { AudioCodec, VideoCodec } from "./source";

export const buildVideoCodecString = (codec: VideoCodec, width: number, height: number) => {
	if (codec === 'avc') {
		let profileIndication = 0x64; // Default to High Profile

		if (width <= 768 && height <= 432) {
			profileIndication = 0x42; // Baseline for smaller videos
		} else if (width <= 1920 && height <= 1080) {
			profileIndication = 0x4D; // Main for HD
		}

		const profileCompatibility = 0x00;

		// Default to Level 4.1 (0x29) for most content, only bump to Level 5.0 (0x32) for 4K content
		const levelIndication = (width > 1920 || height > 1080) ? 0x32 : 0x29;

		const hexProfileIndication = profileIndication.toString(16).padStart(2, '0');
		const hexProfileCompatibility = profileCompatibility.toString(16).padStart(2, '0');
		const hexLevelIndication = levelIndication.toString(16).padStart(2, '0');

		return `avc1.${hexProfileIndication}${hexProfileCompatibility}${hexLevelIndication}`;
	} else if (codec === 'hevc') {
		// Start with general_profile_space and general_profile_idc
		let profileSpace = 0; // Assuming general_profile_space == 0 (most common)
		let profileIdc = 1;   // Assuming Main Profile (1)
		
		// Generate compatibility flags (32 bits in reverse order)
		// For basic compatibility, we'll set the main profile bit
		const compatibilityFlags = Array(32).fill(0);
		compatibilityFlags[profileIdc] = 1;  // Set bit for current profile
		const compatibilityHex = parseInt(compatibilityFlags.reverse().join(''), 2)
			.toString(16)
			.replace(/^0+/, ''); // Remove leading zeroes
			
		// Determine tier and level based on resolution
		let tier = 'L';  // L for Main Tier, H for High Tier
		let level = 120; // Default level 4.0 (120)
		
		// Adjust level based on resolution (simplified)
		if (width <= 1280 && height <= 720) {
			level = 93;  // Level 3.1
		} else if (width <= 1920 && height <= 1080) {
			level = 120; // Level 4.0
		} else if (width <= 3840 && height <= 2160) {
			level = 150; // Level 5.0
		} else {
			tier = 'H';  // Use High Tier for very high resolutions
			level = 180; // Level 6.0
		}
		
		// Generate constraint flags (6 bytes)
		// Using B0 as a simple default (progressive source flag)
		const constraintFlags = 'B0';
		
		// Construct the final string following the format
		// If profile_space is 0, start with the profile_idc directly
		const profilePrefix = profileSpace === 0 ? '' : 
			String.fromCharCode(65 + profileSpace - 1);
		
		return `hev1.${profilePrefix}${profileIdc}.${compatibilityHex}.${tier}${level}.${constraintFlags}`;
	} else if (codec === 'vp8') {
		return 'vp8'; // Easy, this one
	} else if (codec === 'vp9') {
		// Default to Profile 0 (most common)
        const profile = "00";
        
        // Determine level based on resolution
        // VP9 levels are specified as two digits: major.minor
        let level;
        if (width <= 854 && height <= 480) {
            level = "21"; // Level 2.1
        } else if (width <= 1280 && height <= 720) {
            level = "31"; // Level 3.1
        } else if (width <= 1920 && height <= 1080) {
            level = "41"; // Level 4.1
        } else if (width <= 3840 && height <= 2160) {
            level = "51"; // Level 5.1
        } else {
            level = "61"; // Level 6.1
        }
        
        // Default to 8-bit depth
        const bitDepth = "08";
        
        return `vp09.${profile}.${level}.${bitDepth}`;
	} else if (codec === 'av1') {
		// Default to Main Profile (0)
        const profile = 0;
        
        // Determine level based on resolution
        // Using a simplified level selection based on common resolutions
        let level;
        if (width <= 854 && height <= 480) {
            level = "01"; // Level 2.1
        } else if (width <= 1280 && height <= 720) {
            level = "03"; // Level 2.3
        } else if (width <= 1920 && height <= 1080) {
            level = "04"; // Level 3.0
        } else if (width <= 3840 && height <= 2160) {
            level = "07"; // Level 4.0
        } else {
            level = "09"; // Level 4.2
        }
        
        // Default to Main tier
        const tier = "M";
        
        // Default to 8-bit depth
        const bitDepth = "08";
	
        return `av01.${profile}.${level}${tier}.${bitDepth}`;
	}

	throw new Error(`Unhandled codec '${codec}'.`);
};

export const buildAudioCodecString = (codec: AudioCodec, numberOfChannels: number, sampleRate: number) => {
	if (codec === 'aac') {
		// If stereo or higher channels and lower sample rate, likely using HE-AAC v2 with PS
		if (numberOfChannels >= 2 && sampleRate <= 24000) {
			return 'mp4a.40.29'; // HE-AAC v2 (AAC LC + SBR + PS)
		}

		// If sample rate is low, likely using HE-AAC v1 with SBR
		if (sampleRate <= 24000) {
			return 'mp4a.40.5'; // HE-AAC v1 (AAC LC + SBR)
		}

		// Default to standard AAC-LC for higher sample rates
		return 'mp4a.40.2'; // AAC-LC
	} else if (codec === 'opus') {
		return 'opus'; // Easy, this one
	} else if (codec === 'vorbis') {
		return 'vorbis'; // Also easy, this one
	}

	throw new Error(`Unhandled codec '${codec}'.`);
};