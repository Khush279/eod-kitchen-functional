require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Google Cloud Vision API
const vision = require('@google-cloud/vision');

// Google Gemini AI
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve static files from the root directory
app.use(express.static(__dirname));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Initialize Google Cloud Vision client
const visionClient = new vision.ImageAnnotatorClient({
  apiKey: process.env.VISION_API_KEY
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Store for pantry items (in production, use a database)
let pantryItems = [];

// Routes

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'EOD Kitchen API is running' });
});

// Receipt OCR endpoint
app.post('/api/scan-receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('Processing receipt image...');
    
    // Process image with Google Cloud Vision API
    const [result] = await visionClient.textDetection({
      image: {
        content: req.file.buffer
      }
    });

    const detections = result.textAnnotations;
    const extractedText = detections.length > 0 ? detections[0].description : '';

    console.log('Extracted text:', extractedText);

    // Use Gemini to parse the receipt and extract grocery items
    const prompt = `Parse this grocery receipt text and extract only the food items with their quantities and estimated prices. Format as JSON array with objects containing: name, quantity, estimatedPrice. Ignore non-food items, taxes, totals, and store information.
