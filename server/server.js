const express = require("express");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const session = require('express-session');
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const path = require("path");
const axios = require('axios');
const app = express();
// ✅ Use the model
const User = require('./models/User');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
dotenv.config();
const mongoose = require("mongoose");
// ✅ Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/yourDB')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/api', adminRoutes);  
app.use(express.static(path.join(__dirname, 'public'))); // or wherever your HTML files are


// 🔒 CORS configuration (allowing both client and admin apps)
app.use(express.json());
app.use(authRoutes);

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'], // Update with actual frontend URLs
  credentials: true
}));
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));
app.use('/api/auth', require('./routes/auth')); 
// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Your routes
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', authRoutes);
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).send("User not found");
    }

    // If using plain passwords for now:
    if (user.password !== password) {
      return res.status(403).send("Incorrect password");
    }

    // Store session
    req.session.user = {
      id: user._id,
      email: user.email,
      role: user.role
    };

    // ✅ Redirect based on role
    if (user.role === 'admin') {
      return res.redirect('/admin');
    } else {
      return res.redirect('/portfolio');
    }

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send("Server error");
  }
});

// Middleware to authenticate JWT
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        console.log("Authentication failed: No token provided");
        return res.status(401).json({ message: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.userId);
        if (!req.user) {
            console.log("Authentication failed: User not found for token");
            return res.status(401).json({ message: "Invalid token" });
        }
        next();
    } catch (err) {
        console.error("Authentication error:", err);
        // Distinguish between token expiration and other errors
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Token expired. Please log in again." });
        }
        res.status(401).json({ message: "Invalid token." });
    }
};
function ensureAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  } else {
    return res.status(403).send('Access denied. Admins only.');
  }
}


// ✅ Protect the admin route with the middleware

app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, '../client/admin/admin.html');
  console.log('Server is attempting to send file:', adminPath);
  res.sendFile(adminPath);
});

// --- Authentication Routes ---
// Sign-Up
app.post("/signup", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: "Please provide all required fields." });
    }
    try {
        const existingUser = await User.findOne({ $or: [{ email }, { username }] }); // Check both email and username
        if (existingUser) {
            return res.status(400).json({ message: "User with this email or username already exists." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ success: true, message: "User registered successfully" });
    } catch (error) {
        console.error("Error during signup:", error);
        res.status(500).json({ message: "Error registering user." });
    }
});

// Sign-In
app.post("/signin", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Please provide both email and password." });
    }
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials." });
        }
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.status(200).json({ message: "Login successful", token });
    } catch (error) {
        console.error("Error during signin:", error);
        res.status(500).json({ message: "Error logging in." });
    }
});

// --- FMP API Proxy Endpoints (for Home) ---
// Endpoint to fetch single stock data from FMP (for watchlist price display)
app.get('/stock-data/:symbol', authenticate, async (req, res) => {
    const { symbol } = req.params;
    const FMP_API_KEY = process.env.FMP_API_KEY; // Use consistent key name

    if (!FMP_API_KEY) {
        console.error("FMP_API_KEY not set in environment variables.");
        return res.status(500).json({ message: "Server API key not configured for FMP." });
    }
    if (!symbol) {
        return res.status(400).json({ message: "Stock symbol is required." });
    }

    try {
        const response = await axios.get(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_API_KEY}`);
        if (response.data && response.data.length > 0) {
            res.json(response.data);
        } else {
            // FMP returns empty array for invalid symbols, so this is a valid 404 case
            res.status(404).json({ message: "Stock data not found for symbol or invalid symbol." });
        }
    } catch (error) {
        console.error(`Error fetching stock data for ${symbol}:`, error.message);
        if (axios.isAxiosError(error)) {
            console.error('Axios error response data:', error.response?.data);
            console.error('Axios error status:', error.response?.status);
            // Propagate specific FMP API errors if relevant (e.g., rate limits)
            if (error.response?.status === 401) { // Unauthorized with FMP key
                return res.status(500).json({ message: "FMP API key invalid or expired on server." });
            }
            if (error.response?.status === 403) { // Forbidden / Rate limit
                return res.status(429).json({ message: "FMP API rate limit reached or access forbidden." });
            }
        }
        res.status(500).json({ message: `Failed to fetch stock data for ${symbol} from external API.` });
    }
});

// API endpoint to get historical price data for a symbol (for the chart)
app.get('/api/stock-history/:symbol', authenticate, async (req, res) => {
    const { symbol } = req.params;
    const FMP_API_KEY = process.env.FMP_API_KEY; // Use consistent key name

    if (!FMP_API_KEY) {
        console.error("FMP_API_KEY not set in environment variables for historical data.");
        return res.status(500).json({ error: 'Server API key not configured.' });
    }

    try {
        const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?serietype=line&apikey=${FMP_API_KEY}`;
        const response = await axios.get(url);

        if (!response.data.historical || response.data.historical.length === 0) {
            return res.status(404).json({ error: 'No historical data found for this symbol.' });
        }

        const data = response.data.historical.map(day => ({
            time: day.date,
            value: day.close,
        }));

        res.json(data.reverse()); // Ensure chronological order for chart
    } catch (err) {
        console.error(`Error fetching historical stock data for ${symbol}:`, err.message);
        if (axios.isAxiosError(err)) {
            console.error('Axios error response data:', err.response?.data);
            console.error('Axios error status:', err.response?.status);
            if (err.response?.status === 401) {
                return res.status(500).json({ error: "FMP API key invalid or expired for historical data." });
            }
            if (err.response?.status === 403) {
                return res.status(429).json({ error: "FMP API rate limit reached for historical data." });
            }
            if (err.response?.status === 400) { // Often for invalid symbol in FMP
                return res.status(400).json({ error: "Invalid symbol or request for historical data." });
            }
        }
        res.status(500).json({ error: 'Failed to fetch historical stock data from API.' });
    }
});

