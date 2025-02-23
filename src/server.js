const express = require('express')
const bodyParser = require('body-parser')
const AuthenticationRoutes = require('./routes/authentication')
const FileRoutes = require('./routes/files')
const GroupRoutes = require('./routes/groups')

class TelegramFileServer {
    constructor(configManager, telegramClientManager) {
        this.configManager = configManager
        this.telegramClientManager = telegramClientManager
        this.app = express()
        this.port = this.configManager.get('port') || 8000
        this.setupMiddleware()
        this.setupRoutes()
    }

    setupMiddleware() {
        this.app.use(bodyParser.json())
        this.app.use(bodyParser.urlencoded({ extended: true }))
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.url}`)
            next()
        })
        // Add authentication middleware
        this.app.use(async (req, res, next) => {
            // Skip auth check for authentication routes
            if (req.path.startsWith('/auth')) {
                return next()
            }

            try {
                const client = await this.telegramClientManager.initClient()
                if (!this.telegramClientManager.authState.isAuthenticated) {
                    return res.status(401).json({
                        error: 'Not authenticated',
                        needsAuth: true
                    })
                }
                next()
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        })
    }

    setupRoutes() {
        // Initialize routes
        const authRoutes = new AuthenticationRoutes(
            this.telegramClientManager,
            this.configManager
        )
        const fileRoutes = new FileRoutes(
            this.telegramClientManager,
            this.configManager
        )
        const groupRoutes = new GroupRoutes(
            this.telegramClientManager,
            this.configManager
        )

        // Mount routes
        this.app.use('/auth', authRoutes.router)
        this.app.use('/files', fileRoutes.router)
        this.app.use('/groups', groupRoutes.router)

        // Add basic status endpoint
        this.app.get('/status', async (req, res) => {
            try {
                const authState = this.telegramClientManager.authState
                res.json({
                    status: 'running',
                    version: '1.0.0',
                    authenticated: authState.isAuthenticated,
                    needsPassword: authState.passwordNeeded
                })
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        })
    }

    start() {
        return new Promise((resolve, reject) => {
            try {
                const server = this.app.listen(this.port, () => {
                    console.log(`Server running on port ${this.port}`)
                    console.log('Available endpoints:')
                    console.log('  GET  /status         - Server status')
                    console.log('  POST /auth/setup     - Setup API credentials')
                    console.log('  POST /auth/send-code - Send verification code')
                    console.log('  POST /auth/verify-code - Verify code')
                    console.log('  GET  /groups         - List groups')
                    console.log('  GET  /files          - List files')
                    resolve(server)
                })
            } catch (error) {
                reject(error)
            }
        })
    }
}

module.exports = TelegramFileServer