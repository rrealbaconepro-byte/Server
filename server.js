"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

/* =========================================================
   AROVIVAL PUBLIC SERVER
   Node.js built-in modules only
========================================================= */

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 3040;

const WEBSITE = "https://arovival.neocities.org";

const DATA_DIR = path.join(__dirname, "playro_data");

const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const GAMES_FILE = path.join(DATA_DIR, "games.json");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");

const MAX_BODY = 2 * 1024 * 1024;
const SESSION_TIME = 30 * 24 * 60 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* =========================================================
   LOGGING
========================================================= */

function log(message) {
    console.log(
        `[${new Date().toISOString()}] ${message}`
    );
}

/* =========================================================
   JSON DATABASE
========================================================= */

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 2)
            );

            return fallback;
        }

        const text = fs.readFileSync(file, "utf8");

        if (!text.trim()) {
            return fallback;
        }

        return JSON.parse(text);

    } catch (error) {

        console.error(
            `Database read error: ${file}`,
            error.message
        );

        return fallback;
    }
}

function writeJSON(file, data) {

    const temp = file + ".tmp";

    try {

        fs.writeFileSync(
            temp,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        fs.renameSync(
            temp,
            file
        );

    } catch (error) {

        console.error(
            `Database write error: ${file}`,
            error.message
        );

        try {
            if (fs.existsSync(temp)) {
                fs.unlinkSync(temp);
            }
        } catch {}
    }
}

/* =========================================================
   DATABASE
========================================================= */

const db = {

    accounts:
        readJSON(
            ACCOUNTS_FILE,
            []
        ),

    sessions:
        readJSON(
            SESSIONS_FILE,
            {}
        ),

    games:
        readJSON(
            GAMES_FILE,
            [
                {
                    id: "welcome",
                    name: "AroVival Welcome",
                    description:
                        "Welcome to AroVival!",
                    creator: "AroVival",
                    creatorId: null,
                    maxPlayers: 20,
                    createdAt: Date.now()
                }
            ]
        ),

    catalog:
        readJSON(
            CATALOG_FILE,
            [
                {
                    id: "starter",
                    name: "Starter Item",
                    description:
                        "Free starter item",
                    price: 0,
                    type: "item"
                },

                {
                    id: "block-avatar",
                    name: "Block Avatar",
                    description:
                        "Classic block avatar",
                    price: 25,
                    type: "avatar"
                },

                {
                    id: "blue-shirt",
                    name: "Blue Shirt",
                    description:
                        "Blue player shirt",
                    price: 50,
                    type: "clothing"
                }
            ]
        )
};

function saveDatabase() {

    writeJSON(
        ACCOUNTS_FILE,
        db.accounts
    );

    writeJSON(
        SESSIONS_FILE,
        db.sessions
    );

    writeJSON(
        GAMES_FILE,
        db.games
    );

    writeJSON(
        CATALOG_FILE,
        db.catalog
    );
}

/* =========================================================
   UTILITIES
========================================================= */

function createID(prefix) {

    return (
        prefix +
        crypto
            .randomBytes(16)
            .toString("hex")
    );
}

function cleanString(value, max) {

    if (
        typeof value !== "string"
    ) {
        return "";
    }

    return value
        .trim()
        .slice(0, max);
}

/* =========================================================
   CORS
========================================================= */

function cors(res) {

    res.setHeader(
        "Access-Control-Allow-Origin",
        WEBSITE
    );

    res.setHeader(
        "Access-Control-Allow-Credentials",
        "true"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );
}

/* =========================================================
   RESPONSE
========================================================= */

function json(res, status, data) {

    const body =
        JSON.stringify(data);

    cors(res);

    res.writeHead(
        status,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Content-Length":
                Buffer.byteLength(body),

            "Cache-Control":
                "no-store"
        }
    );

    res.end(body);
}

/* =========================================================
   REQUEST BODY
========================================================= */

