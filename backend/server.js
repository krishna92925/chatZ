import dotenv from "dotenv"
dotenv.config();

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
}

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http"

import { Server } from "socket.io"

import { connectDB } from "./utils/db.js";

import authRoutes from "./routes/authRoutes.js"
import conversationRoutes from "./routes/conversationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js"

import { initializeSocket } from "./socket.js";
import { socketAuthMiddleware } from "./socket/socketAuthMiddleware.js";

import RedisService from "./services/redisService.js";

const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}))
app.use(cookieParser())

app.use(express.json())

// routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/conversations', messageRoutes);


 await connectDB();


const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ["GET", "POST"]
    },
    pingInterval: 25000,
    pingTimeout: 60000,
})
io.use(socketAuthMiddleware);

await initializeSocket(io);

void RedisService.initialize();
try {
   
    const PORT = process.env.PORT || 4000;
    httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on port: ${PORT}`);
    })
} catch (error) {
    console.error("The server failed to start", error);
    process.exit(1);
}

