const mongoose = require('mongoose');
const User = require('./models/User'); // Ensure this path is correct

mongoose.connect('mongodb://localhost:27017/userDB')
  .then(async () => {
    const result = await User.updateOne(
      { email: "prajaktakate2001@gmail.com" },
      { $set: { role: "admin" } }
    );
    console.log("✅ User role updated:", result);
    mongoose.disconnect();
  })
  .catch(err => console.error("❌ MongoDB connection error:", err));
