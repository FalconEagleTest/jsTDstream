// src/scripts/check-config.js
const ConfigManager = require('../config')

async function checkConfig() {
    const config = new ConfigManager()
    const currentConfig = {
        apiId: config.get('apiId'),
        hasApiHash: !!config.get('apiHash'),
        hasStringSession: !!config.get('stringSession'),
        port: config.get('port')
    }
    
    console.log('Current configuration:', currentConfig)
}

checkConfig()