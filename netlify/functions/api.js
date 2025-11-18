const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Metadata endpoint
app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const info = await ytdl.getInfo(url);
    
    // Get available formats
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    res.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[0]?.url,
      duration: parseInt(info.videoDetails.lengthSeconds),
      channel: info.videoDetails.author.name,
      views: parseInt(info.videoDetails.viewCount),
      url: url,
      downloadUrl: info.videoDetails.video_url,
      formats: {
        video: formats.map(f => ({
          quality: f.qualityLabel,
          url: f.url,
          hasAudio: f.hasAudio
        })),
        audio: audioFormats.map(f => ({
          quality: f.audioBitrate + 'kbps',
          url: f.url
        }))
      }
    });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch metadata: ' + error.message });
  }
});

// Get direct download link
app.post('/api/download-link', async (req, res) => {
  try {
    const { url, format, quality } = req.body;

    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const info = await ytdl.getInfo(url);
    
    let downloadUrl;
    
    if (format === 'audio') {
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      const bestAudio = audioFormats[0];
      downloadUrl = bestAudio.url;
    } else {
      const videoFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
      const selectedFormat = videoFormats.find(f => f.qualityLabel?.includes(quality)) || videoFormats[0];
      downloadUrl = selectedFormat.url;
    }

    res.json({
      downloadUrl: downloadUrl,
      title: info.videoDetails.title
    });
  } catch (error) {
    console.error('Download link error:', error);
    res.status(500).json({ error: 'Failed to get download link: ' + error.message });
  }
});

module.exports.handler = serverless(app);
