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
                
                // Calculate required pixels if audio is already loaded
                let requiredPixels = 0;
                if (this.audioBits) {
                    requiredPixels = Math.ceil(this.audioBits.length / 3) * 2; // Double the required pixels for safety
                    this.log('step1Logs', `Audio requires ${requiredPixels} pixels for safe storage`, 'info');
                }
                
                // Start with original image dimensions
                let finalWidth = img.width;
                let finalHeight = img.height;
                let totalPixels = finalWidth * finalHeight;
                
                // If we need more pixels, scale up the image significantly
                if (requiredPixels > 0 && totalPixels < requiredPixels) {
                    const scaleFactor = Math.sqrt(requiredPixels / totalPixels) * 1.5; // Add 50% extra buffer
                    finalWidth = Math.floor(img.width * scaleFactor);
                    finalHeight = Math.floor(img.height * scaleFactor);
                    totalPixels = finalWidth * finalHeight;
                    
                    this.log('step1Logs', `Auto-scaling image up by ${scaleFactor.toFixed(2)}x to accommodate audio data`, 'info');
                    this.log('step1Logs', `New dimensions: ${finalWidth}x${finalHeight} (${totalPixels} pixels)`, 'info');
                }
                
                // Apply display scaling if the image is too large for the canvas container
                const maxDisplayWidth = 800;
                const maxDisplayHeight = 600;
                let displayScale = Math.min(maxDisplayWidth / finalWidth, maxDisplayHeight / finalHeight, 1);
                
                canvas.width = finalWidth;
                canvas.height = finalHeight;
                canvas.style.width = Math.floor(finalWidth * displayScale) + 'px';
                canvas.style.height = Math.floor(finalHeight * displayScale) + 'px';
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                this.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                this.log('step1Logs', `Image loaded: ${canvas.width}x${canvas.height} pixels (${this.originalImageData.data.length / 4} total pixels)`, 'success');
                
                if (requiredPixels > 0) {
                    this.log('step1Logs', `Pixel capacity: ${totalPixels} available vs ${requiredPixels} required (${((totalPixels - requiredPixels) / requiredPixels * 100).toFixed(1)}% extra)`, 'success');
                }
                
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
            const pixelsNeeded = Math.ceil(bitsNeeded / 3) * 2; // Double the required pixels for safety
            
            if (pixelsNeeded > totalPixels) {
                this.log('step1Logs', `Need ${pixelsNeeded} pixels but only have ${totalPixels}. Auto-scaling image...`, 'warning');
                this.autoScaleImage(pixelsNeeded);
            } else {
                this.log('step1Logs', `Ready to hide audio: ${pixelsNeeded}/${totalPixels} pixels needed (${(pixelsNeeded/totalPixels*100).toFixed(1)}%)`, 'success');
            }
        }
    }
    
    autoScaleImage(requiredPixels) {
        const canvas = document.getElementById('originalCanvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate scale factor with extra buffer
        const currentPixels = this.originalImageData.width * this.originalImageData.height;
        const scaleFactor = Math.sqrt(requiredPixels / currentPixels) * 1.5; // 50% extra buffer
        
        const newWidth = Math.floor(this.originalImageData.width * scaleFactor);
        const newHeight = Math.floor(this.originalImageData.height * scaleFactor);
        const newTotalPixels = newWidth * newHeight;
        
        this.log('step1Logs', `Scaling image from ${this.originalImageData.width}x${this.originalImageData.height} to ${newWidth}x${newHeight}`, 'info');
        this.log('step1Logs', `Pixel capacity increased from ${currentPixels} to ${newTotalPixels} (+${((newTotalPixels - currentPixels) / currentPixels * 100).toFixed(1)}%)`, 'info');
        
        // Create temporary canvas with original image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.originalImageData.width;
        tempCanvas.height = this.originalImageData.height;
        tempCtx.putImageData(this.originalImageData, 0, 0);
        
        // Resize main canvas and redraw scaled image
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Apply display scaling if needed
        const maxDisplayWidth = 800;
        const maxDisplayHeight = 600;
        let displayScale = Math.min(maxDisplayWidth / newWidth, maxDisplayHeight / newHeight, 1);
        canvas.style.width = Math.floor(newWidth * displayScale) + 'px';
        canvas.style.height = Math.floor(newHeight * displayScale) + 'px';
        
        // Draw scaled image
        ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
        
        // Update image data
        this.originalImageData = ctx.getImageData(0, 0, newWidth, newHeight);
        
        this.log('step1Logs', `Image auto-scaled successfully: ${newTotalPixels} pixels now available vs ${requiredPixels} required`, 'success');
        this.log('step1Logs', `Ready to hide audio with ${((newTotalPixels - requiredPixels) / requiredPixels * 100).toFixed(1)}% extra capacity`, 'success');
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
        
        // Hide audio bits in least common pixels using frequency order for better visibility
        this.usedPixels.clear();
        this.pixelOrder = []; // Track exact order of pixels used
        
        let bitIndex = 0;
        let pixelsUsed = 0;
        let pixelsModified = 0;
        
        // Use least common pixels first (more visible changes)
        for (let colorData of sortedPixels) {
            if (bitIndex >= this.audioBits.length) break;
            
            for (let pixelIndex of colorData.indices) {
                if (bitIndex >= this.audioBits.length) break;
                
                const dataIndex = pixelIndex * 4;
                
                // Store original values to check for actual changes
                const originalR = this.stegoImageData.data[dataIndex];
                const originalG = this.stegoImageData.data[dataIndex + 1];
                const originalB = this.stegoImageData.data[dataIndex + 2];
                
                // Hide 3 bits per pixel in RGB channels - modify more significantly for visibility
                if (bitIndex < this.audioBits.length) {
                    // Modify multiple bits for visibility (not just LSB)
                    this.stegoImageData.data[dataIndex] = (this.stegoImageData.data[dataIndex] & 0xFC) | (parseInt(this.audioBits[bitIndex]) ? 3 : 0);
                    bitIndex++;
                }
                if (bitIndex < this.audioBits.length) {
                    this.stegoImageData.data[dataIndex + 1] = (this.stegoImageData.data[dataIndex + 1] & 0xFC) | (parseInt(this.audioBits[bitIndex]) ? 3 : 0);
                    bitIndex++;
                }
                if (bitIndex < this.audioBits.length) {
                    this.stegoImageData.data[dataIndex + 2] = (this.stegoImageData.data[dataIndex + 2] & 0xFC) | (parseInt(this.audioBits[bitIndex]) ? 3 : 0);
                    bitIndex++;
                }
                
                // Check if pixel was actually modified
                if (originalR !== this.stegoImageData.data[dataIndex] || 
                    originalG !== this.stegoImageData.data[dataIndex + 1] || 
                    originalB !== this.stegoImageData.data[dataIndex + 2]) {
                    pixelsModified++;
                }
                
                this.usedPixels.add(pixelIndex);
                this.pixelOrder.push(pixelIndex);
                pixelsUsed++;
                
                if (pixelIndex < 5) {
                    console.log(`DEBUG: First few pixels - Index ${pixelIndex}: RGB(${this.stegoImageData.data[dataIndex]}, ${this.stegoImageData.data[dataIndex + 1]}, ${this.stegoImageData.data[dataIndex + 2]})`);
                }
            }
        }
        
        console.log('DEBUG: Bits hidden:', bitIndex);
        console.log('DEBUG: Pixels used:', pixelsUsed);
        console.log('DEBUG: First 10 audio bits:', this.audioBits.substring(0, 10));
        
        // Display steganographic image with proper scaling
        const stegoCanvas = document.getElementById('stegoCanvas');
        stegoCanvas.width = this.stegoImageData.width;
        stegoCanvas.height = this.stegoImageData.height;
        
        // Apply display scaling matching the original canvas
        const originalCanvas = document.getElementById('originalCanvas');
        stegoCanvas.style.width = originalCanvas.style.width;
        stegoCanvas.style.height = originalCanvas.style.height;
        
        const stegoCtx = stegoCanvas.getContext('2d');
        
        // Force canvas refresh with proper image smoothing settings
        stegoCtx.imageSmoothingEnabled = false;
        stegoCtx.clearRect(0, 0, stegoCanvas.width, stegoCanvas.height);
        
        // Put the modified image data directly
        stegoCtx.putImageData(this.stegoImageData, 0, 0);
        
        this.log('step2Logs', `Steganographic image rendered: ${stegoCanvas.width}x${stegoCanvas.height}`, 'success');
        
        // Verify changes by comparing a few pixels
        const origCanvas = document.getElementById('originalCanvas');
        const originalCtx = origCanvas.getContext('2d');
        const originalCheck = originalCtx.getImageData(0, 0, 10, 1);
        const stegoCheck = stegoCtx.getImageData(0, 0, 10, 1);
        
        let differences = 0;
        for (let i = 0; i < 30; i++) { // Check first 10 pixels RGB only
            if (originalCheck.data[i] !== stegoCheck.data[i]) {
                differences++;
            }
        }
        
        this.log('step2Logs', `Visual verification: ${differences} pixel channel differences detected in first 10 pixels`, differences > 0 ? 'success' : 'warning');
        
        // Create and display pixel usage map
        this.createPixelUsageMap();
        
        const stats = {
            'Audio Bits': this.audioBits.length.toLocaleString(),
            'Pixels Used': pixelsUsed.toLocaleString(),
            'Pixels Modified': pixelsModified.toLocaleString(),
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
        
        // Apply same display scaling as other canvases
        const originalCanvas = document.getElementById('originalCanvas');
        usageCanvas.style.width = originalCanvas.style.width;
        usageCanvas.style.height = originalCanvas.style.height;
        
        const ctx = usageCanvas.getContext('2d');
        
        // Start with the original image as background
        ctx.putImageData(this.originalImageData, 0, 0);
        
        // Overlay red highlights on pixels that contain audio data
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        
        // Highlight each used pixel
        for (let pixelIndex of this.usedPixels) {
            const x = pixelIndex % this.stegoImageData.width;
            const y = Math.floor(pixelIndex / this.stegoImageData.width);
            ctx.fillRect(x, y, 1, 1);
        }
        
        this.log('step2Logs', `Created pixel usage map showing ${this.usedPixels.size} least common pixels used for audio storage`, 'info');
        this.log('step2Logs', `Usage map canvas: ${usageCanvas.width}x${usageCanvas.height}`, 'info');
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
        
        // Extract bits using the same pixel order as hiding (least common first)
        let extractedBits = '';
        const bitsNeeded = this.audioBits.length;
        let bitIndex = 0;
        
        // Use the same pixel order as when hiding
        for (let pixelIndex of this.pixelOrder) {
            if (bitIndex >= bitsNeeded) break;
            
            const dataIndex = pixelIndex * 4;
            
            // Extract 3 bits per pixel from RGB channels - matching the hiding algorithm
            if (bitIndex < bitsNeeded) {
                const rBits = this.enhancedImageData.data[dataIndex] & 3;
                extractedBits += rBits > 0 ? '1' : '0';
                bitIndex++;
            }
            if (bitIndex < bitsNeeded) {
                const gBits = this.enhancedImageData.data[dataIndex + 1] & 3;
                extractedBits += gBits > 0 ? '1' : '0';
                bitIndex++;
            }
            if (bitIndex < bitsNeeded) {
                const bBits = this.enhancedImageData.data[dataIndex + 2] & 3;
                extractedBits += bBits > 0 ? '1' : '0';
                bitIndex++;
            }
        }
        
        // Trim to exact original length
        extractedBits = extractedBits.substring(0, this.audioBits.length);
        
        this.log('step4Logs', `Extracted ${extractedBits.length} bits from enhanced image`, 'info');
        
        // Compare with original bits
        let matchingBits = 0;
        for (let i = 0; i < Math.min(this.audioBits.length, extractedBits.length); i++) {
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
        const headerLengthBits = bits.substring(0, 32);
        const headerLength = parseInt(headerLengthBits, 2);
        
        // Validate header length
        if (headerLength > bits.length || headerLength < 0 || headerLength > 10000) {
            throw new Error(`Invalid header length: ${headerLength}. Bits may be corrupted.`);
        }
        
        this.log('step4Logs', `Header length: ${headerLength} bits`, 'info');
        
        // Extract header
        const headerBinary = bits.substring(32, 32 + headerLength);
        
        try {
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
            
        } catch (parseError) {
            throw new Error(`Header parsing failed: ${parseError.message}. Data may be corrupted.`);
        }
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