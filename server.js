const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Storage for UPI payments (use database in production)
const upiPayments = new Map();

// Port
const PORT = process.env.PORT || 3000;

// ==================== DOWNLOAD ROUTES ====================

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
      thumbnail: info.videoDetails.thumbnail?.thumbnails?.[0]?.url,
      channelName: info.videoDetails.author?.name,
      views: info.videoDetails.viewCount
    });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

app.post('/api/download-proxy', async (req, res) => {
  try {
    const { url, format, resolution, audioQuality, isPremium } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    const info = await ytdl.getInfo(url);
    const fileName = `${info.videoDetails.title.replace(/[^\w\s]/g, '')}.${format === 'audio' ? 'mp3' : 'mp4'}`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', format === 'audio' ? 'audio/mpeg' : 'video/mp4');

    if (format === 'audio') {
      // Audio download
      const audioStream = ytdl(url, { quality: 'highestaudio' });
      
      audioStream.pipe(res);
      audioStream.on('error', (error) => {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
      });
    } else {
      // Video download
      const videoStream = ytdl(url, { quality: resolution || '720' });
      
      videoStream.pipe(res);
      videoStream.on('error', (error) => {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
      });
    }
  } catch (error) {
    console.error('Download proxy error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

app.post('/api/playlist-videos', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    const info = await ytdl.getInfo(url);
    const videos = [];

    // Get first 10 videos from playlist
    const videoIds = info.videoDetails?.videoIds || [];
    
    for (let i = 0; i < Math.min(videoIds.length, 10); i++) {
      try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoIds[i]}`;
        const videoInfo = await ytdl.getInfo(videoUrl);
        
        videos.push({
          id: videoIds[i],
          title: videoInfo.videoDetails.title,
          duration: videoInfo.videoDetails.lengthSeconds,
          url: videoUrl,
          thumbnail: videoInfo.videoDetails.thumbnail?.thumbnails?.[0]?.url
        });
      } catch (err) {
        console.log(`Failed to fetch video ${i}: ${err.message}`);
      }
    }

    res.json({
      playlistTitle: info.videoDetails?.title,
      videoCount: videoIds.length,
      videos: videos
    });
  } catch (error) {
    console.error('Playlist error:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// ==================== UPI PAYMENT ROUTES ====================

app.post('/api/verify-upi-payment', async (req, res) => {
  try {
    const { transactionId, amount, daysCount, upiId, currency } = req.body;

    console.log('='.repeat(50));
    console.log('🔔 NEW UPI PAYMENT RECEIVED');
    console.log('='.repeat(50));
    console.log(`Transaction ID: ${transactionId}`);
    console.log(`Amount: ${amount} ${currency}`);
    console.log(`Duration: ${daysCount} days`);
    console.log(`UPI ID: ${upiId}`);
    console.log(`Timestamp: ${new Date().toLocaleString('en-IN')}`);
    console.log('='.repeat(50));

    // Store payment in memory (use database in production)
    upiPayments.set(transactionId, {
      transactionId,
      amount,
      daysCount,
      currency,
      upiId,
      status: 'pending_verification',
      createdAt: new Date().toISOString(),
      userApproved: false
    });

    // Save to file for backup
    const paymentsFile = path.join(__dirname, 'upi_payments.json');
    const allPayments = fs.existsSync(paymentsFile) 
      ? JSON.parse(fs.readFileSync(paymentsFile, 'utf8')) 
      : [];
    
    allPayments.push({
      transactionId,
      amount,
      daysCount,
      currency,
      upiId,
      status: 'pending_verification',
      createdAt: new Date().toISOString()
    });

    fs.writeFileSync(paymentsFile, JSON.stringify(allPayments, null, 2));

    res.json({
      success: true,
      message: 'Payment recorded! Admin will verify soon.',
      transactionId: transactionId,
      estimatedVerification: '1-2 hours'
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Payment recording failed' 
    });
  }
});

// Get all pending payments (FOR ADMIN)
app.get('/api/admin/pending-payments', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    
    // Simple admin key verification (use proper auth in production)
    if (adminKey !== 'your_secret_admin_key') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const paymentsFile = path.join(__dirname, 'upi_payments.json');
    const allPayments = fs.existsSync(paymentsFile) 
      ? JSON.parse(fs.readFileSync(paymentsFile, 'utf8')) 
      : [];

    const pendingPayments = allPayments.filter(p => p.status === 'pending_verification');

    res.json({
      total: allPayments.length,
      pending: pendingPayments.length,
      payments: pendingPayments
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Approve payment (FOR ADMIN)
app.post('/api/admin/approve-payment', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    const { transactionId } = req.body;

    if (adminKey !== 'your_secret_admin_key') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const paymentsFile = path.join(__dirname, 'upi_payments.json');
    let allPayments = JSON.parse(fs.readFileSync(paymentsFile, 'utf8'));

    // Find and approve payment
    const paymentIndex = allPayments.findIndex(p => p.transactionId === transactionId);
    
    if (paymentIndex === -1) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    allPayments[paymentIndex].status = 'approved';
    allPayments[paymentIndex].approvedAt = new Date().toISOString();

    fs.writeFileSync(paymentsFile, JSON.stringify(allPayments, null, 2));

    console.log(`✅ Payment APPROVED: ${transactionId}`);

    res.json({
      success: true,
      message: 'Payment approved successfully',
      payment: allPayments[paymentIndex]
    });

  } catch (error) {
    console.error('Approve payment error:', error);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

// Reject payment (FOR ADMIN)
app.post('/api/admin/reject-payment', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    const { transactionId, reason } = req.body;

    if (adminKey !== 'your_secret_admin_key') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const paymentsFile = path.join(__dirname, 'upi_payments.json');
    let allPayments = JSON.parse(fs.readFileSync(paymentsFile, 'utf8'));

    const paymentIndex = allPayments.findIndex(p => p.transactionId === transactionId);
    
    if (paymentIndex === -1) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    allPayments[paymentIndex].status = 'rejected';
    allPayments[paymentIndex].rejectionReason = reason;
    allPayments[paymentIndex].rejectedAt = new Date().toISOString();

    fs.writeFileSync(paymentsFile, JSON.stringify(allPayments, null, 2));

    console.log(`❌ Payment REJECTED: ${transactionId} - Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Payment rejected',
      payment: allPayments[paymentIndex]
    });

  } catch (error) {
    console.error('Reject payment error:', error);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

// Check payment status
app.get('/api/payment-status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const paymentsFile = path.join(__dirname, 'upi_payments.json');
    const allPayments = fs.existsSync(paymentsFile) 
      ? JSON.parse(fs.readFileSync(paymentsFile, 'utf8')) 
      : [];

    const payment = allPayments.find(p => p.transactionId === transactionId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({
      transactionId: payment.transactionId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      daysCount: payment.daysCount,
      createdAt: payment.createdAt,
      approvedAt: payment.approvedAt || null
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server running',
    timestamp: new Date().toLocaleString('en-IN'),
    endpoints: {
      download: '/api/download-proxy',
      metadata: '/api/metadata',
      playlist: '/api/playlist-videos',
      upiPayment: '/api/verify-upi-payment',
      adminPayments: '/api/admin/pending-payments'
    }
  });
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Download: http://localhost:${PORT}/api/download-proxy`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`${'='.repeat(50)}\n`);
});

module.exports = app;
