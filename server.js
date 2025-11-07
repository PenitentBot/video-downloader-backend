const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
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

// Download video with quality options
app.post('/api/download-proxy', async (req, res) => {
  try {
    const { url, format, quality = '480' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    let command;

    if (format === 'audio') {
      // MP3 Download with max quality
      res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
      res.setHeader('Content-Type', 'audio/mpeg');
      
      command = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o - ${url}`;
    } else {
      // MP4 Download with quality options
      // 480p, 720p, 1080p
      let formatSpec;
      
      if (quality === '1080') {
        formatSpec = 'best[height<=1080][ext=mp4]';
      } else if (quality === '720') {
        formatSpec = 'best[height<=720][ext=mp4]';
      } else {
        // Default 480p
        formatSpec = 'best[height<=480][ext=mp4]';
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="video_${quality}p.mp4"`);
      res.setHeader('Content-Type', 'video/mp4');
      
      command = `yt-dlp -f "${formatSpec}" -o - ${url}`;
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

// Download playlist
app.post('/api/download-playlist', async (req, res) => {
  try {
    const { url, format, quality = '480' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    let command;

    if (format === 'audio') {
      // MP3 Playlist Download
      res.setHeader('Content-Disposition', 'attachment; filename="playlist.zip"');
      res.setHeader('Content-Type', 'application/zip');
      
      command = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "%(title)s.%(ext)s" --default-search "ytsearch" ${url} && zip -r playlist.zip *.mp3 && cat playlist.zip`;
    } else {
      // MP4 Playlist Download
      let formatSpec;
      
      if (quality === '1080') {
        formatSpec = 'best[height<=1080][ext=mp4]';
      } else if (quality === '720') {
        formatSpec = 'best[height<=720][ext=mp4]';
      } else {
        formatSpec = 'best[height<=480][ext=mp4]';
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="playlist_${quality}p.zip"`);
      res.setHeader('Content-Type', 'application/zip');
      
      command = `yt-dlp -f "${formatSpec}" -o "%(title)s.%(ext)s" --default-search "ytsearch" ${url} && zip -r playlist.zip *.mp4 && cat playlist.zip`;
    }

    const ytdlp = exec(command);
    
    ytdlp.stdout.pipe(res);
    
    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp error:', data.toString());
    });

    ytdlp.on('error', (error) => {
      console.error('Playlist download error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Playlist download failed' });
      }
    });

  } catch (error) {
    console.error('Playlist download error:', error.message);
    res.status(500).json({ error: 'Playlist download failed' });
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
    supportedSites: '1000+ websites',
    features: {
      videoQualities: ['480p (default)', '720p', '1080p'],
      audioQuality: 'Maximum (320kbps)',
      playlists: 'Supported (downloads as ZIP)'
    },
    endpoints: {
      metadata: 'POST /api/metadata',
      download: 'POST /api/download-proxy (with quality param)',
      playlistDownload: 'POST /api/download-playlist',
      playlistInfo: 'POST /api/playlist-videos'
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
  console.log(`🎥 Video: 480p (default), 720p, 1080p`);
  console.log(`🎵 Audio: Max quality (320kbps)`);
  console.log(`📦 Playlists: Supported (ZIP)`);
  console.log(`${'='.repeat(50)}\n`);
});

module.exports = app;
