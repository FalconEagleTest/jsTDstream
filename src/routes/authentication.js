const express = require('express')

class AuthenticationRoutes {
    constructor(telegramClientManager, configManager) {
        this.router = express.Router()
        this.telegramClientManager = telegramClientManager
        this.configManager = configManager
        this.setupRoutes()
    }

    setupRoutes() {
        this.router.get('/status', this.handleStatus.bind(this))
        this.router.post('/setup', this.handleSetup.bind(this))
        this.router.post('/send-code', this.handleSendCode.bind(this))
        this.router.post('/verify-code', this.handleVerifyCode.bind(this))
        this.router.post('/verify-password', this.handleVerifyPassword.bind(this))
        return this.router
    }

    async handleStatus(req, res) {
        try {
            const client = await this.telegramClientManager.initClient()
            const authState = this.telegramClientManager.authState
            res.json({
                isAuthenticated: authState.isAuthenticated,
                needsPassword: authState.passwordNeeded,
                setup: !!this.configManager.get('apiId')
            })
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }

    async handleSetup(req, res) {
        try {
            const { apiId, apiHash } = req.body
            if (!apiId || !apiHash) {
                return res.status(400).json({ error: 'Missing API credentials' })
            }
    
            // Update both values at once
            this.configManager.set('apiId', apiId)
            this.configManager.set('apiHash', apiHash)
    
            console.log('API credentials saved:', {
                apiId: this.configManager.get('apiId'),
                hasApiHash: !!this.configManager.get('apiHash')
            })
    
            res.json({ success: true })
        } catch (error) {
            console.error('Setup error:', error)
            res.status(500).json({ error: error.message })
        }
    }

   
    async handleSendCode(req, res) {
        try {
            const { phoneNumber } = req.body
            
            if (!phoneNumber) {
                return res.status(400).json({ error: 'Phone number required' })
            }
    
            // Format phone number
            const formattedPhone = phoneNumber.startsWith('+') ? 
                phoneNumber.substring(1) : // Remove + if present
                phoneNumber
    
            console.log('Sending code to formatted phone:', formattedPhone)
    
            const result = await this.telegramClientManager.sendCode(formattedPhone)
            
            console.log('Send code success:', result)
            
            res.json({
                success: true,
                phoneCodeHash: result.phoneCodeHash,
                timeout: result.timeout
            })
        } catch (error) {
            console.error('Send code error:', error)
            res.status(500).json({ 
                error: error.message,
                details: 'Failed to send verification code'
            })
        }
    }

    async handleVerifyCode(req, res) {
        try {
            const { code } = req.body
            
            if (!code) {
                return res.status(400).json({ error: 'Verification code required' })
            }
    
            console.log('Verifying code:', code)
    
            const result = await this.telegramClientManager.signIn(code)
            
            console.log('Verification result:', result)
    
            if (result.needsPassword) {
                return res.json({
                    success: false,
                    needsPassword: true,
                    message: '2FA password required'
                })
            }
    
            res.json({
                success: true,
                session: result.session,
                user: result.user
            })
        } catch (error) {
            console.error('Verification error:', error)
            res.status(500).json({ 
                error: error.message,
                details: 'Failed to verify code'
            })
        }
    }
    async handleVerifyPassword(req, res) {
        try {
            const { password } = req.body
            if (!password) {
                return res.status(400).json({ error: 'Password required' })
            }
            const result = await this.telegramClientManager.checkPassword(password)
            res.json(result)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }
}

module.exports = AuthenticationRoutes