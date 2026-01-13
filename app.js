"use strict";
/**
 * AI Tool Detection Application
 * Menggunakan Teachable Machine untuk deteksi alat kerja secara real-time
 */
// ==================== CONFIGURATION ====================
class Config {
}
// GANTI URL INI DENGAN LINK MODEL DARI TEACHABLE MACHINE
// URL Testing (Verified working model: Standard Teachable Machine Sample)
Config.MODEL_URL = "https://teachablemachine.withgoogle.com/models/bjmc_9S6A/";
// Konfigurasi deteksi
Config.MIN_CONFIDENCE = 0.7; // Minimum 70% confidence untuk dianggap valid
Config.PREDICTION_INTERVAL = 100; // Update setiap 100ms (10 FPS)
Config.MAX_HISTORY = 10; // Maksimal item di riwayat
// ==================== APPLICATION STATE ====================
class AppState {
    constructor() {
        this.model = null;
        this.webcam = null;
        this.isRunning = false;
        this.detectionCount = 0;
        this.totalConfidence = 0;
        this.sessionStartTime = null;
        this.history = [];
        this.animationFrameId = null;
        this.uptimeInterval = null;
    }
}
// ==================== DOM ELEMENTS ====================
class DOMElements {
    constructor() {
        // Initialize all DOM elements
        this.webcamContainer = this.getElement('webcam-container');
        this.loading = this.getElement('loading');
        this.error = this.getElement('error');
        this.errorMessage = this.getElement('error-message');
        this.btnStart = this.getElement('btn-start');
        this.btnStop = this.getElement('btn-stop');
        this.label = this.getElement('label');
        this.confidence = this.getElement('confidence');
        this.confidenceBar = this.getElement('confidence-bar');
        this.category = this.getElement('category');
        this.realtimeBadge = this.getElement('realtime-badge');
        this.totalDetected = this.getElement('total-detected');
        this.avgAccuracy = this.getElement('avg-accuracy');
        this.uptime = this.getElement('uptime');
        this.streamQuality = this.getElement('stream-quality');
        this.inferenceTime = this.getElement('inference-time');
        this.modelName = this.getElement('model-name');
        this.historyList = this.getElement('history-list');
        this.systemStatus = this.getElement('system-status');
    }
    getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`Element with id '${id}' not found`);
        }
        return element;
    }
}
// ==================== MAIN APPLICATION CLASS ====================
class ToolDetectionApp {
    constructor() {
        this.state = new AppState();
        this.dom = new DOMElements();
        this.init();
    }
    /**
     * Initialize application
     */
    init() {
        console.log('🚀 Initializing Tool Detection App...');
        // Setup event listeners
        this.setupEventListeners();
        // Check if Teachable Machine library is loaded
        if (typeof tmImage === 'undefined') {
            this.showError('Teachable Machine library tidak ditemukan. Pastikan CDN sudah dimuat.');
            return;
        }
        console.log('✅ Application initialized successfully');
    }
    /**
     * Setup event listeners for buttons
     */
    setupEventListeners() {
        this.dom.btnStart.addEventListener('click', () => this.startDetection());
        this.dom.btnStop.addEventListener('click', () => this.stopDetection());
    }
    /**
     * Start detection process
     */
    async startDetection() {
        try {
            console.log('▶️ Starting detection...');
            // Show loading
            this.showLoading(true);
            this.dom.btnStart.disabled = true;
            // Load model
            try {
                await this.loadModel();
            }
            catch (modelError) {
                console.warn('⚠️ Model failed to load, continuing with webcam only:', modelError);
                this.showError(`Model gagal dimuat, tapi kamera tetap diaktifkan. Error: ${modelError.message}`);
            }
            // Initialize webcam
            await this.initWebcam();
            // Start prediction loop
            this.state.isRunning = true;
            this.state.sessionStartTime = new Date();
            this.startPredictionLoop();
            this.startUptimeCounter();
            // Update UI
            this.dom.btnStart.classList.add('hidden');
            this.dom.btnStop.classList.remove('hidden');
            this.dom.realtimeBadge.textContent = 'REAL-TIME';
            this.dom.realtimeBadge.classList.remove('bg-primary/10', 'text-primary');
            this.dom.realtimeBadge.classList.add('bg-emerald-500/10', 'text-emerald-500');
            this.showLoading(false);
            console.log('✅ Detection started successfully');
        }
        catch (error) {
            console.error('❌ Error starting detection:', error);
            this.showError(`Gagal memulai deteksi: ${error.message}`);
            this.showLoading(false);
            this.dom.btnStart.disabled = false;
        }
    }
    /**
     * Stop detection process
     */
    stopDetection() {
        console.log('⏹️ Stopping detection...');
        this.state.isRunning = false;
        // Stop prediction loop
        if (this.state.animationFrameId) {
            cancelAnimationFrame(this.state.animationFrameId);
            this.state.animationFrameId = null;
        }
        // Stop uptime counter
        if (this.state.uptimeInterval) {
            clearInterval(this.state.uptimeInterval);
            this.state.uptimeInterval = null;
        }
        // Stop webcam
        if (this.state.webcam) {
            this.state.webcam.stop();
            this.state.webcam = null;
        }
        // Clear webcam container
        this.dom.webcamContainer.innerHTML = '<p class="text-white/50 text-center">Kamera akan muncul di sini</p>';
        // Update UI
        this.dom.btnStop.classList.add('hidden');
        this.dom.btnStart.classList.remove('hidden');
        this.dom.btnStart.disabled = false;
        this.dom.realtimeBadge.textContent = 'STANDBY';
        this.dom.realtimeBadge.classList.add('bg-primary/10', 'text-primary');
        this.dom.realtimeBadge.classList.remove('bg-emerald-500/10', 'text-emerald-500');
        console.log('✅ Detection stopped');
    }
    /**
     * Load Teachable Machine model
     */
    async loadModel() {
        try {
            console.log('📦 Loading model from:', Config.MODEL_URL);
            // Check if URL is placeholder
            if (Config.MODEL_URL.includes('YOUR_MODEL_URL_HERE')) {
                throw new Error('Silakan ganti MODEL_URL di file app.ts dengan link model Teachable Machine Anda');
            }
            let modelURL = Config.MODEL_URL;
            let metadataURL = Config.MODEL_URL;
            // Handle both folder-style URL and direct file URL
            if (modelURL.endsWith('/')) {
                modelURL += 'model.json';
                metadataURL += 'metadata.json';
            }
            else if (!modelURL.endsWith('model.json')) {
                modelURL += '/model.json';
                metadataURL += '/metadata.json';
            }
            else {
                metadataURL = modelURL.replace('model.json', 'metadata.json');
            }
            // Load model menggunakan Teachable Machine library
            this.state.model = await tmImage.load(modelURL, metadataURL);
            console.log('✅ Model loaded successfully');
            console.log('📊 Model info:', {
                classes: this.state.model.getClassLabels(),
                totalClasses: this.state.model.getTotalClasses()
            });
            // Update model name in UI
            this.dom.modelName.textContent = 'Model: Teachable Machine';
        }
        catch (error) {
            console.error('❌ Error loading model:', error);
            throw new Error(`Gagal memuat model: ${error.message}`);
        }
    }
    /**
     * Initialize webcam
     */
    async initWebcam() {
        try {
            console.log('📹 Initializing webcam...');
            // Request webcam permission and initialize
            const flip = true; // flip camera for mirror effect
            this.state.webcam = new tmImage.Webcam(640, 480, flip);
            await this.state.webcam.setup();
            await this.state.webcam.play();
            // Clear container and append webcam canvas
            this.dom.webcamContainer.innerHTML = '';
            this.dom.webcamContainer.appendChild(this.state.webcam.canvas);
            // Update stream quality
            this.dom.streamQuality.textContent = '640x480 Stream';
            console.log('✅ Webcam initialized successfully');
        }
        catch (error) {
            console.error('❌ Error initializing webcam:', error);
            throw new Error('Gagal mengakses kamera. Pastikan Anda memberikan izin akses kamera.');
        }
    }
    /**
     * Start prediction loop
     */
    startPredictionLoop() {
        const loop = async () => {
            if (!this.state.isRunning)
                return;
            // Update webcam frame
            this.state.webcam.update();
            // Make prediction
            await this.predict();
            // Continue loop
            this.state.animationFrameId = requestAnimationFrame(loop);
        };
        loop();
    }
    /**
     * Make prediction on current webcam frame
     */
    async predict() {
        try {
            const startTime = performance.now();
            // Skip if model not loaded
            if (!this.state.model) {
                this.dom.inferenceTime.textContent = 'N/A';
                return;
            }
            // Get predictions from model
            const predictions = await this.state.model.predict(this.state.webcam.canvas);
            // Calculate inference time
            const inferenceTime = Math.round(performance.now() - startTime);
            this.dom.inferenceTime.textContent = `${inferenceTime}ms`;
            // Find prediction with highest confidence
            const topPrediction = predictions.reduce((prev, current) => (current.probability > prev.probability) ? current : prev);
            // Only update if confidence is above threshold
            if (topPrediction.probability >= Config.MIN_CONFIDENCE) {
                this.updateUI(topPrediction);
                this.updateStats(topPrediction);
            }
        }
        catch (error) {
            console.error('❌ Prediction error:', error);
        }
    }
    /**
     * Update UI with prediction results
     */
    updateUI(prediction) {
        const confidencePercent = (prediction.probability * 100).toFixed(1);
        // Update label and confidence
        this.dom.label.textContent = prediction.className;
        this.dom.confidence.textContent = `${confidencePercent}%`;
        this.dom.confidenceBar.style.width = `${confidencePercent}%`;
        // Update category (you can customize this based on your classes)
        this.dom.category.textContent = `Kategori: Alat Kerja`;
    }
    /**
     * Update statistics
     */
    updateStats(prediction) {
        // Increment detection count
        this.state.detectionCount++;
        this.dom.totalDetected.textContent = this.state.detectionCount.toString();
        // Update average accuracy
        this.state.totalConfidence += prediction.probability;
        const avgConfidence = (this.state.totalConfidence / this.state.detectionCount * 100).toFixed(1);
        this.dom.avgAccuracy.textContent = `${avgConfidence}%`;
        // Add to history (throttled - only add if different from last or every 5 seconds)
        this.addToHistory({
            toolName: prediction.className,
            confidence: prediction.probability,
            timestamp: new Date(),
            category: 'Alat Kerja'
        });
    }
    /**
     * Add detection to history
     */
    addToHistory(detection) {
        // Check if this is different from the last detection
        const lastDetection = this.state.history[0];
        if (lastDetection && lastDetection.toolName === detection.toolName) {
            // Don't add duplicate consecutive detections
            return;
        }
        // Add to beginning of array
        this.state.history.unshift(detection);
        // Keep only MAX_HISTORY items
        if (this.state.history.length > Config.MAX_HISTORY) {
            this.state.history.pop();
        }
        // Update history UI
        this.updateHistoryUI();
    }
    /**
     * Update history list in UI
     */
    updateHistoryUI() {
        if (this.state.history.length === 0) {
            this.dom.historyList.innerHTML = '<p class="text-slate-500 text-sm text-center py-8">Belum ada riwayat deteksi</p>';
            return;
        }
        this.dom.historyList.innerHTML = this.state.history.map((item, index) => {
            const time = item.timestamp.toLocaleTimeString('id-ID');
            const confidence = (item.confidence * 100).toFixed(0);
            const opacity = index > 2 ? 'opacity-60' : '';
            return `
                <div class="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-transparent hover:border-slate-800 transition-colors ${opacity}">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded bg-slate-800 flex items-center justify-center">
                            <span class="material-symbols-outlined text-slate-400">handyman</span>
                        </div>
                        <div>
                            <p class="font-bold text-sm">${item.toolName}</p>
                            <p class="text-xs text-slate-500">${time} • Akurasi ${confidence}%</p>
                        </div>
                    </div>
                    <span class="material-symbols-outlined text-slate-600 text-[20px]">chevron_right</span>
                </div>
            `;
        }).join('');
    }
    /**
     * Start uptime counter
     */
    startUptimeCounter() {
        this.state.uptimeInterval = setInterval(() => {
            if (!this.state.sessionStartTime)
                return;
            const now = new Date();
            const diff = now.getTime() - this.state.sessionStartTime.getTime();
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.dom.uptime.textContent = timeString;
        }, 1000);
    }
    /**
     * Show/hide loading overlay
     */
    showLoading(show) {
        if (show) {
            this.dom.loading.classList.remove('hidden');
        }
        else {
            this.dom.loading.classList.add('hidden');
        }
    }
    /**
     * Show error message
     */
    showError(message) {
        console.error('💥 Error:', message);
        this.dom.errorMessage.textContent = message;
        this.dom.error.classList.remove('hidden');
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.dom.error.classList.add('hidden');
        }, 5000);
    }
}
// ==================== APPLICATION ENTRY POINT ====================
// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ToolDetectionApp();
    });
}
else {
    new ToolDetectionApp();
}
// Export for debugging in console
window.app = ToolDetectionApp;
