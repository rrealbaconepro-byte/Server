const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

let serverStatus = "online"; // online | paused | offline

const users = [];
const games = [
  { id: 1, name: "Work at Pizza Place", players: 4283 },
  { id: 2, name: "Natural Disaster", players: 2118 },
  { id: 3, name: "Jailbreak", players: 8923 },
  { id: 4, name: "Hide & Seek", players: 1634 }
];

const friends = {
  OnlyTwentyCharacters: [
    "Builderman",
    "ClassicPlayer",
    "Guest2017"
  ]
};

// Signup
app.post("/api/signup", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });

  if (users.find(u => u.username === username))
    return res.status(409).json({ error: "Username already exists" });

  users.push({ username, password });

  res.json({
    success: true,
    username
  });
});

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find(
    u => u.username === username &&
         u.password === password
  );

  if (!user)
    return res.status(401).json({ error: "Invalid login" });

  res.json({
    success: true,
    username
  });
});

// Server status
app.get("/api/server", (req, res) => {
  res.json({
    status: serverStatus
  });
});

// Change server status (admin)
app.post("/api/server", (req, res) => {
  serverStatus = req.body.status;
  res.json({ status: serverStatus });
});

// Games
app.get("/api/games", (req, res) => {

  if (serverStatus !== "online") {
    return res.status(503).json({
      error: "Server paused/offline"
    });
  }

  res.json(games);

});

// Friends
app.get("/api/friends/:user", (req, res) => {

  if (serverStatus !== "online") {
    return res.status(503).json({
      error: "Server paused/offline"
    });
  }

  res.json(
    friends[req.params.user] || []
  );

});

app.listen(PORT, () => {
  console.log(`Rovival running on http://localhost:${PORT}`);
});