function getBody(req) {

    return new Promise(
        (resolve, reject) => {

            let body = "";

            req.on(
                "data",
                chunk => {

                    body +=
                        chunk.toString();

                    if (
                        Buffer.byteLength(body) >
                        MAX_BODY
                    ) {

                        reject(
                            new Error(
                                "Request body too large"
                            )
                        );

                        req.destroy();
                    }
                }
            );

            req.on(
                "end",
                () => {

                    if (!body) {
                        resolve({});
                        return;
                    }

                    try {

                        resolve(
                            JSON.parse(body)
                        );

                    } catch {

                        reject(
                            new Error(
                                "Invalid JSON"
                            )
                        );
                    }
                }
            );

            req.on(
                "error",
                reject
            );
        }
    );
}

/* =========================================================
   PASSWORD SECURITY
========================================================= */

function makePassword(password) {

    const salt =
        crypto
            .randomBytes(16)
            .toString("hex");

    const hash =
        crypto
            .pbkdf2Sync(
                password,
                salt,
                120000,
                64,
                "sha512"
            )
            .toString("hex");

    return {
        salt,
        hash
    };
}

function checkPassword(
    password,
    account
) {

    const hash =
        crypto
            .pbkdf2Sync(
                password,
                account.passwordSalt,
                120000,
                64,
                "sha512"
            )
            .toString("hex");

    const a =
        Buffer.from(
            hash,
            "hex"
        );

    const b =
        Buffer.from(
            account.passwordHash,
            "hex"
        );

    if (
        a.length !==
        b.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        a,
        b
    );
}

/* =========================================================
   AUTHENTICATION
========================================================= */

function getToken(req) {

    const authorization =
        req.headers.authorization ||
        "";

    if (
        authorization.startsWith(
            "Bearer "
        )
    ) {

        return authorization
            .slice(7)
            .trim();
    }

    return "";
}

function getAccount(req) {

    const token =
        getToken(req);

    if (!token) {
        return null;
    }

    const session =
        db.sessions[token];

    if (!session) {
        return null;
    }

    if (
        session.expires <
        Date.now()
    ) {

        delete db.sessions[token];

        saveDatabase();

        return null;
    }

    return (
        db.accounts.find(
            account =>
                account.id ===
                session.accountId
        ) || null
    );
}

function publicAccount(account) {

    return {

        id:
            account.id,

        username:
            account.username,

        displayName:
            account.displayName,

        avatar:
            account.avatar,

        coins:
            account.coins,

        inventory:
            account.inventory,

        favorites:
            account.favorites,

        createdAt:
            account.createdAt
    };
}

/* =========================================================
   API
========================================================= */

