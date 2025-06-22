class GeoCam {
  constructor() {
    this.video = document.getElementById("video");
    this.canvas = document.getElementById("canvas");
    this.captureBtn = document.getElementById("captureBtn");
    this.captureIcon = document.getElementById("captureIcon");
    this.capturedImage = document.getElementById("capturedImage");
    this.mediaGallery = document.getElementById("mediaGallery");
    this.statusIndicator = document.getElementById("statusIndicator");
    this.flashBtn = document.getElementById("flashBtn");
    this.switchBtn = document.getElementById("switchBtn");
    this.loadingSpinner = document.getElementById("loadingSpinner");
    this.photoModeBtn = document.getElementById("photoModeBtn");
    this.videoModeBtn = document.getElementById("videoModeBtn");

    this.stream = null;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.currentPosition = null;
    this.currentAddress = null;
    this.capturedMedia = [];
    this.clockInterval = null;
    this.map = null;
    this.currentCamera = "user";
    this.flashActive = false;
    this.track = null;
    this.currentMode = "photo";
    this.videoProcessor = null;
    this.recordingCanvas = null;
    this.recordingContext = null;
    this.animationId = null;

    this.init();
  }

  async init() {
    await this.setupCamera();
    await this.getLocation();
    this.setupEvents();
    this.updateClock();
  }

  async setupCamera() {
    try {
      this.updateStatus("Setting up camera...");
      const constraints = {
        video: {
          facingMode: this.currentCamera,
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        },
        audio: this.currentMode === "video",
      };

      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      this.track = this.stream.getVideoTracks()[0];

      await new Promise((resolve) => {
        this.video.onloadedmetadata = resolve;
      });

      this.updateStatus("Ready");
    } catch (error) {
      console.error("Camera error:", error);
      this.updateStatus("Camera Error");
      alert("Unable to access camera. Please check permissions.");
    }
  }

  updateStatus(msg) {
    this.statusIndicator.textContent = msg;
  }

  setMode(mode) {
    if (this.isRecording) {
      alert("Please stop recording before switching modes");
      return;
    }

    this.currentMode = mode;

    // Update UI
    this.photoModeBtn.classList.toggle("active", mode === "photo");
    this.videoModeBtn.classList.toggle("active", mode === "video");

    // Update capture icon
    this.captureIcon.className =
      mode === "photo" ? "fas fa-camera" : "fas fa-video";

    // Restart camera with appropriate audio settings
    this.setupCamera();
  }

  setupEvents() {
    this.captureBtn.onclick = () => {
      if (this.currentMode === "photo") {
        this.capturePhoto();
      } else {
        this.toggleVideo();
      }
    };

    this.flashBtn.onclick = () => this.toggleFlash();
    this.switchBtn.onclick = () => this.switchCamera();
  }

  async getLocation() {
    if (!navigator.geolocation) {
      document.getElementById("coordinates").textContent =
        "Geolocation not supported";
      document.getElementById("address").textContent =
        "Location services unavailable";
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    };

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        this.currentPosition = pos.coords;
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        document.getElementById("coordinates").textContent = `${lat}°, ${lng}°`;

        try {
          // Using a free geocoding service
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
          );
          const data = await res.json();
          this.currentAddress = data.display_name || "Address not available";

          // Truncate long addresses
          const displayAddress =
            this.currentAddress.length > 80
              ? this.currentAddress.substring(0, 77) + "..."
              : this.currentAddress;
          document.getElementById("address").textContent = displayAddress;
        } catch (error) {
          console.error("Geocoding error:", error);
          this.currentAddress = "Address not available";
          document.getElementById("address").textContent =
            "Address unavailable";
        }

        // Initialize map
        if (this.map) {
          this.map.remove();
        }

        this.map = L.map("map").setView(
          [pos.coords.latitude, pos.coords.longitude],
          16
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(this.map);

        L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(this.map);
      },
      (error) => {
        console.error("Geolocation error:", error);
        document.getElementById("coordinates").textContent =
          "Location unavailable";
        document.getElementById("address").textContent =
          "Enable location services";
        this.currentAddress = "Address not available";

        // Fallback map
        if (this.map) {
          this.map.remove();
        }
        this.map = L.map("map").setView([0, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(this.map);
      },
      options
    );
  }

  updateClock() {
    const update = () => {
      const now = new Date();
      const date = now.toLocaleDateString("en-IN");
      const time = now.toLocaleTimeString("en-IN");
      document.getElementById("liveClock").textContent = `${date} | ${time}`;
      document.getElementById("currentDate").textContent = date;
      document.getElementById("currentTime").textContent = time;
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }

  async capturePhoto() {
    if (!this.stream) return;

    this.loadingSpinner.style.display = "block";
    this.updateStatus("Capturing...");

    try {
      // Ensure video is ready
      if (this.video.readyState < 2) {
        await new Promise((resolve) => {
          this.video.addEventListener("loadeddata", resolve, { once: true });
        });
      }

      const ctx = this.canvas.getContext("2d");
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      ctx.drawImage(this.video, 0, 0);

      // Create final canvas with footer
      const footerHeight = this.getResponsiveFooterHeight();
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = this.canvas.width;
      finalCanvas.height = this.canvas.height + footerHeight;
      const finalCtx = finalCanvas.getContext("2d");

      // Draw main image
      finalCtx.drawImage(this.canvas, 0, 0);

      // Draw footer
      await this.drawFooter(
        finalCtx,
        this.canvas.height,
        finalCanvas.width,
        footerHeight
      );

      // Convert to blob
      finalCanvas.toBlob(
        (blob) => {
          const url = URL.createObjectURL(blob);
          this.showPreview(url);
          this.addToGallery("photo", blob, url);
          this.loadingSpinner.style.display = "none";
          this.updateStatus("Ready");
        },
        "image/jpeg",
        0.95
      );
    } catch (error) {
      console.error("Capture error:", error);
      this.loadingSpinner.style.display = "none";
      this.updateStatus("Capture Failed");
      alert("Failed to capture photo. Please try again.");
    }
  }

  getResponsiveFooterHeight() {
    const width = this.canvas.width;
    if (width <= 480) return 100; // Mobile
    if (width <= 768) return 120; // Tablet
    return 140; // Desktop
  }

  async drawFooter(ctx, startY, width, height) {
    // Footer background - solid dark color like GPS Map Camera
    ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
    ctx.fillRect(0, startY, width, height);

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN");
    const timeStr = now.toLocaleTimeString("en-IN", {
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
    });
    const lat = this.currentPosition?.latitude?.toFixed(5) || "N/A";
    const lng = this.currentPosition?.longitude?.toFixed(5) || "N/A";

    let addressStr = this.currentAddress || "Address not available";

    // Responsive measurements
    const mapWidth = Math.min(height * 1.2, width * 0.25, 150);
    const mapHeight = height * 0.7;
    const mapX = width * 0.02;
    const mapY = startY + height * 0.15;

    const textStartX = mapX + mapWidth + width * 0.03;
    const textAreaWidth = width - textStartX - width * 0.02;

    // Responsive font sizes
    const titleSize = Math.max(14, Math.min(20, width / 60));
    const textSize = Math.max(11, Math.min(15, width / 80));
    const smallTextSize = Math.max(9, Math.min(13, width / 90));

    // Draw map section with caching for video mode
    if (this.currentPosition) {
      try {
        const zoom = 16;

        // Create cache key for map
        const mapCacheKey = `${lat}_${lng}_${zoom}_${mapWidth}_${mapHeight}`;

        // Check if we have cached map canvas for video mode
        if (
          this.isRecording &&
          this.cachedMapCanvas &&
          this.lastMapCacheKey === mapCacheKey
        ) {
          // Use cached map to prevent flickering
          ctx.drawImage(this.cachedMapCanvas, mapX, mapY, mapWidth, mapHeight);
        } else {
          // Create new map
          const mapCanvas = document.createElement("canvas");
          mapCanvas.width = mapWidth;
          mapCanvas.height = mapHeight;
          const mapCtx = mapCanvas.getContext("2d");

          // Improved tile calculation for precise positioning
          const latRad = (this.currentPosition.latitude * Math.PI) / 180;
          const n = Math.pow(2, zoom);

          // Calculate tile coordinates more precisely
          const tileX = ((this.currentPosition.longitude + 180) / 360) * n;
          const tileY = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;

          // Get the tile indices
          const tileXInt = Math.floor(tileX);
          const tileYInt = Math.floor(tileY);

          // Calculate pixel offset within the tile
          const pixelOffsetX = (tileX - tileXInt) * 256;
          const pixelOffsetY = (tileY - tileYInt) * 256;

          // Calculate how many tiles we need to cover the map area
          const tilesX = Math.ceil(mapWidth / 256) + 1;
          const tilesY = Math.ceil(mapHeight / 256) + 1;

          // Calculate starting tile position to center the location
          const startTileX = tileXInt - Math.floor(tilesX / 2);
          const startTileY = tileYInt - Math.floor(tilesY / 2);

          try {
            // Load map tiles with better positioning
            const tilePromises = [];

            for (let dx = 0; dx < tilesX; dx++) {
              for (let dy = 0; dy < tilesY; dy++) {
                const tileXPos = startTileX + dx;
                const tileYPos = startTileY + dy;

                // Skip invalid tile coordinates
                if (
                  tileXPos < 0 ||
                  tileYPos < 0 ||
                  tileXPos >= n ||
                  tileYPos >= n
                ) {
                  continue;
                }

                const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileXPos}/${tileYPos}.png`;

                tilePromises.push(
                  new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => resolve({ img, dx, dy });
                    img.onerror = () => resolve(null);
                    img.src = tileUrl;
                    setTimeout(() => resolve(null), 1500);
                  })
                );
              }
            }

            const tiles = await Promise.all(tilePromises);
            let tilesLoaded = false;

            // Clear map canvas
            mapCtx.fillStyle = "#f0f0f0";
            mapCtx.fillRect(0, 0, mapWidth, mapHeight);

            tiles.forEach((tile) => {
              if (tile && tile.img) {
                // Calculate position to center the user's location
                const centerOffsetX = mapWidth / 2 - pixelOffsetX;
                const centerOffsetY = mapHeight / 2 - pixelOffsetY;

                const x =
                  tile.dx * 256 + centerOffsetX - Math.floor(tilesX / 2) * 256;
                const y =
                  tile.dy * 256 + centerOffsetY - Math.floor(tilesY / 2) * 256;

                mapCtx.drawImage(tile.img, x, y, 256, 256);
                tilesLoaded = true;
              }
            });

            if (tilesLoaded) {
              // Cache the map canvas for video mode to prevent flickering
              if (this.isRecording) {
                this.cachedMapCanvas = document.createElement("canvas");
                this.cachedMapCanvas.width = mapWidth;
                this.cachedMapCanvas.height = mapHeight;
                const cacheCtx = this.cachedMapCanvas.getContext("2d");
                cacheCtx.drawImage(mapCanvas, 0, 0);
                this.lastMapCacheKey = mapCacheKey;
              }

              ctx.drawImage(mapCanvas, mapX, mapY, mapWidth, mapHeight);
            } else {
              throw new Error("No tiles loaded");
            }
          } catch (tileError) {
            console.warn("Tile loading error:", tileError);
            // Fallback map design
            const mapGradient = mapCtx.createLinearGradient(0, 0, 0, mapHeight);
            mapGradient.addColorStop(0, "#4a5568");
            mapGradient.addColorStop(0.5, "#2d3748");
            mapGradient.addColorStop(1, "#1a202c");

            mapCtx.fillStyle = mapGradient;
            mapCtx.fillRect(0, 0, mapWidth, mapHeight);

            // Add grid pattern
            mapCtx.strokeStyle = "rgba(255, 255, 255, 0.1)";
            mapCtx.lineWidth = 1;
            mapCtx.beginPath();
            for (let i = 0; i <= 4; i++) {
              const x = (mapWidth / 4) * i;
              const y = (mapHeight / 4) * i;
              mapCtx.moveTo(x, 0);
              mapCtx.lineTo(x, mapHeight);
              mapCtx.moveTo(0, y);
              mapCtx.lineTo(mapWidth, y);
            }
            mapCtx.stroke();

            // Cache fallback map for video mode
            if (this.isRecording) {
              this.cachedMapCanvas = document.createElement("canvas");
              this.cachedMapCanvas.width = mapWidth;
              this.cachedMapCanvas.height = mapHeight;
              const cacheCtx = this.cachedMapCanvas.getContext("2d");
              cacheCtx.drawImage(mapCanvas, 0, 0);
              this.lastMapCacheKey = mapCacheKey;
            }

            ctx.drawImage(mapCanvas, mapX, mapY, mapWidth, mapHeight);
          }
        }

        // Draw red location pin (always at center)
        const pinX = mapX + mapWidth / 2;
        const pinY = mapY + mapHeight / 2;
        const pinSize = Math.min(mapWidth, mapHeight) * 0.15;

        // Pin shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.ellipse(
          pinX + 1,
          pinY + pinSize * 0.7,
          pinSize * 0.3,
          pinSize * 0.15,
          0,
          0,
          2 * Math.PI
        );
        ctx.fill();

        // Pin body
        ctx.fillStyle = "#E53E3E";
        ctx.beginPath();
        ctx.arc(pinX, pinY, pinSize * 0.5, 0, 2 * Math.PI);
        ctx.fill();

        // Pin tip
        ctx.beginPath();
        ctx.moveTo(pinX, pinY + pinSize * 0.8);
        ctx.lineTo(pinX - pinSize * 0.25, pinY + pinSize * 0.1);
        ctx.lineTo(pinX + pinSize * 0.25, pinY + pinSize * 0.1);
        ctx.closePath();
        ctx.fill();

        // White center dot
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(pinX, pinY, pinSize * 0.2, 0, 2 * Math.PI);
        ctx.fill();
      } catch (error) {
        console.error("Map drawing error:", error);
        // Ultra fallback
        ctx.fillStyle = "#2d3748";
        ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
        ctx.fillStyle = "#E53E3E";
        ctx.font = `${mapHeight * 0.4}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("📍", mapX + mapWidth / 2, mapY + mapHeight * 0.7);
        ctx.textAlign = "left";
      }
    }

    // Draw border around map
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);

    // Text information section
    const lineHeight = height * 0.18;
    let currentY = startY + height * 0.15;

    // Location title (like GPS Map Camera)
    ctx.fillStyle = "white";
    ctx.font = `bold ${titleSize}px Arial, sans-serif`;

    // Get city/area from address for title
    let locationTitle = "Unknown Location";
    if (this.currentAddress) {
      const parts = this.currentAddress.split(",");
      // Try to extract city, state, country
      if (parts.length >= 3) {
        const city = parts[parts.length - 4] || parts[0];
        const state = parts[parts.length - 2];
        const country = parts[parts.length - 1];
        locationTitle = `${city?.trim()}, ${state?.trim()}, ${country?.trim()}`;
      } else {
        locationTitle = parts[0]?.trim() || "Unknown Location";
      }
    }

    // Truncate title if too long
    const maxTitleWidth = textAreaWidth;
    let truncatedTitle = locationTitle;
    ctx.measureText = ctx.measureText || (() => ({ width: 0 }));
    while (
      ctx.measureText(truncatedTitle).width > maxTitleWidth &&
      truncatedTitle.length > 10
    ) {
      truncatedTitle =
        truncatedTitle.substring(0, truncatedTitle.length - 4) + "...";
    }

    ctx.fillText(truncatedTitle, textStartX, currentY);
    currentY += lineHeight;

    // Full address
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = `${smallTextSize}px Arial, sans-serif`;

    // Wrap address text
    const maxAddressWidth = textAreaWidth;
    const words = addressStr.split(" ");
    let line = "";
    let addressLines = [];

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      if (ctx.measureText(testLine).width > maxAddressWidth && line !== "") {
        addressLines.push(line.trim());
        line = words[i] + " ";
      } else {
        line = testLine;
      }
    }
    if (line.trim()) {
      addressLines.push(line.trim());
    }

    // Limit to 2 lines
    if (addressLines.length > 2) {
      addressLines = addressLines.slice(0, 2);
      addressLines[1] =
        addressLines[1].substring(0, addressLines[1].length - 3) + "...";
    }

    addressLines.forEach((line) => {
      ctx.fillText(line, textStartX, currentY);
      currentY += lineHeight * 0.8;
    });

    // Coordinates
    currentY += lineHeight * 0.3;
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = `${smallTextSize}px Arial, sans-serif`;
    ctx.fillText(`Lat ${lat}° Long ${lng}°`, textStartX, currentY);

    // Date and time
    currentY += lineHeight * 0.8;
    const dateTimeStr = `${dateStr} ${timeStr} GMT +05:30`;
    ctx.fillText(dateTimeStr, textStartX, currentY);

    // Add Google-style watermark
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `bold ${smallTextSize * 0.8}px Arial, sans-serif`;
    ctx.fillText("Pixaloc", mapX + 4, mapY + mapHeight - 4);
  }

  toggleVideo() {
    if (this.isRecording) {
      this.stopVideoRecording();
    } else {
      this.startVideoRecording();
    }
  }

  async startVideoRecording() {
    try {
      if (!this.stream) {
        alert("Camera not available");
        return;
      }

      this.updateStatus("Starting recording...");

      // Create recording canvas
      this.recordingCanvas = document.createElement("canvas");
      this.recordingContext = this.recordingCanvas.getContext("2d");

      // Set canvas dimensions
      this.recordingCanvas.width = this.video.videoWidth || 1920;
      this.recordingCanvas.height =
        this.video.videoHeight + this.getResponsiveFooterHeight() || 1080 + 140;

      // Create MediaStream from canvas
      const fps = 30;
      const canvasStream = this.recordingCanvas.captureStream(fps);

      // Add audio tracks if available
      const audioTracks = this.stream.getAudioTracks();
      audioTracks.forEach((track) => canvasStream.addTrack(track));

      // Set up MediaRecorder
      const chunks = [];
      const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];

      let selectedMimeType = "video/webm";
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      this.mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 2500000,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        const url = URL.createObjectURL(blob);
        this.showPreview(url);
        this.addToGallery("video", blob, url);
        this.updateStatus("Ready");

        // Clean up
        if (this.animationId) {
          cancelAnimationFrame(this.animationId);
          this.animationId = null;
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        this.updateStatus("Recording failed");
        this.isRecording = false;
        this.captureIcon.className = "fas fa-video";
        this.captureBtn.classList.remove("recording");
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;
      this.captureIcon.className = "fas fa-stop";
      this.captureBtn.classList.add("recording");
      this.updateStatus("Recording...");

      // Start frame processing
      this.processVideoFrame();
    } catch (error) {
      console.error("Video recording error:", error);
      this.updateStatus("Recording failed");
      alert("Failed to start video recording. Please try again.");
    }
  }

  processVideoFrame() {
    if (!this.isRecording || !this.recordingCanvas || !this.recordingContext) {
      return;
    }

    try {
      // Clear canvas
      this.recordingContext.clearRect(
        0,
        0,
        this.recordingCanvas.width,
        this.recordingCanvas.height
      );

      // Draw video frame
      const videoHeight = this.video.videoHeight || 1080;
      this.recordingContext.drawImage(
        this.video,
        0,
        0,
        this.recordingCanvas.width,
        videoHeight
      );

      // Draw footer
      const footerHeight = this.getResponsiveFooterHeight();
      this.drawFooter(
        this.recordingContext,
        videoHeight,
        this.recordingCanvas.width,
        footerHeight
      ).catch((err) => console.warn("Footer drawing error:", err));
    } catch (error) {
      console.warn("Frame processing error:", error);
    }

    // Schedule next frame
    this.animationId = requestAnimationFrame(() => this.processVideoFrame());
  }

  stopVideoRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    this.isRecording = false;
    this.captureIcon.className = "fas fa-video";
    this.captureBtn.classList.remove("recording");
    this.updateStatus("Processing video...");

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  async toggleFlash() {
    if (!this.track || !this.track.getCapabilities) {
      alert("Flash not supported on this device");
      return;
    }

    try {
      const capabilities = this.track.getCapabilities();
      if (!capabilities.torch) {
        alert("Flash not available on this camera");
        return;
      }

      this.flashActive = !this.flashActive;
      this.flashBtn.classList.toggle("active", this.flashActive);

      await this.track.applyConstraints({
        advanced: [{ torch: this.flashActive }],
      });
    } catch (error) {
      console.error("Flash error:", error);
      this.flashActive = false;
      this.flashBtn.classList.remove("active");
      alert("Unable to control flash");
    }
  }

  async switchCamera() {
    if (!this.stream) return;

    if (this.isRecording) {
      alert("Please stop recording before switching cameras");
      return;
    }

    this.updateStatus("Switching camera...");

    // Toggle camera
    this.currentCamera = this.currentCamera === "user" ? "environment" : "user";

    // Reset flash state
    this.flashActive = false;
    this.flashBtn.classList.remove("active");

    // Setup new camera
    await this.setupCamera();
  }

  showPreview(url) {
    this.capturedImage.src = url;
    this.capturedImage.style.display = "block";
    this.video.style.display = "none";

    setTimeout(() => {
      this.capturedImage.style.display = "none";
      this.video.style.display = "block";
    }, 2500);
  }

  addToGallery(type, blob, url) {
    const item = document.createElement("div");
    item.className = "media-item";

    const media =
      type === "photo"
        ? document.createElement("img")
        : document.createElement("video");

    media.src = url;
    if (type === "video") {
      media.controls = true;
      media.muted = true;
      media.preload = "metadata";
      // Ensure video is playable
      media.addEventListener("loadedmetadata", () => {
        console.log("Video loaded:", media.duration, "seconds");
      });
      media.addEventListener("error", (e) => {
        console.error("Video error:", e);
      });
    }
    media.loading = "lazy";
    item.appendChild(media);

    const overlay = document.createElement("div");
    overlay.className = "timestamp-overlay";
    overlay.textContent = new Date().toLocaleString("en-IN");
    item.appendChild(overlay);

    const actions = document.createElement("div");
    actions.className = "media-actions";

    // Download button
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn btn-sm";
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    downloadBtn.title = "Download";
    downloadBtn.onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoCam_${type}_${Date.now()}.${
        type === "photo" ? "jpg" : "webm"
      }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    actions.appendChild(downloadBtn);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-sm";
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = "Delete";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("Delete this media?")) {
        URL.revokeObjectURL(url);
        item.remove();
      }
    };
    actions.appendChild(deleteBtn);

    // Share button (if supported)
    if (navigator.share) {
      const shareBtn = document.createElement("button");
      shareBtn.className = "btn btn-sm";
      shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
      shareBtn.title = "Share";
      shareBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const fileExtension = type === "photo" ? "jpg" : "webm";
          const file = new File(
            [blob],
            `GeoCam_${type}_${Date.now()}.${fileExtension}`,
            {
              type: blob.type,
            }
          );
          await navigator.share({
            title: `GeoCam ${type}`,
            text: `Check out my GeoCam ${type} with location data!`,
            files: [file],
          });
        } catch (error) {
          console.log("Share cancelled or failed:", error);
        }
      };
      actions.appendChild(shareBtn);
    }

    item.appendChild(actions);

    // Add click to view full size
    media.onclick = () => {
      const modal = document.createElement("div");
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); z-index: 9999; display: flex;
        align-items: center; justify-content: center; cursor: pointer;
      `;

      const fullMedia = media.cloneNode(true);
      fullMedia.style.cssText =
        "max-width: 90%; max-height: 90%; object-fit: contain;";
      if (type === "video") {
        fullMedia.controls = true;
        fullMedia.autoplay = true;
      }
      modal.appendChild(fullMedia);

      modal.onclick = (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      };
      document.body.appendChild(modal);
    };

    this.mediaGallery.prepend(item);

    // Store media reference
    this.capturedMedia.push({
      type,
      blob,
      url,
      timestamp: new Date(),
    });

    console.log(`${type} added to gallery:`, {
      size: blob.size,
      type: blob.type,
    });
  }

  // Cleanup method
  destroy() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }

    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }

    if (this.map) {
      this.map.remove();
    }

    // Revoke all blob URLs
    this.capturedMedia.forEach((media) => {
      URL.revokeObjectURL(media.url);
    });
  }
}

// Initialize app
let app;
window.addEventListener("DOMContentLoaded", () => {
  app = new GeoCam();
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (app) {
    app.destroy();
  }
});

// Handle visibility change
document.addEventListener("visibilitychange", () => {
  if (app && app.isRecording && document.hidden) {
    console.log("Tab hidden during recording");
  }
});

// Service Worker registration (optional, for PWA capabilities)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Uncomment to register service worker
    // navigator.serviceWorker.register('/sw.js');
  });
}
