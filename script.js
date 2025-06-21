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

        L.marker([pos.coords.latitude, pos.coords.longitude])
          .addTo(this.map)
          .bindPopup("You are here")
          .openPopup();
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
    // Footer background with gradient
    const gradient = ctx.createLinearGradient(0, startY, 0, startY + height);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.9)");
    gradient.addColorStop(1, "rgba(20, 20, 30, 0.95)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, startY, width, height);

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN");
    const timeStr = now.toLocaleTimeString("en-IN");
    const lat = this.currentPosition?.latitude?.toFixed(6) || "N/A";
    const lng = this.currentPosition?.longitude?.toFixed(6) || "N/A";

    let addressStr = this.currentAddress || "Address not available";
    const maxAddressLength = width < 800 ? 40 : width < 1200 ? 55 : 70;
    if (addressStr.length > maxAddressLength) {
      addressStr = addressStr.substring(0, maxAddressLength - 3) + "...";
    }

    // Responsive font sizes
    const titleSize = Math.max(12, Math.min(18, width / 50));
    const textSize = Math.max(10, Math.min(14, width / 80));
    const smallTextSize = Math.max(8, Math.min(12, width / 100));

    // Left side - Text info
    const leftMargin = width * 0.02;
    const textStartY = startY + height * 0.2;

    // GeoCam title
    ctx.fillStyle = "#B8BFE6";
    ctx.font = `bold ${titleSize}px Poppins, Arial, sans-serif`;
    ctx.fillText("GeoCam", leftMargin, textStartY);

    // Date and time
    ctx.fillStyle = "white";
    ctx.font = `${textSize}px Poppins, Arial, sans-serif`;
    const line2Y = textStartY + height * 0.25;
    ctx.fillText(`📅 ${dateStr} | ⏰ ${timeStr}`, leftMargin, line2Y);

    // Coordinates
    const line3Y = line2Y + height * 0.25;
    ctx.fillText(`📍 ${lat}, ${lng}`, leftMargin, line3Y);

    // Address
    const line4Y = line3Y + height * 0.25;
    ctx.fillText(`🏠 ${addressStr}`, leftMargin, line4Y);

    // Right side - Map
    if (this.currentPosition) {
      try {
        const mapSize = Math.min(height * 0.8, width * 0.15, 120);
        const mapX = width - mapSize - width * 0.02;
        const mapY = startY + height * 0.1;

        // Get map tile URL for the current location
        const zoom = 16;
        const tileX = Math.floor(
          ((this.currentPosition.longitude + 180) / 360) * Math.pow(2, zoom)
        );
        const tileY = Math.floor(
          ((1 -
            Math.log(
              Math.tan((this.currentPosition.latitude * Math.PI) / 180) +
                1 / Math.cos((this.currentPosition.latitude * Math.PI) / 180)
            ) /
              Math.PI) /
            2) *
            Math.pow(2, zoom)
        );

        // Create multiple tile requests for better coverage
        const mapCanvas = document.createElement("canvas");
        mapCanvas.width = mapSize;
        mapCanvas.height = mapSize;
        const mapCtx = mapCanvas.getContext("2d");

        try {
          // Try to load actual map tiles
          const tilePromises = [];
          const tileSize = 256;
          const tilesNeeded = Math.ceil(mapSize / tileSize) + 1;

          for (let dx = -1; dx < tilesNeeded; dx++) {
            for (let dy = -1; dy < tilesNeeded; dy++) {
              const tileXPos = tileX + dx;
              const tileYPos = tileY + dy;
              const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileXPos}/${tileYPos}.png`;

              tilePromises.push(
                new Promise((resolve) => {
                  const img = new Image();
                  img.crossOrigin = "anonymous";
                  img.onload = () => resolve({ img, dx, dy });
                  img.onerror = () => resolve(null);
                  img.src = tileUrl;
                  setTimeout(() => resolve(null), 1000); // Timeout after 1 second
                })
              );
            }
          }

          const tiles = await Promise.all(tilePromises);
          let tilesLoaded = false;

          tiles.forEach((tile) => {
            if (tile && tile.img) {
              const x = tile.dx * tileSize;
              const y = tile.dy * tileSize;
              mapCtx.drawImage(tile.img, x, y, tileSize, tileSize);
              tilesLoaded = true;
            }
          });

          if (tilesLoaded) {
            // Draw the map
            ctx.drawImage(mapCanvas, mapX, mapY, mapSize, mapSize);
          } else {
            throw new Error("No tiles loaded");
          }
        } catch (tileError) {
          console.log("Using fallback map design");
          // Fallback: Draw a stylized map background
          const mapGradient = ctx.createRadialGradient(
            mapX + mapSize / 2,
            mapY + mapSize / 2,
            0,
            mapX + mapSize / 2,
            mapY + mapSize / 2,
            mapSize / 2
          );
          mapGradient.addColorStop(0, "#E8F4FD");
          mapGradient.addColorStop(0.7, "#B3D9FF");
          mapGradient.addColorStop(1, "#7CB3E8");

          ctx.fillStyle = mapGradient;
          ctx.fillRect(mapX, mapY, mapSize, mapSize);

          // Add some "street" lines
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Horizontal lines
          for (let i = 0; i < 4; i++) {
            const y = mapY + (mapSize / 4) * (i + 0.5);
            ctx.moveTo(mapX, y);
            ctx.lineTo(mapX + mapSize, y);
          }
          // Vertical lines
          for (let i = 0; i < 4; i++) {
            const x = mapX + (mapSize / 4) * (i + 0.5);
            ctx.moveTo(x, mapY);
            ctx.lineTo(x, mapY + mapSize);
          }
          ctx.stroke();
        }

        // Draw border around map
        ctx.strokeStyle = "#4254D3";
        ctx.lineWidth = 2;
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);

        // Draw location marker (crosshair)
        const centerX = mapX + mapSize / 2;
        const centerY = mapY + mapSize / 2;

        // Outer circle
        ctx.fillStyle = "rgba(255, 71, 87, 0.3)";
        ctx.beginPath();
        ctx.arc(centerX, centerY, 12, 0, 2 * Math.PI);
        ctx.fill();

        // Inner crosshair
        ctx.strokeStyle = "#ff4757";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX - 8, centerY);
        ctx.lineTo(centerX + 8, centerY);
        ctx.moveTo(centerX, centerY - 8);
        ctx.lineTo(centerX, centerY + 8);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = "#ff4757";
        ctx.beginPath();
        ctx.arc(centerX, centerY, 2, 0, 2 * Math.PI);
        ctx.fill();

        // Add map label
        ctx.fillStyle = "#4254D3";
        ctx.font = `bold ${smallTextSize}px Poppins, Arial, sans-serif`;
        const labelY = mapY - 8;
        ctx.fillText("Location Map", mapX, labelY);
      } catch (error) {
        console.error("Map drawing error:", error);
        // Ultra fallback - just show a location icon
        ctx.fillStyle = "#4254D3";
        ctx.font = `${textSize * 2}px Arial, sans-serif`;
        ctx.fillText("📍", width - 50, startY + height / 2);
      }
    }

    // Add a subtle top border to the footer
    ctx.strokeStyle = "rgba(178, 191, 230, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, startY);
    ctx.lineTo(width, startY);
    ctx.stroke();
  }

  toggleVideo() {
    if (this.isRecording) {
      // Stop recording
      this.mediaRecorder.stop();
      this.captureIcon.className = "fas fa-video";
      this.captureBtn.classList.remove("recording");
      this.updateStatus("Processing video...");
    } else {
      // Start recording
      if (!this.stream) {
        alert("Camera not available");
        return;
      }

      const chunks = [];
      const options = {
        mimeType: "video/webm;codecs=vp9" || "video/webm" || "video/mp4",
      };

      try {
        this.mediaRecorder = new MediaRecorder(this.stream, options);
      } catch (error) {
        this.mediaRecorder = new MediaRecorder(this.stream);
      }

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        this.showPreview(url);
        this.addToGallery("video", blob, url);
        this.updateStatus("Ready");
      };

      this.mediaRecorder.start();
      this.captureIcon.className = "fas fa-stop";
      this.captureBtn.classList.add("recording");
      this.updateStatus("Recording...");
    }
    this.isRecording = !this.isRecording;
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
    if (navigator.share && type === "photo") {
      const shareBtn = document.createElement("button");
      shareBtn.className = "btn btn-sm";
      shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
      shareBtn.title = "Share";
      shareBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const file = new File([blob], `GeoCam_${type}_${Date.now()}.jpg`, {
            type: blob.type,
          });
          await navigator.share({
            title: "GeoCam Photo",
            text: "Check out my GeoCam photo with location data!",
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
      modal.appendChild(fullMedia);

      modal.onclick = () => document.body.removeChild(modal);
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
  }

  // Cleanup method
  destroy() {
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

// Handle visibility change (pause/resume camera)
document.addEventListener("visibilitychange", () => {
  if (app && app.isRecording && document.hidden) {
    // Optionally pause recording when tab is not visible
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
