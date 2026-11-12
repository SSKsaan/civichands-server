import express from "express";
import cors from "cors";
import helmet from "helmet";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

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

const clientUrl = process.env.CLIENT_URL;
if (!clientUrl) {
  throw new Error("CLIENT_URL is not set");
}

const JWKS_URL = `${clientUrl}/api/auth/jwks`;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: clientUrl,
      audience: clientUrl,
    });
    if (!payload.email || typeof payload.email !== "string") {
      return res.status(401).json({ message: "Invalid token: missing email" });
    }
    req.user = { email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.use((err, _req, res, _next) => {
  console.error("Error:", err);
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({ message });
});

app.get("/", (req, res) => {
  res.json({ message: "CivicHands API is running" });
});

app.get("/events", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ message: "Service unavailable - database not configured" });
    }

    const now = new Date();
    const events = await db
      .collection("events")
      .find({ eventDate: { $gte: now } })
      .sort({ eventDate: 1 })
      .toArray();

    const formattedEvents = events.map((event) => {
      const { creatorEmail, _id, ...rest } = event;
      return { ...rest, id: _id.toString() };
    });

    res.json(formattedEvents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/events/:id", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ message: "Service unavailable - database not configured" });
    }

    let event = null;
    let eventIdObj;
    try {
      eventIdObj = new ObjectId(String(req.params.id));
      event = await db.collection("events").findOne({ _id: eventIdObj });
    } catch {
      return res.status(400).json({ message: "Invalid event ID format" });
    }

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const { creatorEmail, _id, ...rest } = event;

    // Fetch creator's stats from users collection
    const creator = await db
      .collection("users")
      .findOne({ email: creatorEmail }, { projection: { organizedCount: 1, joinedCount: 1 } });

    // Fetch joined users for this event
    const joinedEvents = await db
      .collection("joinedEvents")
      .find({ eventId: eventIdObj })
      .toArray();

    const volunteerEmails = joinedEvents.map((j) => j.userEmail);
    let joinedUsers = [];
    if (volunteerEmails.length > 0) {
      const users = await db
        .collection("users")
        .find({ email: { $in: volunteerEmails } })
        .project({ name: 1, email: 1, image: 1, organizedCount: 1, joinedCount: 1 })
        .toArray();
      joinedUsers = users.map((u) => ({
        name: u.name,
        email: u.email,
        image: u.image,
        organizedCount: u.organizedCount ?? 0,
        joinedCount: u.joinedCount ?? 0,
      }));
    }

    res.json({
      ...rest,
      id: _id.toString(),
      joinedUsers,
      creatorOrganizedCount: creator?.organizedCount ?? 0,
      creatorJoinedCount: creator?.joinedCount ?? 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/events/count/completed", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ message: "Service unavailable - database not configured" });
    }

    const now = new Date();
    const count = await db.collection("events").countDocuments({ eventDate: { $lt: now } });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});