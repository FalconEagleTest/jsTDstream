const { Api, TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')

class TelegramClientManager {
    constructor(configManager) {
        this.configManager = configManager
        this.client = null
        this.authState = {
            isAuthenticated: false,
            phoneNumber: null,
            phoneCodeHash: null,
            passwordNeeded: false,
            twoFactorHint: null
        }
    }

    async initClient(forceNew = false) {
        try {
            if (this.client?.connected && !forceNew) {
                return this.client
            }
    
            const apiId = parseInt(this.configManager.get('apiId'))
            const apiHash = this.configManager.get('apiHash')
            const stringSession = this.configManager.get('stringSession')
    
            console.log('Initializing client with:', {
                apiId,
                hasApiHash: !!apiHash,
                hasStringSession: !!stringSession
            })
    
            if (!apiId || !apiHash) {
                throw new Error('API credentials not configured')
            }
    
            if (!this.client || forceNew) {
                this.client = new TelegramClient(
                    new StringSession(stringSession || ''),
                    apiId,
                    apiHash,
                    {
                        connectionRetries: 5,
                        useWSS: true,
                        deviceModel: "Desktop",
                        systemVersion: "Windows 10",
                        appVersion: "1.0.0",
                        langCode: "en"
                    }
                )
            }
    
            if (!this.client.connected) {
                await this.client.connect()
                
                // After successful connection, save the session string
                if (this.client.session) {
                    const newSession = this.client.session.save()
                    if (newSession !== stringSession) {
                        console.log('Saving new session string')
                        this.configManager.set('stringSession', newSession)
                    }
                }
            }
    
            this.authState.isAuthenticated = await this.client.isUserAuthorized()
            console.log('Client authorized:', this.authState.isAuthenticated)
    
            return this.client
        } catch (error) {
            console.error('Client initialization error:', error)
            throw error
        }
    }

    
    async sendCode(phoneNumber) {
        try {
            // Initialize with fresh connection for auth
            await this.initClient(true)

            console.log('Sending code to:', phoneNumber)

            // Create proper API request
            const request = {
                phoneNumber: phoneNumber,
                apiId: parseInt(this.configManager.get('apiId')),
                apiHash: this.configManager.get('apiHash'),
                settings: new Api.CodeSettings({
                    allowFlashcall: false,
                    currentNumber: true,
                    allowAppHash: true,
                    allowMissedCall: false
                })
            }

            console.log('Send code request:', request)

            // Use the direct API call
            const result = await this.client.invoke(
                new Api.auth.SendCode(request)
            )

            console.log('Send code result:', result)

            this.authState.phoneNumber = phoneNumber
            this.authState.phoneCodeHash = result.phoneCodeHash

            return {
                success: true,
                phoneCodeHash: result.phoneCodeHash,
                timeout: result.timeout
            }
        } catch (error) {
            console.error('Error sending code:', error)
            if (error.message?.includes('AUTH_RESTART')) {
                await this.client.disconnect()
                throw new Error('Please try sending code again')
            }
            throw error
        }
    }


    async signIn(code) {
        try {
            if (!this.authState.phoneNumber || !this.authState.phoneCodeHash) {
                throw new Error('Phone number or code hash missing. Please send code first.')
            }

            console.log('Signing in with:', {
                phoneNumber: this.authState.phoneNumber,
                phoneCodeHash: this.authState.phoneCodeHash,
                code
            })

            // Use the direct API call
            const signInResult = await this.client.invoke(
                new Api.auth.SignIn({
                    phoneNumber: this.authState.phoneNumber,
                    phoneCodeHash: this.authState.phoneCodeHash,
                    phoneCode: code
                })
            )

            console.log('Sign in result:', signInResult)

            if (signInResult.className === 'auth.AuthorizationSignUpRequired') {
                throw new Error('This phone number is not registered with Telegram')
            }

            this.authState.isAuthenticated = true
            const session = this.client.session.save()
            console.log('Session saved:', session)
            this.configManager.set('stringSession', session)

            return { 
                success: true, 
                session,
                user: {
                    id: signInResult.user.id,
                    firstName: signInResult.user.firstName,
                    lastName: signInResult.user.lastName,
                    username: signInResult.user.username
                }
            }
        } catch (error) {
            console.error('Sign in error:', error)
            if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
                this.authState.passwordNeeded = true
                return { needsPassword: true }
            }
            if (error.message.includes('PHONE_CODE_INVALID')) {
                throw new Error('Invalid verification code')
            }
            throw error
        }
    }

    async checkPassword(password) {
        try {
            await this.client.checkPassword(password)
            this.authState.isAuthenticated = true
            const session = this.client.session.save()
            this.configManager.set('stringSession', session)
            return { success: true, session }
        } catch (error) {
            console.error('Password check error:', error)
            throw error
        }
    }

    async getGroups() {
        try {
            const result = await this.client.invoke(new Api.messages.GetDialogs({
                offsetDate: 0,
                offsetId: 0,
                offsetPeer: new Api.InputPeerEmpty(),
                limit: 100,
                hash: BigInt(0)
            }))

            return result.chats.map(chat => ({
                id: chat.id.toString(),
                name: chat.title || '',
                type: chat.className === 'Channel' ? 'channel' : 'group',
                memberCount: chat.participantsCount || 0
            }))
        } catch (error) {
            console.error('Error getting groups:', error)
            throw error
        }
    }

    // In telegramClient.js, update getGroupFiles method
    async getGroupFiles(groupId) {
        try {
            const inputPeer = await this.client.getInputEntity(groupId)
            
            // CHANGED: Use more generic search to include more file types
            const result = await this.client.invoke(new Api.messages.Search({
                peer: inputPeer,
                q: '',
                // HIGHLIGHT: Change filter to be more inclusive
                filter: new Api.InputMessagesFilterPhotoVideo(), // Instead of just video
                minDate: 0,
                maxDate: 0,
                offsetId: 0,
                addOffset: 0,
                limit: 100, // Increased limit
                maxId: 0,
                minId: 0,
                hash: BigInt(0)
            }))
    
            return result.messages
                .filter(msg => msg.media?.document) // Ensure media exists
                .map(msg => ({
                    id: msg.id.toString(),
                    name: msg.media.document.attributes
                        .find(attr => attr.className === 'DocumentAttributeFilename')?.fileName 
                        || `File_${msg.id}`, // CHANGED: More generic naming
                    size: msg.media.document.size,
                    mime: msg.media.document.mimeType,
                    duration: msg.media.document.attributes
                        .find(attr => attr.className === 'DocumentAttributeVideo')?.duration || 0,
                    width: msg.media.document.attributes
                        .find(attr => attr.className === 'DocumentAttributeVideo')?.w || 0,
                    height: msg.media.document.attributes
                        .find(attr => attr.className === 'DocumentAttributeVideo')?.h || 0,
                    date: msg.date
                }))
        } catch (error) {
            console.error('Error getting group files:', error)
            throw error
        }
    }

    async getFile(fileId) {
        try {
            const messages = await this.client.getMessages('me', {
                ids: [parseInt(fileId)]
            })

            if (!messages?.[0]?.media) {
                throw new Error('File not found')
            }

            return messages[0].media
        } catch (error) {
            console.error('Error getting file:', error)
            throw error
        }
    }

    async downloadFile(fileId, progressCallback) {
        try {
            const message = await this.getFile(fileId)
            return await this.client.downloadMedia(message, {
                progressCallback
            })
        } catch (error) {
            console.error('Error downloading file:', error)
            throw error
        }
    }
}

module.exports = TelegramClientManager