import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediakit';

const selectMediaButton = document.querySelector('button')!;
const fileNameElement = document.querySelector('#file-name')!;
const horizontalRule = document.querySelector('hr')!;
const thumbnailContainer = document.querySelector('#thumbnail-container')!;
const errorElement = document.querySelector('#error-element')!;

const THUMBNAIL_COUNT = 16;
const THUMBNAIL_SIZE = 200;

const generateThumbnails = async (file: File) => {
	fileNameElement.textContent = file.name;
	horizontalRule.style.display = '';
	errorElement.innerHTML = '';
	thumbnailContainer.innerHTML = '';

	try {
		// Create a new input from the file
		const input = new Input({
			source: new BlobSource(file),
			formats: ALL_FORMATS, // Accept all formats
		});

		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) {
			throw new Error('File has no video track.');
		}

		// Compute width and height of the thumbnails such that the larger dimension is equal to THUMBNAIL_SIZE
		const width = videoTrack.displayWidth > videoTrack.displayHeight
			? THUMBNAIL_SIZE
			: Math.floor(THUMBNAIL_SIZE * videoTrack.displayWidth / videoTrack.displayHeight);
		const height = videoTrack.displayHeight > videoTrack.displayWidth
			? THUMBNAIL_SIZE
			: Math.floor(THUMBNAIL_SIZE * videoTrack.displayHeight / videoTrack.displayWidth);

		// Create thumbnail elements
		const thumbnailElements = [];
		for (let i = 0; i < THUMBNAIL_COUNT; i++) {
			const thumbnailElement = document.createElement('div');
			thumbnailElement.className = 'rounded-lg overflow-hidden bg-gray-100 relative';
			thumbnailElement.style.width = `${width}px`;
			thumbnailElement.style.height = `${height}px`;
			thumbnailElements.push(thumbnailElement);
			thumbnailContainer.append(thumbnailElement);
		}

		// Prepare the timestamps for the thumbnails, equally spaced between the first and last timestamp of the video
		const firstTimestamp = await videoTrack.getFirstTimestamp();
		const lastTimestamp = await videoTrack.computeDuration();
		const timestamps = Array.from(
			{ length: THUMBNAIL_COUNT },
			(_, i) => firstTimestamp + i * (lastTimestamp - firstTimestamp) / THUMBNAIL_COUNT,
		);

		// Create a CanvasSink for extracting resized frames from the video track
		const sink = new CanvasSink(videoTrack, {
			width: Math.floor(width * window.devicePixelRatio),
			height: Math.floor(height * window.devicePixelRatio),
			fit: 'fill',
		});

		// Iterate over all thumbnail canvases
		let i = 0;
		for await (const wrappedCanvas of sink.canvasesAtTimestamps(timestamps)) {
			const container = thumbnailElements[i]!;

			if (wrappedCanvas) {
				const canvasElement = wrappedCanvas.canvas as HTMLCanvasElement;
				canvasElement.className = 'size-full';
				container.append(canvasElement);

				canvasElement.animate(
					[{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }],
					{ duration: 333, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
				);

				const timestampElement = document.createElement('p');
				timestampElement.textContent = wrappedCanvas.timestamp.toFixed(2) + ' s';
				timestampElement.className
                    = 'absolute bottom-0 right-0 bg-black/30 text-white px-1 py-0.5 text-[11px] rounded-tl-lg';
				container.append(timestampElement);
			}

			i++;
		}
	} catch (e) {
		errorElement.textContent = String(e);
		thumbnailContainer.innerHTML = '';
	}
};

selectMediaButton.addEventListener('click', () => {
	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.addEventListener('change', () => {
		const file = fileInput.files?.[0];
		if (!file) {
			return;
		}

		void generateThumbnails(file);
	});

	fileInput.click();
});

document.addEventListener('dragover', (event) => {
	event.preventDefault();
	event.dataTransfer!.dropEffect = 'copy';
});

document.addEventListener('drop', (event) => {
	event.preventDefault();
	const files = event.dataTransfer?.files;
	const file = files && files.length > 0 ? files[0] : undefined;
	if (file) {
		void generateThumbnails(file);
	}
});
