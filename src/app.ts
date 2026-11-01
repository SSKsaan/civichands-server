import cors from "cors";
import express from "express";
import helmet from "helmet";

const clientUrl = process.env.CLIENT_URL;

if (!clientUrl) {
  throw new Error("CLIENT_URL is not set");
}

const app = express();

app.use(helmet());
app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: "10kb" }));

app.get("/", (_request, response) => {
  response.json({ message: "CivicHands API is running" });
});

export default app;
