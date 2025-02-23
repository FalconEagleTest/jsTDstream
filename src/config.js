// src/config.js
const fs = require('fs')
const path = require('path')

class ConfigManager {
    constructor() {
        // Create a config directory in the root of your project
        const configDir = path.join(__dirname, '..', 'config')
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true })
        }
        
        this.configPath = path.join(configDir, 'config.json')
        this.config = this.loadConfig()
    }

    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                const defaultConfig = {
                    apiId: null,
                    apiHash: null,
                    stringSession: null,
                    phoneNumber: null,
                    port: 8000,
                    logLevel: "info",
                    authentication: {
                        twoFactorEnabled: false,
                        maxLoginAttempts: 3
                    },
                    fileStreaming: {
                        maxFileSize: 1073741824,
                        chunkSize: 65536,
                        timeout: 30000
                    }
                }
                fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2))
                return defaultConfig
            }
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
            if (config.apiId) config.apiId = parseInt(config.apiId)
            return config
        } catch (error) {
            console.error('Error loading config:', error)
            throw error
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8')
            console.log('Config saved successfully to:', this.configPath)
        } catch (error) {
            console.error('Error saving config:', error)
            throw error
        }
    }

    get(key) {
        return this.config[key]
    }

    set(key, value) {
        this.config[key] = value
        this.saveConfig()
    }
}

module.exports = ConfigManager