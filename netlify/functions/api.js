const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Metadata endpoint using RapidAPI
app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    
    // Extract video ID
    const videoId = url.match(/(?:v=|\/)([\w-]{11})/)?.[1];
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Use YouTube Data API v3 (free, no download capability but gets metadata)
    const apiKey = process.env.YOUTUBE_API_KEY || 'YOUR_API_KEY';
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`);
    
    const video = response.data.items[0];
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({
      title: video.snippet.title,
      thumbnail: video.snippet.thumbnails.high.url,
      duration: video.contentDetails.duration,
      channel: video.snippet.channelTitle,
      views: parseInt(video.statistics.viewCount),
      url: url
    });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch metadata: ' + error.message });
  }
});

module.exports.handler = serverless(app);
