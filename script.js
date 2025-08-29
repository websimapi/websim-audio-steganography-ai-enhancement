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