async function api(
    req,
    res,
    pathname
) {

    /* -----------------------------------------------------
       API INFO
    ----------------------------------------------------- */

    if (
        pathname === "/api"
    ) {

        return json(
            res,
            200,
            {
                success: true,

                name:
                    "AroVival API",

                version:
                    "1.0.0",

                website:
                    WEBSITE,

                port:
                    PORT,

                endpoints: [
                    "/api/signup",
                    "/api/login",
                    "/api/logout",
                    "/api/me",
                    "/api/catalog",
                    "/api/inventory",
                    "/api/buy",
                    "/api/games",
                    "/api/games/create",
                    "/api/favorites",
                    "/api/players"
                ]
            }
        );
    }

    /* -----------------------------------------------------
       HEALTH
    ----------------------------------------------------- */

    if (
        pathname === "/health"
    ) {

        return json(
            res,
            200,
            {
                success: true,
                status: "online",
                server: "AroVival",
                uptime:
                    process.uptime(),
                time:
                    new Date().toISOString()
            }
        );
    }

    /* -----------------------------------------------------
       STATS
    ----------------------------------------------------- */

    if (
        pathname === "/stats"
    ) {

        return json(
            res,
            200,
            {
                success: true,

                accounts:
                    db.accounts.length,

                games:
                    db.games.length,

                uptime:
                    process.uptime(),

                memory:
                    process.memoryUsage()
            }
        );
    }

    /* -----------------------------------------------------
       SIGNUP
    ----------------------------------------------------- */

    if (
        pathname === "/api/signup"
    ) {

        if (
            req.method !== "POST"
        ) {

            return json(
                res,
                405,
                {
                    success: false,
                    error:
                        "POST required"
                }
            );
        }

        let body;

        try {

            body =
                await getBody(req);

        } catch (error) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        error.message
                }
            );
        }

        const username =
            cleanString(
                body.username,
                32
            );

        const displayName =
            cleanString(
                body.displayName ||
                username,
                40
            );

        const password =
            String(
                body.password || ""
            );

        if (
            !/^[a-zA-Z0-9_]+$/
                .test(username)
        ) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        "Username may only contain letters, numbers and underscores."
                }
            );
        }

        if (
            password.length < 6
        ) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        "Password must contain at least 6 characters."
                }
            );
        }

        const exists =
            db.accounts.some(
                account =>
                    account.username
                        .toLowerCase() ===
                    username.toLowerCase()
            );

        if (exists) {

            return json(
                res,
                409,
                {
                    success: false,
                    error:
                        "Username already exists."
                }
            );
        }

        const passwordData =
            makePassword(
                password
            );

        const account = {

            id:
                createID("user_"),

            username,

            displayName,

            passwordSalt:
                passwordData.salt,

            passwordHash:
                passwordData.hash,

            avatar: {
                color:
                    "#ff8a00"
            },

            coins:
                100,

            inventory:
                ["starter"],

            favorites:
                [],

            createdAt:
                Date.now()
        };

        db.accounts.push(
            account
        );

        const token =
            createID("session_");

        db.sessions[token] = {

            accountId:
                account.id,

            created:
                Date.now(),

            expires:
                Date.now() +
                SESSION_TIME
        };

        saveDatabase();

        log(
            `ACCOUNT CREATED: ${username}`
        );

        return json(
            res,
            201,
            {
                success: true,

                token,

                account:
                    publicAccount(
                        account
                    )
            }
        );
    }

    /* -----------------------------------------------------
       LOGIN
    ----------------------------------------------------- */

    if (
        pathname === "/api/login"
    ) {

        if (
            req.method !== "POST"
        ) {

            return json(
                res,
                405,
                {
                    success: false,
                    error:
                        "POST required"
                }
            );
        }

        let body;

        try {

            body =
                await getBody(req);

        } catch (error) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        error.message
                }
            );
        }

        const username =
            cleanString(
                body.username,
                32
            );

        const password =
            String(
                body.password || ""
            );

        const account =
            db.accounts.find(
                a =>
                    a.username
                        .toLowerCase() ===
                    username.toLowerCase()
            );

        if (
            !account ||
            !checkPassword(
                password,
                account
            )
        ) {

            log(
                `LOGIN FAILED: ${username}`
            );

            return json(
                res,
                401,
                {
                    success: false,
                    error:
                        "Invalid username or password."
                }
            );
        }

        const token =
            createID("session_");

        db.sessions[token] = {

            accountId:
                account.id,

            created:
                Date.now(),

            expires:
                Date.now() +
                SESSION_TIME
        };

        saveDatabase();

        log(
            `LOGIN SUCCESS: ${username}`
        );

        return json(
            res,
            200,
            {
                success: true,

                token,

                account:
                    publicAccount(
                        account
                    )
            }
        );
    }

    /* -----------------------------------------------------
       LOGOUT
    ----------------------------------------------------- */

    if (
        pathname === "/api/logout"
    ) {

        if (
            req.method !== "POST"
        ) {

            return json(
                res,
                405,
                {
                    success: false
                }
            );
        }

        const token =
            getToken(req);

        if (token) {

            delete db.sessions[token];

            saveDatabase();
        }

        return json(
            res,
            200,
            {
                success: true
            }
        );
    }

    /* -----------------------------------------------------
       ME
    ----------------------------------------------------- */

    if (
        pathname === "/api/me"
    ) {

        const account =
            getAccount(req);

        if (!account) {

            return json(
                res,
                401,
                {
                    success: false,
                    error:
                        "Not logged in."
                }
            );
        }

        return json(
            res,
            200,
            {
                success: true,

                account:
                    publicAccount(
                        account
                    )
            }
        );
    }

    /* -----------------------------------------------------
       CATALOG
    ----------------------------------------------------- */

    if (
        pathname === "/api/catalog"
    ) {

        return json(
            res,
            200,
            {
                success: true,
                items:
                    db.catalog
            }
        );
    }

    /* -----------------------------------------------------
       INVENTORY
    ----------------------------------------------------- */

    if (
        pathname === "/api/inventory"
    ) {

        const account =
            getAccount(req);

        if (!account) {

            return json(
                res,
                401,
                {
                    success: false,
                    error:
                        "Login required."
                }
            );
        }

        const items =
            account.inventory
                .map(
                    itemId =>
                        db.catalog.find(
                            item =>
                                item.id ===
                                itemId
                        )
                )
                .filter(Boolean);

        return json(
            res,
            200,
            {
                success: true,
                items
            }
        );
    }

    /* -----------------------------------------------------
       BUY
    ----------------------------------------------------- */

    if (
        pathname === "/api/buy"
    ) {

        if (
            req.method !== "POST"
        ) {

            return json(
                res,
                405,
                {
                    success: false,
                    error:
                        "POST required"
                }
            );
        }

        const account =
            getAccount(req);

        if (!account) {

            return json(
                res,
                401,
                {
                    success: false,
                    error:
                        "Login required."
                }
            );
        }

        let body;

        try {

            body =
                await getBody(req);

        } catch (error) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        error.message
                }
            );
        }

        const item =
            db.catalog.find(
                x =>
                    x.id ===
                    body.itemId
            );

        if (!item) {

            return json(
                res,
                404,
                {
                    success: false,
                    error:
                        "Item not found."
                }
            );
        }

        if (
            account.inventory.includes(
                item.id
            )
        ) {

            return json(
                res,
                409,
                {
                    success: false,
                    error:
                        "You already own this item."
                }
            );
        }

        if (
            account.coins <
            item.price
        ) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        "Not enough coins."
                }
            );
        }

        account.coins -= item.price;

        account.inventory.push(
            item.id
        );

        saveDatabase();

        log(
            `PURCHASE: ${account.username} bought ${item.id}`
        );

        return json(
            res,
            200,
            {
                success: true,

                account:
                    publicAccount(
                        account
                    ),

                item
            }
        );
    }

    /* -----------------------------------------------------
       GAMES
    ----------------------------------------------------- */

    if (
        pathname === "/api/games"
    ) {

        return json(
            res,
            200,
            {
                success: true,

                games:
                    db.games.map(
                        game => ({
                            ...game,
                            players: 0
                        })
                    )
            }
        );
    }

    /* -----------------------------------------------------
       CREATE GAME
    ----------------------------------------------------- */

    if (
        pathname === "/api/games/create"
    ) {

        if (
            req.method !== "POST"
        ) {

            return json(
                res,
                405,
                {
                    success: false,
                    error:
                        "POST required"
                }
            );
        }

        const account =
            getAccount(req);

        if (!account) {

            return json(
                res,
                401,
                {
                    success: false,
                    error:
                        "Login required."
                }
            );
        }

        let body;

        try {

            body =
                await getBody(req);

        } catch (error) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        error.message
                }
            );
        }

        const name =
            cleanString(
                body.name,
                80
            );

        const description =
            cleanString(
                body.description,
                500
            );

        if (!name) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        "Game name required."
                }
            );
        }

        const game = {

            id:
                createID("game_"),

            name,

            description,

            creator:
                account.username,

            creatorId:
                account.id,

            maxPlayers:
                20,

            createdAt:
                Date.now()
        };

        db.games.push(game);

        saveDatabase();

        log(
            `GAME CREATED: ${name}`
        );

        return json(
            res,
            201,
            {
                success: true,
                game
            }
        );
    }

    /* -----------------------------------------------------
       PLAYERS
    ----------------------------------------------------- */

    if (
        pathname === "/api/players"
    ) {

        return json(
            res,
            200,
            {
                success: true,
                players: []
            }
        );
    }

    return json(
        res,
        404,
        {
            success: false,
            error:
                "API endpoint not found."
        }
    );
}

