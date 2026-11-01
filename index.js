import express from "express";
import cors from "cors";
import helmet from "helmet";
import { MongoClient } from "mongodb";

const app = express();
const port = process.env.PORT || 5000;

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "10kb" }));

const client = new MongoClient(process.env.MONGODB_URI);
let db = null;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME);
    console.log("You successfully connected to MongoDB!");
  } catch (err) {
    console.dir(err);
  }
}

connectDB();

app.get("/", (req, res) => {
  res.json({ message: "CivicHands API is running" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});