// API route to get sector performance data
app.get('/api/sector-performance', async (req, res) => { // NOTE: Not authenticated in your original code
    const FMP_API_KEY = process.env.FMP_API_KEY; // Use consistent key name

    if (!FMP_API_KEY) {
        console.error("FMP_API_KEY missing in .env for /api/sector-performance");
        return res.status(500).json({ message: "Server API key for FMP is not configured." });
    }

    try {
        const url = `https://financialmodelingprep.com/api/v3/sectors-performance?apikey=${FMP_API_KEY}`; // Corrected endpoint if needed, usually just `/sectors-performance`
        const response = await axios.get(url);

        // FMP's sector performance sometimes returns an array directly, sometimes nested.
        // Adjust based on actual FMP response structure for your endpoint.
        // Assuming it's an array of objects directly now, or inside a 'sectorPerformance' key.
        if (response.data && Array.isArray(response.data)) { // If it's an array directly
             res.json({ sectorPerformance: response.data });
        } else if (response.data && response.data.sectorPerformance && Array.isArray(response.data.sectorPerformance)) {
            res.json({ sectorPerformance: response.data.sectorPerformance });
        }
         else {
            console.warn("Unexpected FMP response structure for sector performance:", response.data);
            res.status(500).json({ message: "Invalid response from FMP API for sector performance" });
        }
    } catch (error) {
        console.error("Error fetching sector performance:", error.message);
        if (axios.isAxiosError(error)) {
            console.error('Axios error response data for sector performance:', error.response?.data);
            console.error('Axios error status for sector performance:', error.response?.status);
            if (error.response?.status === 401) {
                return res.status(500).json({ message: "FMP API key invalid or expired for sector performance." });
            }
            if (error.response?.status === 403) {
                return res.status(429).json({ message: "FMP API rate limit reached for sector performance." });
            }
        }
        res.status(500).json({ message: "Failed to fetch sector performance" });
    }
});


// --- Watchlist Management Endpoints ---
// Get Watchlists
app.get("/watchlists", authenticate, async (req, res) => {
    try {
        console.log("Getting watchlists for user ID:", req.user._id);
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        res.json({ watchlists: user.watchlists });
    } catch (error) {
        console.error("Error fetching watchlists:", error);
        res.status(500).json({ message: "Error fetching watchlists." });
    }
});

// Update Watchlists
app.put("/watchlists", authenticate, async (req, res) => {
    const { watchlists } = req.body;
    console.log("Updating watchlists for user ID:", req.user._id);
    if (!Array.isArray(watchlists) || watchlists.length !== 3 || !watchlists.every(Array.isArray)) {
        console.error("Invalid watchlists format received from client.");
        return res.status(400).json({ message: "Invalid watchlists format. Expected a 2D array with 3 inner arrays." });
    }
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { watchlists: watchlists },
            { new: true, runValidators: true }
        );
        if (!updatedUser) {
            return res.status(404).json({ message: "User not found." });
        }
        console.log("Watchlists updated successfully.");
        res.json({ success: true, watchlists: updatedUser.watchlists });
    } catch (error) {
        console.error("Error updating watchlists:", error);
        res.status(500).json({ message: "Error updating watchlists." });
    }
});

// --- NEW ENDPOINT FOR WATCHLIST PIE CHART DATA ---
app.get('/api/user-watchlist-counts', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const watchlistData = user.watchlists.map((watchlist, index) => ({
            watchlistName: `Watchlist ${index + 1}`,
            stockCount: watchlist.length
        }));
        res.json(watchlistData);
    } catch (error) {
        console.error('Error fetching user watchlist counts:', error);
        res.status(500).json({ message: 'Failed to fetch user watchlist counts.' });
    }
});

// --- Youtube Endpoint ---
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MAX_RESULTS = 10;

