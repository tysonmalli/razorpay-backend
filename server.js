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

// Initialize Firebase Admin with env-based service account
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "ai-tools-login-e0a25.appspot.com"
});

const db = admin.firestore();
const bucket = admin.storage().bucket(); // Firebase Storage Bucket instance

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

// Text to Image Generation Endpoint
app.post("/generate-image", async (req, res) => {
  const { prompt, aspectRatio, model } = req.body;

  if (!prompt || !model) {
    return res.status(400).json({ error: "Prompt and model required" });
  }

  const [width, height] = aspectRatio.split("x").map(Number);

  let modelVersion = "";
  if (model === "sdxl") {
    modelVersion = "stability-ai/sdxl";
  } else if (model === "imagen-4") {
    modelVersion = "google/imagen-4";
  } else if (model === "pixart-xl") {
    modelVersion = "pixray/pixart-xl";
  } else if (model === "minimax") {
    modelVersion = "minimax/image-01";
  } else {
    return res.status(400).json({ error: "Invalid model selected" });
  }

  try {
    const replicate = require("replicate");
    const replicateInstance = new replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const output = await replicateInstance.run(modelVersion, {
      input: {
        prompt,
        width,
        height
      }
    });

    const image = output?.[0];
    if (!image) {
      return res.status(500).json({ error: "Failed to generate image" });
    }

    res.json({ image });
  } catch (err) {
    console.error("Replicate API error:", err);
    res.status(500).json({ error: "Image generation failed" });
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
