// Settings management
document.addEventListener("DOMContentLoaded", () => {
  // Default settings
  const defaultSettings = {
    notifications: {
      sound: true,
      desktop: true,
      messagePreview: true,
    },
    appearance: {
      theme: "light", // light, dark
      contrast: "normal", // normal, high
      fontSize: "medium", // small, medium, large
      messageAlignment: "standard", // standard, compact
    },
    privacy: {
      readReceipts: true,
      showStatus: true,
      showTypingIndicator: true,
    },
    accessibility: {
      reducedMotion: false,
      highContrast: false,
      keyboardShortcuts: true,
    },
  };

  // Function to load settings from localStorage
  function loadSettings() {
    const savedSettings = localStorage.getItem("userSettings");
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings);
      } catch (e) {
        console.error("Error parsing settings:", e);
        return defaultSettings;
      }
    }
    return defaultSettings;
  }

  // Function to save settings to localStorage
  function saveSettings(settings) {
    localStorage.setItem("userSettings", JSON.stringify(settings));
    applySettings(settings);
  }

  // Function to apply settings to the UI
  function applySettings(settings) {
    // Apply theme
    document.documentElement.setAttribute(
      "data-theme",
      settings.appearance.theme
    );

    // Apply contrast mode
    document.documentElement.setAttribute(
      "data-contrast",
      settings.appearance.contrast
    );

    // Apply font size
    document.documentElement.style.fontSize = getFontSizeValue(
      settings.appearance.fontSize
    );

    // Apply message alignment
    document.body.classList.toggle(
      "compact-messages",
      settings.appearance.messageAlignment === "compact"
    );

    // Apply reduced motion
    document.body.classList.toggle(
      "reduced-motion",
      settings.accessibility.reducedMotion
    );

    // Apply keyboard shortcuts
    window.keyboardShortcutsEnabled = settings.accessibility.keyboardShortcuts;

    // Apply other settings that need to be accessed from other scripts
    window.userSettings = settings;
  }

  // Helper to get actual font size value
  function getFontSizeValue(size) {
    switch (size) {
      case "small":
        return "14px";
      case "large":
        return "18px";
      case "medium":
      default:
        return "16px";
    }
  }

  // Initialize settings
  const settings = loadSettings();
  applySettings(settings);

  // Expose settings API for other scripts
  window.settingsAPI = {
    getSettings: () => loadSettings(),
    updateSettings: (newSettings) => {
      const settings = loadSettings();
      const updated = { ...settings, ...newSettings };
      saveSettings(updated);
      return updated;
    },
    resetSettings: () => {
      saveSettings(defaultSettings);
      return defaultSettings;
    },
  };

  // Add keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Only process if shortcuts are enabled
    if (!window.userSettings.accessibility.keyboardShortcuts) return;

    // Cmd/Ctrl + / to open settings
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault();
      toggleSettingsPanel();
    }

    // Esc to close modals or panels
    if (e.key === "Escape") {
      const settingsPanel = document.querySelector(".settings-panel");
      if (settingsPanel && settingsPanel.classList.contains("active")) {
        settingsPanel.classList.remove("active");
      }

      const emojiPicker = document.querySelector(".emoji-picker");
      if (emojiPicker && emojiPicker.classList.contains("active")) {
        emojiPicker.classList.remove("active");
      }
    }

    // Alt+1, Alt+2, Alt+3 for tab switching
    if (
      e.altKey &&
      !isNaN(parseInt(e.key)) &&
      parseInt(e.key) >= 1 &&
      parseInt(e.key) <= 3
    ) {
      e.preventDefault();
      const tabIndex = parseInt(e.key) - 1;
      const tabs = document.querySelectorAll(".tab-btn");
      if (tabs[tabIndex]) {
        tabs[tabIndex].click();
      }
    }
  });

  // Create the settings panel HTML
  function createSettingsPanel() {
    if (document.querySelector(".settings-panel")) return;

    const settings = loadSettings();
    const panel = document.createElement("div");
    panel.className = "settings-panel";

    panel.innerHTML = `
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="close-settings">×</button>
      </div>
      <div class="settings-content">
        <div class="settings-section">
          <h3>Appearance</h3>
          <div class="setting-item">
            <label>Theme</label>
            <div class="setting-control">
              <select id="theme-setting">
                <option value="light" ${
                  settings.appearance.theme === "light" ? "selected" : ""
                }>Light</option>
                <option value="dark" ${
                  settings.appearance.theme === "dark" ? "selected" : ""
                }>Dark</option>
              </select>
            </div>
          </div>
          <div class="setting-item">
            <label>Font Size</label>
            <div class="setting-control">
              <select id="font-size-setting">
                <option value="small" ${
                  settings.appearance.fontSize === "small" ? "selected" : ""
                }>Small</option>
                <option value="medium" ${
                  settings.appearance.fontSize === "medium" ? "selected" : ""
                }>Medium</option>
                <option value="large" ${
                  settings.appearance.fontSize === "large" ? "selected" : ""
                }>Large</option>
              </select>
            </div>
          </div>
          <div class="setting-item">
            <label>Message Display</label>
            <div class="setting-control">
              <select id="message-alignment-setting">
                <option value="standard" ${
                  settings.appearance.messageAlignment === "standard"
                    ? "selected"
                    : ""
                }>Standard</option>
                <option value="compact" ${
                  settings.appearance.messageAlignment === "compact"
                    ? "selected"
                    : ""
                }>Compact</option>
              </select>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h3>Notifications</h3>
          <div class="setting-item">
            <label>Desktop Notifications</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="desktop-notification-setting" ${
                  settings.notifications.desktop ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <label>Sound Notifications</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="sound-notification-setting" ${
                  settings.notifications.sound ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <label>Message Preview in Notifications</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="preview-notification-setting" ${
                  settings.notifications.messagePreview ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h3>Privacy</h3>
          <div class="setting-item">
            <label>Send Read Receipts</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="read-receipts-setting" ${
                  settings.privacy.readReceipts ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <label>Show Online Status</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="show-status-setting" ${
                  settings.privacy.showStatus ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <label>Show Typing Indicator</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="typing-indicator-setting" ${
                  settings.privacy.showTypingIndicator ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h3>Accessibility</h3>
          <div class="setting-item">
            <label>High Contrast Mode</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="high-contrast-setting" ${
                  settings.accessibility.highContrast ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <label>Reduced Motion</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="reduced-motion-setting" ${
                  settings.accessibility.reducedMotion ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div class="setting-item">
            <label>Keyboard Shortcuts</label>
            <div class="setting-control">
              <label class="switch">
                <input type="checkbox" id="keyboard-shortcuts-setting" ${
                  settings.accessibility.keyboardShortcuts ? "checked" : ""
                }>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="settings-footer">
        <button id="reset-settings-btn" class="btn">Reset to Default</button>
        <button id="save-settings-btn" class="btn">Save Changes</button>
      </div>
    `;

    document.body.appendChild(panel);

    // Add event listeners
    document.querySelector(".close-settings").addEventListener("click", () => {
      panel.classList.remove("active");
    });

    document
      .getElementById("save-settings-btn")
      .addEventListener("click", () => {
        const updatedSettings = {
          notifications: {
            sound: document.getElementById("sound-notification-setting")
              .checked,
            desktop: document.getElementById("desktop-notification-setting")
              .checked,
            messagePreview: document.getElementById(
              "preview-notification-setting"
            ).checked,
          },
          appearance: {
            theme: document.getElementById("theme-setting").value,
            contrast: settings.accessibility.highContrast ? "high" : "normal",
            fontSize: document.getElementById("font-size-setting").value,
            messageAlignment: document.getElementById(
              "message-alignment-setting"
            ).value,
          },
          privacy: {
            readReceipts: document.getElementById("read-receipts-setting")
              .checked,
            showStatus: document.getElementById("show-status-setting").checked,
            showTypingIndicator: document.getElementById(
              "typing-indicator-setting"
            ).checked,
          },
          accessibility: {
            reducedMotion: document.getElementById("reduced-motion-setting")
              .checked,
            highContrast: document.getElementById("high-contrast-setting")
              .checked,
            keyboardShortcuts: document.getElementById(
              "keyboard-shortcuts-setting"
            ).checked,
          },
        };

        saveSettings(updatedSettings);
        panel.classList.remove("active");
      });

    document
      .getElementById("reset-settings-btn")
      .addEventListener("click", () => {
        if (
          confirm("Are you sure you want to reset all settings to default?")
        ) {
          window.settingsAPI.resetSettings();
          panel.classList.remove("active");
          // Reload to apply all default settings
          window.location.reload();
        }
      });
  }

  function toggleSettingsPanel() {
    // Create panel if it doesn't exist
    if (!document.querySelector(".settings-panel")) {
      createSettingsPanel();
    }

    const panel = document.querySelector(".settings-panel");
    panel.classList.toggle("active");
  }

  // Add settings button to UI
  const settingsBtn = document.createElement("button");
  settingsBtn.className = "settings-btn";
  settingsBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </svg>
  `;

  settingsBtn.addEventListener("click", toggleSettingsPanel);
  document.querySelector(".theme-toggles").appendChild(settingsBtn);
});