app.get('/search', async (req, res) => {
    const { query } = req.query;
    console.log("Received Youtube query:", query);
    if (!query) {
        console.log("Error: Missing search query");
        return res.status(400).json({ error: 'Missing search query.' });
    }
    if (!YOUTUBE_API_KEY) {
        console.error("YOUTUBE_API_KEY is not set in environment variables.");
        return res.status(500).json({ error: 'YouTube API key not configured on the server.' });
    }
    try {
        const response = await axios.get(
            'https://www.googleapis.com/youtube/v3/search',
            {
                params: {
                    part: 'snippet',
                    q: query,
                    key: YOUTUBE_API_KEY,
                    maxResults: MAX_RESULTS,
                    type: 'video',
                },
                timeout: 10000
            }
        );
        console.log("YouTube API response status:", response.status);
        const videos = response.data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails?.medium?.url,
        }));
        res.json(videos);
    } catch (error) {
        console.error('Error fetching videos from YouTube:', error.message);
        if (axios.isAxiosError(error)) {
            console.error('Axios error response data:', error.response?.data);
            console.error('Axios error status:', error.response?.status);
            if (error.response?.status === 400 && error.response.data.error?.message.includes("API key not valid")) {
                return res.status(401).json({ error: "YouTube API key is invalid or has insufficient permissions." });
            }
            if (error.response?.status === 403 && error.response.data.error?.message.includes("quotaExceeded")) {
                return res.status(429).json({ error: "YouTube API daily quota exceeded." });
            }
        }
        res.status(500).json({ error: 'Failed to fetch videos from YouTube.' });
    }
});

// --- Twelve Data API Proxy Endpoints (for Markets) ---
app.get('/api/twelvedata/quote/:symbol', authenticate, async (req, res) => {
    const { symbol } = req.params;
    const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY;

    if (!TWELVEDATA_API_KEY) {
        console.error("TWELVEDATA_API_KEY not set in environment variables for quote.");
        return res.status(500).json({ message: "Server API key for Twelve Data is not configured." });
    }

    try {
        const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVEDATA_API_KEY}`;
        const response = await axios.get(url);
        // Twelve Data often returns a specific status or message for invalid symbols
        if (response.data.status === 'error') {
            return res.status(400).json({ message: response.data.message || `Invalid symbol: ${symbol}` });
        }
        res.json(response.data);
    } catch (error) {
        console.error(`Error fetching Twelve Data quote for ${symbol}:`, error.message);
        if (axios.isAxiosError(error)) {
            console.error('Axios error response data:', error.response?.data);
            console.error('Axios error status:', error.response?.status);
            if (error.response?.status === 401) {
                 return res.status(500).json({ message: "Twelve Data API key invalid or expired." });
            }
             if (error.response?.status === 429) {
                 return res.status(429).json({ message: "Twelve Data API rate limit reached." });
            }
        }
        res.status(500).json({ message: `Failed to fetch quote data for ${symbol}.` });
    }
});

app.get('/api/twelvedata/time_series/:symbol', authenticate, async (req, res) => {
    const { symbol } = req.params;
    const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY;

    if (!TWELVEDATA_API_KEY) {
        console.error("TWELVEDATA_API_KEY not set in environment variables for time series.");
        return res.status(500).json({ message: "Server API key for Twelve Data is not configured." });
    }

    try {
        const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1min&outputsize=30&apikey=${TWELVEDATA_API_KEY}`;
        const response = await axios.get(url);
        if (response.data.status === 'error') {
            return res.status(400).json({ message: response.data.message || `Invalid symbol: ${symbol}` });
        }
        res.json(response.data);
    } catch (error) {
        console.error(`Error fetching Twelve Data time series for ${symbol}:`, error.message);
        if (axios.isAxiosError(error)) {
            console.error('Axios error response data:', error.response?.data);
            console.error('Axios error status:', error.response?.status);
            if (error.response?.status === 401) {
                 return res.status(500).json({ message: "Twelve Data API key invalid or expired." });
            }
             if (error.response?.status === 429) {
                 return res.status(429).json({ message: "Twelve Data API rate limit reached." });
            }
        }
        res.status(500).json({ message: `Failed to fetch time series data for ${symbol}.` });
    }
});


// --- Static File Serving (ensure this is placed after all API routes) ---
// Serve static assets from the 'client' directory
app.use(express.static(path.join(__dirname, "../client")));
// Route: GET /admin -> serve client/admin/admin.html
app.get(/^\/admin\/?$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/admin/admin.html'));
});

// Catch-all for HTML files (optional, but good for direct URL access, e.g., /Markets.html)
app.get('/:pageName.html', (req, res) => {
    const { pageName } = req.params;
    const filePath = path.join(__dirname, `../client/${pageName}.html`);
    console.log(`Server is attempting to send file: ${filePath}`); // Debug log
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error serving ${pageName}.html:`, err);
            // More user-friendly 404 page
            res.status(404).send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>404 Not Found</title><style>body { font-family: sans-serif; text-align: center; margin-top: 50px; } h1 { color: #dc3545; }</style></head><body><h1>404 Page Not Found</h1><p>The page you requested could not be found.</p><a href="/">Go to Home</a></body></html>');
        }
    });
});
// Special route to serve admin dashboard
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/admin/admin.html'));
});

// Root route for the main page (e.g., when accessing http://localhost:5000/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 5000;
// Start server only if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
