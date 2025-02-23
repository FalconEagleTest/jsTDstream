// src/scripts/setup.js
const ConfigManager = require('../config')
const readline = require('readline')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

async function setup() {
    try {
        const config = new ConfigManager()
        
        console.log('Current configuration:', {
            apiId: config.get('apiId'),
            hasApiHash: !!config.get('apiHash'),
            hasStringSession: !!config.get('stringSession')
        })

        const apiId = await new Promise(resolve => {
            rl.question('Enter your API ID: ', resolve)
        })

        const apiHash = await new Promise(resolve => {
            rl.question('Enter your API Hash: ', resolve)
        })

        config.set('apiId', apiId)
        config.set('apiHash', apiHash)

        console.log('Configuration saved:', {
            apiId: config.get('apiId'),
            hasApiHash: !!config.get('apiHash')
        })

        rl.close()
    } catch (error) {
        console.error('Setup error:', error)
        process.exit(1)
    }
}

setup()