/* =========================================================
   REQUEST HANDLER
========================================================= */

async function requestHandler(req, res) {

    const start = Date.now();

    try {

        const parsed =
            new URL(
                req.url,
                `http://${req.headers.host || "localhost"}`
            );

        const pathname =
            parsed.pathname;

        log(
            `${req.method} ${pathname} FROM ${req.socket.remoteAddress}`
        );

        /* CORS preflight */

        if (
            req.method === "OPTIONS"
        ) {

            cors(res);

            res.writeHead(
                204
            );

            res.end();

            return;
        }

        /* API */

        if (
            pathname === "/api" ||
            pathname.startsWith("/api/") ||
            pathname === "/health" ||
            pathname === "/stats"
        ) {

            await api(
                req,
                res,
                pathname
            );

        } else {

            /*
             * The API server is separate from
             * the public Neocities frontend.
             *
             * Visiting the server root redirects
             * to AroVival.
             */

            redirect(res);
        }

        log(
            `${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - start}ms)`
        );

    } catch (error) {

        errorLog(
            "REQUEST ERROR",
            error
        );

        if (!res.headersSent) {

            json(
                res,
                500,
                {
                    success: false,
                    error:
                        "Internal server error."
                }
            );
        }
    }
}

/* =========================================================
   SERVER
========================================================= */

