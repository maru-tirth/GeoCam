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
      const footerHeight = 120;
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

  async drawFooter(ctx, startY, width, height) {
    // Footer background
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, startY, width, height);

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN");
    const timeStr = now.toLocaleTimeString("en-IN");
    const lat = this.currentPosition?.latitude?.toFixed(6) || "N/A";
    const lng = this.currentPosition?.longitude?.toFixed(6) || "N/A";

    let addressStr = this.currentAddress || "Address not available";
    if (addressStr.length > 60) {
      addressStr = addressStr.substring(0, 57) + "...";
    }

    // Left side - Text info
    ctx.fillStyle = "#B8BFE6";
    ctx.font = "bold 16px Poppins, Arial, sans-serif";
    ctx.fillText("GeoCam", 20, startY + 25);

    ctx.fillStyle = "white";
    ctx.font = "12px Poppins, Arial, sans-serif";
    ctx.fillText(`📅 ${dateStr} | ⏰ ${timeStr}`, 20, startY + 45);
    ctx.fillText(`📍 ${lat}, ${lng}`, 20, startY + 65);
    ctx.fillText(`🏠 ${addressStr}`, 20, startY + 85);

    // Right side - Mini map
    if (this.currentPosition && this.map) {
      try {
        const mapSize = 140;
        const mapX = width - mapSize - 20;
        const mapY = startY + 15;

        // Create a simple map representation
        ctx.fillStyle = "#E6E9F9";
        ctx.fillRect(mapX, mapY, mapSize, 90);
        ctx.strokeStyle = "#4254D3";
        ctx.lineWidth = 2;
        ctx.strokeRect(mapX, mapY, mapSize, 90);

        // Draw crosshair for location
        const centerX = mapX + mapSize / 2;
        const centerY = mapY + 45;

        ctx.strokeStyle = "#ff4757";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX - 10, centerY);
        ctx.lineTo(centerX + 10, centerY);
        ctx.moveTo(centerX, centerY - 10);
        ctx.lineTo(centerX, centerY + 10);
        ctx.stroke();

        // Add map label
        ctx.fillStyle = "#4254D3";
        ctx.font = "bold 10px Poppins, Arial, sans-serif";
        ctx.fillText("Location Map", mapX, mapY - 5);
      } catch (error) {
        console.error("Map drawing error:", error);
      }
    }
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
