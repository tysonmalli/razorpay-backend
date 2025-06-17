const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// Initialize Razorpay with env variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Initialize Firebase Admin
const serviceAccount = require("./firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Razorpay Order Endpoint
app.post("/create-order", async (req, res) => {
  try {
    const options = {
      amount: req.body.amount,
      currency: req.body.currency,
      receipt: "receipt_" + Date.now(),
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error("Error creating Razorpay order", err);
    res.status(500).send("Unable to create order");
  }
});

// Image to Video Generation Endpoint
app.post("/generate-video", async (req, res) => {
  const { userId, modelId, width, height, duration, imageUrl } = req.body;

  try {
    if (!userId || !modelId || !width || !height || !duration || !imageUrl) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const videoId = uuidv4();
    await db.collection('video_jobs').doc(videoId).set({
      userId,
      modelId,
      width,
      height,
      duration,
      imageUrl,
      createdAt: new Date(),
      status: 'queued'
    });

    return res.status(200).json({ success: true, jobId: videoId });
  } catch (error) {
    console.error('Video generation error:', error);
    return res.status(500).json({ error: 'Failed to generate video' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