const server =
    http.createServer(
        requestHandler
    );

server.on(
    "error",
    error => {

        errorLog(
            "SERVER ERROR",
            error
        );

        if (
            error.code === "EADDRINUSE"
        ) {

            console.error(
                `Port ${PORT} is already in use.`
            );
        }
    }
);

/* =========================================================
   START
========================================================= */

server.listen(
    PORT,
    HOST,
    () => {

        console.log("");
        console.log(
            "=============================================="
        );
        console.log(
            "             AROVIVAL SERVER"
        );
        console.log(
            "=============================================="
        );

        console.log(
            `Listening: ${HOST}:${PORT}`
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            `Website: ${WEBSITE}`
        );

        console.log("");

        console.log(
            "API:"
        );

        console.log(
            "/api"
        );

        console.log(
            "/api/signup"
        );

        console.log(
            "/api/login"
        );

        console.log(
            "/api/me"
        );

        console.log(
            "/api/games"
        );

        console.log("");

        console.log(
            "Health:"
        );

        console.log(
            "/health"
        );

        console.log(
            "/stats"
        );

        console.log("");

        console.log(
            "AROVIVAL SERVER READY."
        );

        console.log(
            "=============================================="
        );

        console.log("");
    }
);

/* =========================================================
   ERROR PROTECTION
========================================================= */

process.on(
    "uncaughtException",
    error => {

        errorLog(
            "UNCAUGHT EXCEPTION",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    error => {

        errorLog(
            "UNHANDLED REJECTION",
            error
        );
    }
);

/* =========================================================
   SHUTDOWN
========================================================= */

function shutdown(signal) {

    log(
        `${signal} received. Saving database...`
    );

    saveDatabase();

    server.close(
        () => {

            log(
                "AroVival server stopped."
            );

            process.exit(0);
        }
    );

    setTimeout(
        () => process.exit(0),
        5000
    );
}

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);
'''

path = Path("/mnt/data/server.js")
path.write_text(code, encoding="utf-8")
print(f"Created {path} ({len(code.splitlines())} lines)")
print("Upload this as server.js in the GitHub repository.")
print("Important: the code is public-host ready, but permanent account storage on a free host may require a persistent database/storage service.")
print("The server listens on 0.0.0.0 and uses process.env.PORT.")
print("Neocities CORS origin is https://arovival.neocities.org.")
print("Do not put passwords, API keys, or secrets in this file.")
print("Download:", path)
"]
