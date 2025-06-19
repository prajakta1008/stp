const bcrypt = require('bcrypt');

bcrypt.hash("admin@123", 10).then((hashedPassword) => {
  console.log("Hashed Password:", hashedPassword);
});
