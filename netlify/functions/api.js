const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const ytdl = require('ytdl-core');
const youtubedl = require('youtube-dl-exec');

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
    
    res.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[0]?.url,
      duration: parseInt(info.videoDetails.lengthSeconds),
      channel: info.videoDetails.author.name,
      views: parseInt(info.videoDetails.viewCount),
      url: url
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// Download proxy endpoint
app.post('/api/download-proxy', async (req, res) => {
  try {
    const { url, format, quality } = req.body;

    if (format === 'audio') {
      const output = await youtubedl(url, {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: quality || '128',
        output: '-'
      });

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
      res.send(output);
    } else {
      const videoQuality = quality === '1080' ? 'best' : `${quality}p`;
      
      const output = await youtubedl(url, {
        format: `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`,
        mergeOutputFormat: 'mp4',
        output: '-'
      });

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="video_${quality}p.mp4"`);
      res.send(output);
    }
  } catch (error) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// Playlist videos endpoint
app.post('/api/playlist-videos', async (req, res) => {
  try {
    const { url } = req.body;
    
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      flatPlaylist: true
    });

    const videos = info.entries.map(v => ({
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: v.thumbnail
    }));

    res.json({
      playlistTitle: info.title,
      videoCount: videos.length,
      thumbnail: info.thumbnail,
      videos: videos
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

module.exports.handler = serverless(app);
