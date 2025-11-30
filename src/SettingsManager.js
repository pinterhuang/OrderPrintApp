const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsManager {
  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.defaultSettings = {
      apiUrl: 'http://vegetable-university.com/store/api_frontend',
      email: '',
      password: '',
      authToken: '',
      checkInterval: 30000,
      recentMinutes: 2,
      enableSound: true,
      enableNotification: true,
      printDelay: 1000,
      autoStart: true
    };

    this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        this.settings = { ...this.defaultSettings, ...JSON.parse(data) };
      } else {
        this.settings = { ...this.defaultSettings };
      }
    } catch (error) {
      console.error('載入設定失敗:', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  saveSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(
        this.settingsPath,
        JSON.stringify(this.settings, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      console.error('儲存設定失敗:', error);
      return false;
    }
  }

  resetSettings() {
    this.settings = { ...this.defaultSettings };
    this.saveSettings(this.settings);
  }
}

module.exports = SettingsManager;
