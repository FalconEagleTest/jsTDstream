// src/routes/files.js
const express = require('express')
const { Api } = require('telegram')

class FileRoutes {
    constructor(telegramClientManager, configManager) {
        this.router = express.Router()
        this.telegramClientManager = telegramClientManager
        this.configManager = configManager
        this.setupRoutes()
    }

    setupRoutes() {
        this.router.get('/group/:groupId', this.handleListGroupFiles.bind(this))
        this.router.get('/:id/stream', this.handleStreamFile.bind(this))
        return this.router
    }

    async handleListGroupFiles(req, res) {
        try {
            const client = await this.telegramClientManager.initClient()
            const { groupId } = req.params
    
            // CHANGED: Use more inclusive message search
            const messages = await client.getMessages(groupId, {
                limit: 100,
                // HIGHLIGHT: Use more generic filter
                filter: Api.InputMessagesFilterPhotoVideo
            })
    
            const files = messages
                // CHANGED: More inclusive filtering
                .filter(msg => msg.media?.document) // Ensure document exists
                .map(msg => ({
                    id: msg.id,
                    name: msg.media?.document?.attributes?.find(
                        attr => attr.fileName
                    )?.fileName || `File_${msg.id}`, // More generic naming
                    size: msg.media?.document?.size || 0,
                    mime: msg.media?.document?.mimeType,
                    duration: msg.media?.document?.attributes?.find(
                        attr => attr.className === 'DocumentAttributeVideo'
                    )?.duration || 0,
                    width: msg.media?.document?.attributes?.find(
                        attr => attr.className === 'DocumentAttributeVideo'
                    )?.w || 0,
                    height: msg.media?.document?.attributes?.find(
                        attr => attr.className === 'DocumentAttributeVideo'
                    )?.h || 0
                }))
    
            res.json({ success: true, files })
        } catch (error) {
            console.error('Error listing files:', error)
            res.status(500).json({ error: error.message })
        }
    }

    async handleStreamFile(req, res) {
        try {
            const client = await this.telegramClientManager.initClient()
            const { id } = req.params
            const groupId = req.query.groupId
    
            // Increased chunk size and added parallel chunks
            const CHUNK_SIZE = 256 * 1024 // 256KB
            const MAX_PARALLEL_CHUNKS = 10 // Number of chunks to fetch simultaneously
    
            let messages;
            try {
                if (groupId) {
                    messages = await client.getMessages(groupId, {
                        ids: [parseInt(id)],
                        limit: 1
                    })
                }
    
                if (!messages?.length) {
                    messages = await client.getMessages('me', {
                        ids: [parseInt(id)],
                        limit: 1
                    })
                }
            } catch (searchError) {
                return res.status(404).json({ 
                    error: 'File not found', 
                    details: { fileId: id, groupId: groupId } 
                })
            }
    
            if (!messages?.[0]?.media) {
                return res.status(404).json({ 
                    error: 'No media found', 
                    details: { fileId: id, groupId: groupId } 
                })
            }
    
            const media = messages[0].media
            const document = media.document
    
            if (!document) {
                return res.status(404).json({ 
                    error: 'No document found', 
                    details: { fileId: id, mediaType: media.className } 
                })
            }
    
            const size = Number(document.size)
            const mimeType = document.mimeType || 'application/octet-stream'
    
            const range = req.headers.range
            let start = 0
            let end = size - 1
    
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-")
                start = parseInt(parts[0], 10)
                end = parts[1] ? parseInt(parts[1], 10) : size - 1
    
                if (isNaN(start) || start >= size) {
                    return res.status(416).json({ 
                        error: 'Requested range not satisfiable',
                        details: { start, size } 
                    })
                }
    
                end = Math.min(end, size - 1)
    
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': mimeType
                })
            } else {
                res.writeHead(200, {
                    'Content-Length': size,
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes'
                })
            }
    
            const location = new Api.InputDocumentFileLocation({
                id: document.id,
                accessHash: document.accessHash,
                fileReference: document.fileReference,
                thumbSize: ''
            })
    
            let offset = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE
            const requestEnd = end
    
            // Parallel chunk retrieval
            const fetchChunk = async (chunkOffset) => {
                try {
                    const result = await client.invoke(new Api.upload.GetFile({
                        location: location,
                        offset: chunkOffset,
                        limit: CHUNK_SIZE
                    }))
                    return { offset: chunkOffset, bytes: result.bytes }
                } catch (error) {
                    console.error(`Error fetching chunk at ${chunkOffset}:`, error)
                    return null
                }
            }
    
            while (offset <= requestEnd) {
                if (res.destroyed) break
    
                // Fetch multiple chunks in parallel
                const chunkPromises = []
                for (let i = 0; i < MAX_PARALLEL_CHUNKS && offset <= requestEnd; i++) {
                    chunkPromises.push(fetchChunk(offset))
                    offset += CHUNK_SIZE
                }
    
                // Wait for chunks and write in order
                const chunks = await Promise.all(chunkPromises)
                for (const chunk of chunks) {
                    if (!chunk) continue
    
                    let bytes = chunk.bytes
                    
                    // Trim bytes for precise range
                    if (range) {
                        if (chunk.offset < start) {
                            bytes = bytes.slice(start - chunk.offset)
                        }
                        if (chunk.offset + bytes.length > end + 1) {
                            bytes = bytes.slice(0, end - chunk.offset + 1)
                        }
                    }
    
                    if (!res.write(bytes)) {
                        await new Promise(resolve => res.once('drain', resolve))
                    }
                }
            }
    
            res.end()
        } catch (error) {
            console.error('Streaming error:', error)
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'Error streaming file', 
                    details: error.message 
                })
            } else {
                res.end()
            }
        }
    }
}

module.exports = FileRoutes