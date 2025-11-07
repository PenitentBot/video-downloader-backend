const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 3000;

// ==================== DOWNLOAD ROUTES ====================

// Get video metadata
app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    exec(`yt-dlp -j ${url}`, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch metadata' });
      }

      try {
        const info = JSON.parse(stdout);
        
        res.json({
          title: info.title || 'Unknown',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || '',
          channel: info.uploader || 'Unknown',
          views: info.view_count || 0
        });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse metadata' });
      }
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

    let command;

    if (format === 'audio') {
      // MP3 Download
      res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
      res.setHeader('Content-Type', 'audio/mpeg');
      
      command = `yt-dlp -x --audio-format mp3 --audio-quality 128 -o - ${url}`;
    } else {
      // MP4 Download
      res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
      res.setHeader('Content-Type', 'video/mp4');
      
      command = `yt-dlp -f "best[ext=mp4]" -o - ${url}`;
    }

    const ytdlp = exec(command);
    
    ytdlp.stdout.pipe(res);
    
    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp error:', data.toString());
    });

    ytdlp.on('error', (error) => {
      console.error('Download error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    });

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

    exec(`yt-dlp -j ${url}`, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch playlist' });
      }

      try {
        const info = JSON.parse(stdout);
        
        res.json({
          playlistTitle: info.title || 'Playlist',
          videoCount: info.n_entries || 0,
          thumbnail: info.thumbnail || ''
        });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse playlist' });
      }
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
    supportedSites: '1000+ websites (YouTube, Vimeo, Instagram, TikTok, etc)',
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
  console.log(`📺 Supports 1000+ websites!`);
  console.log(`${'='.repeat(50)}\n`);
});

module.exports = app;
