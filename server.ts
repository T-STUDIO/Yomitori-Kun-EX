import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = 3000;

// Cookie session for storing tokens
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "yomitori-secret"],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: "none",
    httpOnly: true,
  })
);

app.use(express.json({ limit: "50mb" }));

const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${APP_URL}/auth/callback`
);

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  // Note: Photos API requires additional setup and might be restricted. 
  // We'll use a generic scope for now if possible, or handle it gracefully.
  "https://www.googleapis.com/auth/photoslibrary.appendonly"
];

// Auth Routes
app.get("/api/auth/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    // Remove prompt: "consent" to avoid repeated consent screens if already authorized
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    req.session!.tokens = tokens;
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/auth/status", (req, res) => {
  res.json({ isAuthenticated: !!req.session?.tokens });
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ success: true });
});

// Google API Proxy Routes
async function getAuthenticatedClient(req: any) {
  if (!req.session?.tokens) return null;
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials(req.session.tokens);
  return client;
}

app.post("/api/google/sheets/append", async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) return res.status(401).json({ error: "Unauthorized" });

  let { spreadsheetId, range, values } = req.body;
  const sheets = google.sheets({ version: "v4", auth: client });

  try {
    // If no spreadsheetId, create a new one
    if (!spreadsheetId) {
      const ss = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: `よみとりくん 抽出データ - ${new Date().toLocaleDateString()}` }
        }
      });
      spreadsheetId = ss.data.spreadsheetId;
    }

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: range || 'Sheet1!A1',
      valueInputOption: "RAW",
      requestBody: { values },
    });
    
    res.json({ 
      ...response.data, 
      spreadsheetId, 
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` 
    });
  } catch (error: any) {
    console.error("Sheets error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/google/docs/create", async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) return res.status(401).json({ error: "Unauthorized" });

  const { title, content } = req.body;
  const docs = google.docs({ version: "v1", auth: client });

  try {
    const doc = await docs.documents.create({
      requestBody: { title },
    });
    const documentId = doc.data.documentId;
    
    await docs.documents.batchUpdate({
      documentId: documentId!,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    });
    res.json({ 
      ...doc.data, 
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit` 
    });
  } catch (error: any) {
    console.error("Docs error:", error);
    res.status(500).json({ error: error.message });
  }
});

// For Google Photos, it's a bit more complex as it's not part of the standard 'google' package in the same way.
// We'll use a fetch-based approach for Photos if needed, or just mock it for now with a message.
app.post("/api/google/photos/upload", async (req, res) => {
  const client = await getAuthenticatedClient(req);
  if (!client) return res.status(401).json({ error: "Unauthorized" });

  // Simplified Photos upload logic
  // In a real app, you'd use the Photos Library API
  res.status(501).json({ error: "Google Photos upload is not fully implemented in this demo due to API complexity, but the flow is ready." });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "docs")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "docs", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
