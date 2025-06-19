// jobProcessor.js
require("dotenv").config();
const admin = require("firebase-admin");
const Replicate = require("replicate");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Initialize Firebase with service account key
const serviceAccount = require("./firebase-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "ai-tools-login-e0a25.appspot.com"
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const MODELS = {
  "pixverse-v4.5": "pixverse/pixverse-v4.5",
  "kling-v1.6-standard": "kwaivgi/kling-v1.6-standard",
  "kling-v2.0": "kwaivgi/kling-v2.0"
};

const pollJobs = async () => {
  console.log("Polling for jobs...");

  const snapshot = await db
    .collection("video_jobs")
    .where("status", "==", "queued")
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log("No queued jobs");
    return;
  }

  for (const docSnap of snapshot.docs) {
    const job = docSnap.data();
    const jobId = docSnap.id;
    console.log("Processing job:", jobId);

    try {
      const model = MODELS[job.modelId];
      if (!model) throw new Error("Unsupported model");

      const output = await replicate.run(model, {
        input: {
          prompt: job.prompt,
          image: job.imageUrl,
          width: job.width,
          height: job.height,
          duration: job.duration,
          motion: "normal"
        }
      });

      const videoUrl = output?.[0];
      if (!videoUrl) throw new Error("No video URL returned");

      const response = await fetch(videoUrl);
      const buffer = await response.buffer();
      const fileName = `video-results/${uuidv4()}.mp4`;
      const file = bucket.file(fileName);
      await file.save(buffer, { contentType: "video/mp4" });
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      await db.collection("video_jobs").doc(jobId).update({
        status: "completed",
        result: signedUrl
      });

      console.log("Job completed successfully");
    } catch (err) {
      console.error("Job failed:", err.message);
      await db.collection("video_jobs").doc(docSnap.id).update({ status: "failed" });
    }
  }
};

setInterval(pollJobs, 5000);
