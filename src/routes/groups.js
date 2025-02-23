const express = require('express')
const { Api } = require('telegram')
class GroupRoutes {
    constructor(telegramClientManager, configManager) {
        this.router = express.Router()
        this.telegramClientManager = telegramClientManager
        this.configManager = configManager
        this.setupRoutes()
    }

    setupRoutes() {
        this.router.get('/', this.handleListGroups.bind(this))
        this.router.get('/:id', this.handleGetGroup.bind(this))
        return this.router
    }

    async handleListGroups(req, res) {
        try {
            const client = await this.telegramClientManager.initClient()
            
            // Get dialogs using the correct API call
            const result = await client.invoke(new Api.messages.GetDialogs({
                offsetDate: 0,
                offsetId: 0,
                offsetPeer: new Api.InputPeerEmpty(),
                limit: 100,
                hash: BigInt(0)  // Use BigInt for the hash parameter
            }))
    
            // Extract and format the groups/channels
            const groups = result.chats.map(chat => ({
                id: chat.id.toString(),
                name: chat.title || '',
                type: chat.className === 'Channel' ? 'channel' : 'group',
                memberCount: chat.participantsCount || 0,
                lastMessageDate: new Date().toISOString() // Default to current date if not available
            }))
    
            res.json(groups)
        } catch (error) {
            console.error('Error fetching groups:', error)
            res.status(500).json({ 
                error: error.message,
                details: 'Failed to retrieve groups and channels'
            })
        }
    }

    async handleGetGroup(req, res) {
        try {
            const { id } = req.params
            const client = await this.telegramClientManager.initClient()
            const entity = await client.getEntity(id)

            const group = {
                id: entity.id.toString(),
                name: entity.title || entity.name,
                type: entity.isChannel ? 'channel' : 'group',
                memberCount: entity.participantsCount || 0,
                about: entity.about || '',
                joinDate: entity.date?.toISOString()
            }

            res.json(group)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }
}

module.exports = GroupRoutes