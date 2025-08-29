class AudioSteganography {
    constructor() {
        this.originalImageData = null;
        this.audioBuffer = null;
        this.audioBits = null;
        this.usedPixels = new Set();
        this.stegoImageData = null;
        this.enhancedImageData = null;
        
        this.initializeEventListeners();
        this.log('step1Logs', 'System initialized', 'info');
    }
    
    initializeEventListeners() {
        document.getElementById('imageInput').addEventListener('change', this.loadImage.bind(this));
        document.getElementById('audioInput').addEventListener('change', this.loadAudio.bind(this));
        document.getElementById('hideAudioBtn').addEventListener('click', this.hideAudioInImage.bind(this));
        document.getElementById('enhanceBtn').addEventListener('click', this.enhanceWithAI.bind(this));
        document.getElementById('extractBtn').addEventListener('click', this.extractAndVerifyAudio.bind(this));
        document.getElementById('playOriginalBtn').addEventListener('click', this.playOriginalAudio.bind(this));
        document.getElementById('playExtractedBtn').addEventListener('click', this.playExtractedAudio.bind(this));
    }
    
    log(containerId, message, type = 'info') {
        const container = document.getElementById(containerId);
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        console.log(`[${type.toUpperCase()}] ${message}`);
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
        
        this.log('step1Logs', `Loading image: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`, 'info');
        
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.getElementById('originalCanvas');
                const ctx = canvas.getContext('2d');
                
                // Resize canvas to fit image while maintaining aspect ratio
                const maxWidth = 400;
                const maxHeight = 300;
                const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                this.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                this.log('step1Logs', `Image loaded: ${canvas.width}x${canvas.height} pixels (${this.originalImageData.data.length / 4} total pixels)`, 'success');
                this.checkReadyToHide();
                resolve();
            };
            img.src = URL.createObjectURL(file);
        });
    }
    
    async loadAudio(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.log('step1Logs', `Loading audio: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`, 'info');
        
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        try {
            this.audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            this.log('step1Logs', `Audio loaded: ${this.audioBuffer.duration.toFixed(2)}s, ${this.audioBuffer.sampleRate}Hz, ${this.audioBuffer.numberOfChannels} channels`, 'success');
            
            // Convert audio to bits for steganography
            this.convertAudioToBits();
            this.checkReadyToHide();
        } catch (error) {
            this.log('step1Logs', `Error loading audio: ${error.message}`, 'error');
        }
    }
    
    convertAudioToBits() {
        const channelData = this.audioBuffer.getChannelData(0); // Use first channel
        const samples = new Int16Array(channelData.length);
        
        // Convert float samples to 16-bit integers
        for (let i = 0; i < channelData.length; i++) {
            samples[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32767));
        }
        
        // Convert to binary string
        let binaryString = '';
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i] & 0xFFFF; // Ensure 16-bit
            binaryString += sample.toString(2).padStart(16, '0');
        }
        
        // Add header with sample rate, length, and checksum
        const header = {
            sampleRate: this.audioBuffer.sampleRate,
            length: samples.length,
            channels: this.audioBuffer.numberOfChannels,
            checksum: this.calculateChecksum(samples)
        };
        
        const headerString = JSON.stringify(header);
        const headerBinary = Array.from(headerString).map(char => 
            char.charCodeAt(0).toString(2).padStart(8, '0')
        ).join('');
        
        // Combine header length, header, and audio data
        const headerLengthBinary = headerBinary.length.toString(2).padStart(32, '0');
        this.audioBits = headerLengthBinary + headerBinary + binaryString;
        
        this.log('step1Logs', `Audio converted to ${this.audioBits.length} bits (${(this.audioBits.length / 8 / 1024).toFixed(2)}KB)`, 'info');
    }
    
    calculateChecksum(samples) {
        let checksum = 0;
        for (let i = 0; i < samples.length; i++) {
            checksum = (checksum + samples[i]) & 0xFFFFFFFF;
        }
        return checksum;
    }
    
    checkReadyToHide() {
        const ready = this.originalImageData && this.audioBits;
        document.getElementById('hideAudioBtn').disabled = !ready;
        
        if (ready) {
            const totalPixels = this.originalImageData.width * this.originalImageData.height;
            const bitsNeeded = this.audioBits.length;
            const pixelsNeeded = Math.ceil(bitsNeeded / 3); // 3 bits per pixel (RGB)
            
            if (pixelsNeeded > totalPixels) {
                this.log('step1Logs', `Error: Need ${pixelsNeeded} pixels but only have ${totalPixels}`, 'error');
                document.getElementById('hideAudioBtn').disabled = true;
            } else {
                this.log('step1Logs', `Ready to hide audio: ${pixelsNeeded}/${totalPixels} pixels needed (${(pixelsNeeded/totalPixels*100).toFixed(1)}%)`, 'success');
            }
        }
    }
    
    async hideAudioInImage() {
        this.log('step2Logs', 'Starting audio steganography process...', 'info');
        
        // Analyze pixel uniqueness to find least common pixels
        const pixelFrequency = this.analyzePixelFrequency();
        const sortedPixels = this.findLeastCommonPixels(pixelFrequency);
        
        this.log('step2Logs', `Analyzed ${Object.keys(pixelFrequency).length} unique pixel colors`, 'info');
        
        // Create copy of original image data
        this.stegoImageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        
        // Hide audio bits in least common pixels
        this.usedPixels.clear();
        let bitIndex = 0;
        let pixelsUsed = 0;
        
        for (const pixelInfo of sortedPixels) {
            if (bitIndex >= this.audioBits.length) break;
            
            const { indices } = pixelInfo;
            
            for (const pixelIndex of indices) {
                if (bitIndex >= this.audioBits.length) break;
                
                const dataIndex = pixelIndex * 4;
                
                // Hide 3 bits per pixel in RGB channels (LSB)
                if (bitIndex < this.audioBits.length) {
                    this.stegoImageData.data[dataIndex] = (this.stegoImageData.data[dataIndex] & 0xFE) | parseInt(this.audioBits[bitIndex]);
                    bitIndex++;
                }
                if (bitIndex < this.audioBits.length) {
                    this.stegoImageData.data[dataIndex + 1] = (this.stegoImageData.data[dataIndex + 1] & 0xFE) | parseInt(this.audioBits[bitIndex]);
                    bitIndex++;
                }
                if (bitIndex < this.audioBits.length) {
                    this.stegoImageData.data[dataIndex + 2] = (this.stegoImageData.data[dataIndex + 2] & 0xFE) | parseInt(this.audioBits[bitIndex]);
                    bitIndex++;
                }
                
                this.usedPixels.add(pixelIndex);
                pixelsUsed++;
            }
        }
        
        // Display steganographic image
        const stegoCanvas = document.getElementById('stegoCanvas');
        stegoCanvas.width = this.stegoImageData.width;
        stegoCanvas.height = this.stegoImageData.height;
        const stegoCtx = stegoCanvas.getContext('2d');
        stegoCtx.putImageData(this.stegoImageData, 0, 0);
        
        // Create and display pixel usage map
        this.createPixelUsageMap();
        
        const stats = {
            'Audio Bits': this.audioBits.length.toLocaleString(),
            'Pixels Used': pixelsUsed.toLocaleString(),
            'Total Pixels': (this.stegoImageData.width * this.stegoImageData.height).toLocaleString(),
            'Usage %': ((pixelsUsed / (this.stegoImageData.width * this.stegoImageData.height)) * 100).toFixed(2) + '%',
            'Bits per Pixel': (this.audioBits.length / pixelsUsed).toFixed(2)
        };
        
        this.updateStats('hideStats', stats);
        
        this.log('step2Logs', `Successfully hid ${this.audioBits.length} audio bits in ${pixelsUsed} pixels`, 'success');
        this.log('step2Logs', `Steganographic image ready for AI enhancement`, 'success');
        
        document.getElementById('enhanceBtn').disabled = false;
        document.getElementById('extractBtn').disabled = false;
    }
    
    analyzePixelFrequency() {
        const frequency = {};
        const data = this.originalImageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const color = `${r},${g},${b}`;
            
            if (!frequency[color]) {
                frequency[color] = { count: 0, indices: [] };
            }
            frequency[color].count++;
            frequency[color].indices.push(i / 4);
        }
        
        return frequency;
    }
    
    findLeastCommonPixels(frequency) {
        return Object.entries(frequency)
            .map(([color, data]) => ({
                color,
                count: data.count,
                indices: data.indices
            }))
            .sort((a, b) => a.count - b.count);
    }
    
    createPixelUsageMap() {
        const usageCanvas = document.getElementById('usageMapCanvas');
        usageCanvas.width = this.stegoImageData.width;
        usageCanvas.height = this.stegoImageData.height;
        const ctx = usageCanvas.getContext('2d');
        
        // Create usage map image data
        const usageData = new ImageData(this.stegoImageData.width, this.stegoImageData.height);
        
        for (let i = 0; i < usageData.data.length; i += 4) {
            const pixelIndex = i / 4;
            
            if (this.usedPixels.has(pixelIndex)) {
                // Red for used pixels
                usageData.data[i] = 255;     // R
                usageData.data[i + 1] = 0;   // G
                usageData.data[i + 2] = 0;   // B
                usageData.data[i + 3] = 128; // A (semi-transparent)
            } else {
                // Transparent for unused pixels
                usageData.data[i] = 0;       // R
                usageData.data[i + 1] = 0;   // G
                usageData.data[i + 2] = 0;   // B
                usageData.data[i + 3] = 0;   // A
            }
        }
        
        ctx.putImageData(usageData, 0, 0);
        
        this.log('step2Logs', `Created pixel usage map showing ${this.usedPixels.size} used pixels in red`, 'info');
    }
    
    async enhanceWithAI() {
        this.log('step3Logs', 'Preparing image for AI enhancement...', 'info');
        
        const prompt = document.getElementById('enhancePrompt').value || 'enhance this image with artistic improvements while preserving the overall composition';
        
        // Convert steganographic image to base64
        const stegoCanvas = document.getElementById('stegoCanvas');
        const imageDataUrl = stegoCanvas.toDataURL('image/png');
        
        // Create detailed preservation instructions for the AI
        const usedPixelsList = Array.from(this.usedPixels);
        const preservationInstructions = `
CRITICAL PRESERVATION REQUIREMENTS:
- This image contains hidden audio data in specific pixels
- You must NOT modify the following ${usedPixelsList.length} pixels that contain audio data
- These pixels are distributed across the image in the least common color regions
- Only enhance pixels that are NOT in the preservation list
- Focus on enhancing unused areas while keeping audio-containing pixels identical
- The audio data is stored in the LSB (least significant bit) of RGB channels
- Any change to the preserved pixels will corrupt the hidden audio data

Enhancement request: ${prompt}

Please enhance only the non-audio pixels to create an artistic version while preserving the steganographic data.
`;
        
        try {
            this.log('step3Logs', `Sending image to AI with preservation instructions for ${usedPixelsList.length} pixels...`, 'info');
            this.log('step3Logs', `Enhancement prompt: "${prompt}"`, 'info');
            
            const result = await websim.imageGen({
                prompt: preservationInstructions,
                image_inputs: [{
                    url: imageDataUrl
                }],
                width: stegoCanvas.width,
                height: stegoCanvas.height
            });
            
            this.log('step3Logs', 'AI enhancement completed successfully', 'success');
            
            // Load the enhanced image
            await this.loadEnhancedImage(result.url);
            
        } catch (error) {
            this.log('step3Logs', `AI enhancement failed: ${error.message}`, 'error');
        }
    }
    
    async loadEnhancedImage(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const enhancedCanvas = document.getElementById('enhancedCanvas');
                enhancedCanvas.width = img.width;
                enhancedCanvas.height = img.height;
                const ctx = enhancedCanvas.getContext('2d');
                
                ctx.drawImage(img, 0, 0);
                this.enhancedImageData = ctx.getImageData(0, 0, img.width, img.height);
                
                this.log('step3Logs', `Enhanced image loaded: ${img.width}x${img.height}`, 'success');
                this.log('step3Logs', 'Ready for audio extraction and verification', 'info');
                
                resolve();
            };
            img.onerror = () => {
                this.log('step3Logs', 'Failed to load enhanced image', 'error');
            };
            img.src = imageUrl;
        });
    }
    
    async extractAndVerifyAudio() {
        this.log('step4Logs', 'Starting audio extraction from enhanced image...', 'info');
        
        if (!this.enhancedImageData) {
            this.log('step4Logs', 'No enhanced image available, using steganographic image', 'warning');
            this.enhancedImageData = this.stegoImageData;
        }
        
        // Extract bits from the same pixels used for hiding
        let extractedBits = '';
        const usedPixelsList = Array.from(this.usedPixels).sort((a, b) => a - b);
        
        for (const pixelIndex of usedPixelsList) {
            const dataIndex = pixelIndex * 4;
            
            // Extract 3 bits per pixel from RGB channels (LSB)
            extractedBits += (this.enhancedImageData.data[dataIndex] & 1).toString();
            extractedBits += (this.enhancedImageData.data[dataIndex + 1] & 1).toString();
            extractedBits += (this.enhancedImageData.data[dataIndex + 2] & 1).toString();
            
            if (extractedBits.length >= this.audioBits.length) {
                break;
            }
        }
        
        // Trim to original length
        extractedBits = extractedBits.substring(0, this.audioBits.length);
        
        this.log('step4Logs', `Extracted ${extractedBits.length} bits from enhanced image`, 'info');
        
        // Compare with original bits
        let matchingBits = 0;
        for (let i = 0; i < this.audioBits.length; i++) {
            if (this.audioBits[i] === extractedBits[i]) {
                matchingBits++;
            }
        }
        
        const accuracy = (matchingBits / this.audioBits.length) * 100;
        
        // Try to reconstruct audio
        try {
            this.extractedAudioBuffer = await this.reconstructAudioFromBits(extractedBits);
            
            const stats = {
                'Extracted Bits': extractedBits.length.toLocaleString(),
                'Matching Bits': matchingBits.toLocaleString(),
                'Accuracy': accuracy.toFixed(2) + '%',
                'Audio Duration': this.extractedAudioBuffer.duration.toFixed(2) + 's',
                'Data Integrity': accuracy > 99 ? 'Excellent' : accuracy > 95 ? 'Good' : accuracy > 90 ? 'Fair' : 'Poor'
            };
            
            this.updateStats('verifyStats', stats);
            
            if (accuracy > 90) {
                this.log('step4Logs', `Audio extraction successful! ${accuracy.toFixed(2)}% data integrity`, 'success');
                document.getElementById('playOriginalBtn').disabled = false;
                document.getElementById('playExtractedBtn').disabled = false;
            } else {
                this.log('step4Logs', `Audio extraction completed with ${accuracy.toFixed(2)}% integrity - may have quality issues`, 'warning');
            }
            
        } catch (error) {
            this.log('step4Logs', `Audio reconstruction failed: ${error.message}`, 'error');
        }
    }
    
    async reconstructAudioFromBits(bits) {
        this.log('step4Logs', 'Reconstructing audio from extracted bits...', 'info');
        
        // Extract header length (first 32 bits)
        const headerLength = parseInt(bits.substring(0, 32), 2);
        this.log('step4Logs', `Header length: ${headerLength} bits`, 'info');
        
        // Extract header
        const headerBinary = bits.substring(32, 32 + headerLength);
        const headerString = this.binaryToString(headerBinary);
        const header = JSON.parse(headerString);
        
        this.log('step4Logs', `Header: ${JSON.stringify(header)}`, 'info');
        
        // Extract audio data
        const audioBinary = bits.substring(32 + headerLength);
        const samples = new Int16Array(header.length);
        
        for (let i = 0; i < header.length; i++) {
            const sampleBinary = audioBinary.substring(i * 16, (i + 1) * 16);
            if (sampleBinary.length === 16) {
                samples[i] = parseInt(sampleBinary, 2);
                // Convert from unsigned to signed
                if (samples[i] > 32767) {
                    samples[i] = samples[i] - 65536;
                }
            }
        }
        
        // Verify checksum
        const extractedChecksum = this.calculateChecksum(samples);
        if (extractedChecksum === header.checksum) {
            this.log('step4Logs', 'Checksum verification passed', 'success');
        } else {
            this.log('step4Logs', 'Checksum verification failed - data may be corrupted', 'warning');
        }
        
        // Create audio buffer
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = audioContext.createBuffer(header.channels, header.length, header.sampleRate);
        
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
            channelData[i] = samples[i] / 32767;
        }
        
        this.log('step4Logs', `Audio buffer reconstructed: ${audioBuffer.duration.toFixed(2)}s`, 'success');
        
        return audioBuffer;
    }
    
    binaryToString(binary) {
        let result = '';
        for (let i = 0; i < binary.length; i += 8) {
            const byte = binary.substring(i, i + 8);
            if (byte.length === 8) {
                result += String.fromCharCode(parseInt(byte, 2));
            }
        }
        return result;
    }
    
    async playOriginalAudio() {
        if (!this.audioBuffer) return;
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(audioContext.destination);
        source.start();
        
        this.log('step4Logs', 'Playing original audio', 'info');
    }
    
    async playExtractedAudio() {
        if (!this.extractedAudioBuffer) return;
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createBufferSource();
        source.buffer = this.extractedAudioBuffer;
        source.connect(audioContext.destination);
        source.start();
        
        this.log('step4Logs', 'Playing extracted audio', 'info');
    }
}

// Initialize the application
const audioStego = new AudioSteganography();

