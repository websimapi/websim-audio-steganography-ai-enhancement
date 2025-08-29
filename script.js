class AudioSteganography {
    constructor() {
        this.originalImage = null;
        this.audioBuffer = null;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.stegoImageData = null;
        this.extractedAudioBuffer = null;
        this.testAudioBuffer = null;
        this.pixelUsageMap = [];
        
        this.initializeEventListeners();
        this.log('step1Logs', 'System initialized', 'info');
    }

    initializeEventListeners() {
        document.getElementById('imageInput').addEventListener('change', this.loadImage.bind(this));
        document.getElementById('audioInput').addEventListener('change', this.loadAudio.bind(this));
        document.getElementById('hideAudioBtn').addEventListener('click', this.hideAudioInImage.bind(this));
        document.getElementById('downloadStegoBtn').addEventListener('click', this.downloadStegoImage.bind(this));
        document.getElementById('enhanceBtn').addEventListener('click', this.enhanceWithAI.bind(this));
        document.getElementById('extractBtn').addEventListener('click', this.extractAndVerifyAudio.bind(this));
        document.getElementById('playOriginalBtn').addEventListener('click', this.playOriginalAudio.bind(this));
        document.getElementById('playExtractedBtn').addEventListener('click', this.playExtractedAudio.bind(this));
        document.getElementById('testImageInput').addEventListener('change', this.loadTestImage.bind(this));
        document.getElementById('testExtractBtn').addEventListener('click', this.extractFromTestImage.bind(this));
        document.getElementById('playTestAudioBtn').addEventListener('click', this.playTestAudio.bind(this));
    }

    log(containerId, message, type = 'info') {
        const container = document.getElementById(containerId);
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        container.appendChild(logEntry);
        container.scrollTop = container.scrollHeight;
        console.log(`[${timestamp}] ${message}`);
    }

    updateStats(containerId, stats) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        Object.entries(stats).forEach(([label, value]) => {
            const statItem = document.createElement('div');
            statItem.className = 'stat-item';
            statItem.innerHTML = `
                <div class="stat-label">${label}</div>
                <div class="stat-value">${value}</div>
            `;
            container.appendChild(statItem);
        });
    }

    async loadImage(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileSize = (file.size / 1024).toFixed(1);
        this.log('step1Logs', `Loading image: ${file.name} (${fileSize}KB)`, 'info');

        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('originalCanvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            this.originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            const totalPixels = canvas.width * canvas.height;
            this.log('step1Logs', `Image loaded: ${canvas.width}x${canvas.height} pixels (${totalPixels} total pixels)`, 'success');
            
            this.checkReadyToHide();
        };

        img.src = URL.createObjectURL(file);
    }

    async loadAudio(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileSize = (file.size / 1024).toFixed(1);
        this.log('step1Logs', `Loading audio: ${file.name} (${fileSize}KB)`, 'info');

        const arrayBuffer = await file.arrayBuffer();
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        const duration = this.audioBuffer.duration.toFixed(2);
        const sampleRate = this.audioBuffer.sampleRate;
        const channels = this.audioBuffer.numberOfChannels;
        
        this.log('step1Logs', `Audio loaded: ${duration}s, ${sampleRate}Hz, ${channels} channels`, 'success');
        
        this.checkReadyToHide();
    }

    checkReadyToHide() {
        const btn = document.getElementById('hideAudioBtn');
        btn.disabled = !(this.originalImage && this.audioBuffer);
    }

    audioBufferToBits(audioBuffer) {
        const channels = [];
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }
        
        const metadata = {
            sampleRate: audioBuffer.sampleRate,
            length: audioBuffer.length,
            numberOfChannels: audioBuffer.numberOfChannels
        };
        
        const metadataString = JSON.stringify(metadata);
        const metadataLength = metadataString.length;
        
        let bitsArray = [];
        
        // Header: metadata length (32 bits)
        for (let i = 31; i >= 0; i--) {
            bitsArray.push((metadataLength >> i) & 1);
        }
        
        // Metadata as bits
        for (let i = 0; i < metadataString.length; i++) {
            const charCode = metadataString.charCodeAt(i);
            for (let j = 7; j >= 0; j--) {
                bitsArray.push((charCode >> j) & 1);
            }
        }
        
        // Audio data as bits
        for (let sample = 0; sample < audioBuffer.length; sample++) {
            for (let channel = 0; channel < channels.length; channel++) {
                const floatSample = channels[channel][sample];
                const intSample = Math.round(floatSample * 32767);
                const clampedSample = Math.max(-32768, Math.min(32767, intSample));
                const unsignedSample = clampedSample + 32768;
                
                for (let bit = 15; bit >= 0; bit--) {
                    bitsArray.push((unsignedSample >> bit) & 1);
                }
            }
        }
        
        return bitsArray;
    }

    bitsToAudioBuffer(bits) {
        try {
            // Read header: metadata length (32 bits)
            let bitIndex = 0;
            let metadataLength = 0;
            for (let i = 0; i < 32; i++) {
                metadataLength = (metadataLength << 1) | bits[bitIndex++];
            }
            
            this.log('step4Logs', `Header length: ${metadataLength} bits`, 'info');
            
            // Read metadata
            let metadataString = '';
            for (let i = 0; i < metadataLength; i++) {
                let charCode = 0;
                for (let j = 0; j < 8; j++) {
                    charCode = (charCode << 1) | bits[bitIndex++];
                }
                metadataString += String.fromCharCode(charCode);
            }
            
            const metadata = JSON.parse(metadataString);
            this.log('step4Logs', `Reconstructing audio: ${metadata.length} samples, ${metadata.numberOfChannels} channels`, 'info');
            
            // Create new audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                metadata.numberOfChannels,
                metadata.length,
                metadata.sampleRate
            );
            
            // Read audio data
            for (let sample = 0; sample < metadata.length; sample++) {
                for (let channel = 0; channel < metadata.numberOfChannels; channel++) {
                    let unsignedSample = 0;
                    for (let bit = 0; bit < 16; bit++) {
                        unsignedSample = (unsignedSample << 1) | bits[bitIndex++];
                    }
                    
                    const signedSample = unsignedSample - 32768;
                    const floatSample = signedSample / 32767;
                    audioBuffer.getChannelData(channel)[sample] = floatSample;
                }
            }
            
            return audioBuffer;
        } catch (error) {
            this.log('step4Logs', `Audio reconstruction failed: ${error.message}`, 'error');
            return null;
        }
    }

    findLeastCommonColors(imageData, numColors = 256) {
        const colorCounts = new Map();
        const data = imageData.data;
        
        // Count RGB color frequencies
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const colorKey = `${r},${g},${b}`;
            colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
        }
        
        // Sort by frequency (ascending - least common first)
        const sortedColors = Array.from(colorCounts.entries())
            .sort((a, b) => a[1] - b[1])
            .slice(0, numColors)
            .map(([colorKey]) => colorKey.split(',').map(Number));
        
        return sortedColors;
    }

    hideAudioInImage() {
        if (!this.originalImage || !this.audioBuffer) {
            this.log('step2Logs', 'Missing image or audio data', 'error');
            return;
        }

        this.log('step2Logs', 'Converting audio to binary data...', 'info');
        const audioBits = this.audioBufferToBits(this.audioBuffer);
        const bitsSize = (audioBits.length / 8 / 1024).toFixed(2);
        this.log('step2Logs', `Audio converted to ${audioBits.length} bits (${bitsSize}KB)`, 'success');

        // Calculate required pixels (3 bits per pixel for RGB)
        const requiredPixels = Math.ceil(audioBits.length / 3);
        const totalPixels = this.originalImage.width * this.originalImage.height;

        if (requiredPixels > totalPixels) {
            this.log('step2Logs', `Error: Need ${requiredPixels} pixels but only have ${totalPixels}. Auto-scaling image...`, 'warning');
            
            // Calculate scale factor (with some extra buffer)
            const scaleFactor = Math.ceil(Math.sqrt(requiredPixels / totalPixels) * 1.5);
            
            const canvas = document.getElementById('originalCanvas');
            const ctx = canvas.getContext('2d');
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Store original image
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCtx.putImageData(this.originalImage, 0, 0);
            
            // Scale up
            const newWidth = canvas.width * scaleFactor;
            const newHeight = canvas.height * scaleFactor;
            canvas.width = newWidth;
            canvas.height = newHeight;
            
            // Draw scaled image
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
            
            // Update original image data
            this.originalImage = ctx.getImageData(0, 0, newWidth, newHeight);
            
            const newTotalPixels = newWidth * newHeight;
            this.log('step2Logs', `Image scaled to ${newWidth}x${newHeight} (${newTotalPixels} pixels)`, 'success');
        }

        // Find least common colors for pixel selection
        this.log('step2Logs', 'Analyzing pixel colors to find optimal hiding locations...', 'info');
        const leastCommonColors = this.findLeastCommonColors(this.originalImage, 1000);
        
        // Create pixel usage map
        this.pixelUsageMap = new Array(this.originalImage.width * this.originalImage.height).fill(false);
        
        // Create copies for steganographic processing
        const stegoData = new Uint8ClampedArray(this.originalImage.data);
        const usageMapData = new Uint8ClampedArray(this.originalImage.data);
        
        let bitIndex = 0;
        let pixelsUsed = 0;
        
        // Process pixels in order of color rarity
        const pixelIndices = [];
        for (let y = 0; y < this.originalImage.height; y++) {
            for (let x = 0; x < this.originalImage.width; x++) {
                const pixelIndex = y * this.originalImage.width + x;
                const dataIndex = pixelIndex * 4;
                const r = stegoData[dataIndex];
                const g = stegoData[dataIndex + 1];
                const b = stegoData[dataIndex + 2];
                const colorKey = `${r},${g},${b}`;
                
                const colorRarity = leastCommonColors.findIndex(color => 
                    color[0] === r && color[1] === g && color[2] === b
                );
                
                pixelIndices.push({ index: pixelIndex, rarity: colorRarity === -1 ? Infinity : colorRarity });
            }
        }
        
        // Sort by rarity (least common first)
        pixelIndices.sort((a, b) => a.rarity - b.rarity);
        
        // Hide data in pixels
        for (const {index: pixelIndex} of pixelIndices) {
            if (bitIndex >= audioBits.length) break;
            
            const dataIndex = pixelIndex * 4;
            
            // Modify RGB channels (1 bit each)
            if (bitIndex < audioBits.length) {
                stegoData[dataIndex] = (stegoData[dataIndex] & 0xFE) | audioBits[bitIndex++];
            }
            if (bitIndex < audioBits.length) {
                stegoData[dataIndex + 1] = (stegoData[dataIndex + 1] & 0xFE) | audioBits[bitIndex++];
            }
            if (bitIndex < audioBits.length) {
                stegoData[dataIndex + 2] = (stegoData[dataIndex + 2] & 0xFE) | audioBits[bitIndex++];
            }
            
            this.pixelUsageMap[pixelIndex] = true;
            pixelsUsed++;
            
            // Mark pixel in usage map (make it red for visibility)
            usageMapData[dataIndex] = 255;     // R
            usageMapData[dataIndex + 1] = 0;   // G
            usageMapData[dataIndex + 2] = 0;   // B
        }
        
        // Create steganographic image
        const stegoCanvas = document.getElementById('stegoCanvas');
        stegoCanvas.width = this.originalImage.width;
        stegoCanvas.height = this.originalImage.height;
        const stegoCtx = stegoCanvas.getContext('2d');
        
        this.stegoImageData = new ImageData(stegoData, this.originalImage.width, this.originalImage.height);
        stegoCtx.putImageData(this.stegoImageData, 0, 0);
        
        // Create usage map visualization
        const usageMapCanvas = document.getElementById('usageMapCanvas');
        usageMapCanvas.width = this.originalImage.width;
        usageMapCanvas.height = this.originalImage.height;
        const usageMapCtx = usageMapCanvas.getContext('2d');
        const usageMapImageData = new ImageData(usageMapData, this.originalImage.width, this.originalImage.height);
        usageMapCtx.putImageData(usageMapImageData, 0, 0);
        
        this.log('step2Logs', `Successfully embedded ${audioBits.length} bits in ${pixelsUsed} pixels`, 'success');
        this.log('step2Logs', `Pixel utilization: ${(pixelsUsed / (this.originalImage.width * this.originalImage.height) * 100).toFixed(2)}%`, 'info');
        
        this.updateStats('hideStats', {
            'Audio Bits': audioBits.length.toLocaleString(),
            'Pixels Used': pixelsUsed.toLocaleString(),
            'Total Pixels': (this.originalImage.width * this.originalImage.height).toLocaleString(),
            'Utilization': `${(pixelsUsed / (this.originalImage.width * this.originalImage.height) * 100).toFixed(2)}%`,
            'Bits per Pixel': (audioBits.length / pixelsUsed).toFixed(2)
        });
        
        document.getElementById('downloadStegoBtn').disabled = false;
        document.getElementById('enhanceBtn').disabled = false;
        document.getElementById('extractBtn').disabled = false;
    }

    downloadStegoImage() {
        if (!this.stegoImageData) {
            this.log('step2Logs', 'No steganographic image to download', 'error');
            return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = this.stegoImageData.width;
        canvas.height = this.stegoImageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(this.stegoImageData, 0, 0);
        
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `stego-image-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.log('step2Logs', 'Steganographic image downloaded', 'success');
        }, 'image/png');
    }

    async enhanceWithAI() {
        if (!this.stegoImageData) {
            this.log('step3Logs', 'No steganographic image to enhance', 'error');
            return;
        }
        
        const prompt = document.getElementById('enhancePrompt').value || 'enhance this image while preserving the exact pixel values where audio data is hidden';
        this.log('step3Logs', 'Starting AI enhancement...', 'info');
        this.log('step3Logs', `Prompt: ${prompt}`, 'info');
        
        try {
            // Convert steganographic image to data URL
            const canvas = document.createElement('canvas');
            canvas.width = this.stegoImageData.width;
            canvas.height = this.stegoImageData.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(this.stegoImageData, 0, 0);
            const imageDataUrl = canvas.toDataURL('image/png');
            
            const enhancedResult = await websim.imageGen({
                prompt: `${prompt}. CRITICAL: Do not modify pixels that contain hidden data. Only enhance the visual appearance while preserving the exact RGB values of pixels used for data storage.`,
                image_inputs: [{ url: imageDataUrl }],
                width: this.stegoImageData.width,
                height: this.stegoImageData.height
            });
            
            // Load enhanced image
            const enhancedImg = new Image();
            enhancedImg.onload = () => {
                const enhancedCanvas = document.getElementById('enhancedCanvas');
                enhancedCanvas.width = enhancedImg.width;
                enhancedCanvas.height = enhancedImg.height;
                const enhancedCtx = enhancedCanvas.getContext('2d');
                enhancedCtx.drawImage(enhancedImg, 0, 0);
                
                // Store enhanced image data for extraction
                this.enhancedImageData = enhancedCtx.getImageData(0, 0, enhancedImg.width, enhancedImg.height);
                
                this.log('step3Logs', 'AI enhancement completed', 'success');
                this.log('step3Logs', `Enhanced image: ${enhancedImg.width}x${enhancedImg.height}`, 'info');
            };
            
            enhancedImg.src = enhancedResult.url;
            
        } catch (error) {
            this.log('step3Logs', `AI enhancement failed: ${error.message}`, 'error');
        }
    }

    extractBitsFromImage(imageData) {
        const bits = [];
        const data = imageData.data;
        
        // Extract bits from pixels in the same order they were embedded
        const pixelIndices = [];
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const pixelIndex = y * imageData.width + x;
                pixelIndices.push(pixelIndex);
            }
        }
        
        // Extract bits from RGB channels
        for (const pixelIndex of pixelIndices) {
            const dataIndex = pixelIndex * 4;
            
            // Extract LSBs from RGB channels
            bits.push(data[dataIndex] & 1);         // R
            bits.push(data[dataIndex + 1] & 1);     // G  
            bits.push(data[dataIndex + 2] & 1);     // B
        }
        
        return bits;
    }

    extractAndVerifyAudio() {
        const imageToExtractFrom = this.enhancedImageData || this.stegoImageData;
        
        if (!imageToExtractFrom) {
            this.log('step4Logs', 'No image available for extraction', 'error');
            return;
        }
        
        this.log('step4Logs', 'Starting audio extraction from enhanced image...', 'info');
        const extractedBits = this.extractBitsFromImage(imageToExtractFrom);
        this.log('step4Logs', `Extracted ${extractedBits.length} bits from enhanced image`, 'success');
        
        this.log('step4Logs', 'Reconstructing audio from extracted bits...', 'info');
        this.extractedAudioBuffer = this.bitsToAudioBuffer(extractedBits);
        
        if (this.extractedAudioBuffer) {
            this.log('step4Logs', 'Audio successfully reconstructed!', 'success');
            
            const originalDuration = this.audioBuffer.duration.toFixed(2);
            const extractedDuration = this.extractedAudioBuffer.duration.toFixed(2);
            
            this.updateStats('verifyStats', {
                'Original Duration': `${originalDuration}s`,
                'Extracted Duration': `${extractedDuration}s`,
                'Sample Rate Match': this.audioBuffer.sampleRate === this.extractedAudioBuffer.sampleRate ? 'Yes' : 'No',
                'Channel Count Match': this.audioBuffer.numberOfChannels === this.extractedAudioBuffer.numberOfChannels ? 'Yes' : 'No'
            });
            
            document.getElementById('playExtractedBtn').disabled = false;
        } else {
            this.log('step4Logs', 'Failed to reconstruct audio', 'error');
        }
        
        document.getElementById('playOriginalBtn').disabled = false;
    }

    playAudioBuffer(audioBuffer) {
        if (!audioBuffer) return;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        source.start();
    }

    playOriginalAudio() {
        this.playAudioBuffer(this.audioBuffer);
        this.log('step4Logs', 'Playing original audio...', 'info');
    }

    playExtractedAudio() {
        this.playAudioBuffer(this.extractedAudioBuffer);
        this.log('step4Logs', 'Playing extracted audio...', 'info');
    }

    async loadTestImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.log('step5Logs', `Loading test image: ${file.name}`, 'info');
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('testCanvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            this.testImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            this.log('step5Logs', `Test image loaded: ${canvas.width}x${canvas.height}`, 'success');
            
            document.getElementById('testExtractBtn').disabled = false;
        };
        
        img.src = URL.createObjectURL(file);
    }

    extractFromTestImage() {
        if (!this.testImageData) {
            this.log('step5Logs', 'No test image loaded', 'error');
            return;
        }
        
        this.log('step5Logs', 'Extracting audio from test image...', 'info');
        const extractedBits = this.extractBitsFromImage(this.testImageData);
        this.log('step5Logs', `Extracted ${extractedBits.length} bits from test image`, 'info');
        
        this.testAudioBuffer = this.bitsToAudioBuffer(extractedBits);
        
        if (this.testAudioBuffer) {
            this.log('step5Logs', 'Audio successfully extracted from test image!', 'success');
            
            this.updateStats('testStats', {
                'Test Duration': `${this.testAudioBuffer.duration.toFixed(2)}s`,
                'Sample Rate': `${this.testAudioBuffer.sampleRate}Hz`,
                'Channels': this.testAudioBuffer.numberOfChannels,
                'Extraction Status': 'Success'
            });
            
            document.getElementById('playTestAudioBtn').disabled = false;
        } else {
            this.log('step5Logs', 'Failed to extract audio from test image', 'error');
            this.updateStats('testStats', {
                'Extraction Status': 'Failed'
            });
        }
    }

    playTestAudio() {
        this.playAudioBuffer(this.testAudioBuffer);
        this.log('step5Logs', 'Playing test audio...', 'info');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new AudioSteganography();
});