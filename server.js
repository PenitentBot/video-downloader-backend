const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Port
const PORT = process.env.PORT || 3000;

// ==================== DOWNLOAD ROUTES ====================

// Get video metadata
app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    const info = await ytdl.getInfo(url);
    
    res.json({
      title: info.videoDetails.title,
      duration: info.videoDetails.lengthSeconds,
      thumbnail: info.videoDetails.thumbnails[0]?.url,
      channelName: info.videoDetails.author?.name,
      views: info.videoDetails.viewCount
    });
  } catch (error) {
    console.error('Metadata error:', error.message);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// Download video or audio
app.post('/api/download-proxy', async (req, res) => {
  try {
    const { url, format } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    const info = await ytdl.getInfo(url);
    const fileName = info.videoDetails.title.replace(/[^\w\s]/g, '');

    if (format === 'audio') {
      // MP3 Download
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.mp3"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      
      const audioStream = ytdl(url, { quality: 'highestaudio' });
      audioStream.pipe(res);
      
      audioStream.on('error', (error) => {
        console.error('Audio download error:', error.message);
        res.status(500).json({ error: 'Download failed' });
      });
    } else {
      // MP4 Download
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.mp4"`);
      res.setHeader('Content-Type', 'video/mp4');
      
      const videoStream = ytdl(url, { quality: 'highest' });
      videoStream.pipe(res);
      
      videoStream.on('error', (error) => {
        console.error('Video download error:', error.message);
        res.status(500).json({ error: 'Download failed' });
      });
    }
  } catch (error) {
    console.error('Download proxy error:', error.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Get playlist videos
app.post('/api/playlist-videos', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    const info = await ytdl.getInfo(url);
    
    res.json({
      playlistTitle: info.videoDetails.title,
      videoCount: 'N/A',
      thumbnail: info.videoDetails.thumbnails[0]?.url
    });
  } catch (error) {
    console.error('Playlist error:', error.message);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server running ✅',
    timestamp: new Date().toLocaleString('en-IN'),
    endpoints: {
      metadata: 'POST /api/metadata',
      download: 'POST /api/download-proxy',
      playlist: 'POST /api/playlist-videos'
    }
  });
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`${'='.repeat(50)}\n`);
});

module.exports = app;
