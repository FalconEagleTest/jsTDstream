const ConfigManager = require('./config')
const TelegramClientManager = require('./utils/telegramClient')
const TelegramFileServer = require('./server')

async function main() {
    try {
        // Initialize configuration
        const configManager = new ConfigManager()
        
        // Initialize Telegram client manager
        const telegramClientManager = new TelegramClientManager(configManager)
        
        // Create and start server
        const server = new TelegramFileServer(configManager, telegramClientManager)
        await server.start()
    } catch (error) {
        console.error('Application startup error:', error)
        process.exit(1)
    }
}

// Run the application
if (require.main === module) {
    main()
}

module.exports = {
    ConfigManager,
    TelegramClientManager,
    TelegramFileServer
}