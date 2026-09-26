/*
============================================================
 PLAYROVIVAL SERVER
 Node.js built-in modules ONLY
============================================================

 LAN ADDRESS:
   192.168.178.69

 PORT:
   3040

 LOCAL:
   http://192.168.178.69:3040

 TARGET WEBSITE:
   https://playrovival.neocities.org

 If HTTPS certificates exist:

   https://192.168.178.69:3040

 Certificate files:

   cert/server.key
   cert/server.crt

============================================================
*/

"use strict";

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

/* =========================================================
   CONFIG
========================================================= */

const SERVER_IP = "192.168.178.69";
const HOST = "0.0.0.0";
const PORT = 3040;

const NEOCITIES_SITE =
    "https://arovival.neocities.org";

const DATA_DIR =
    path.join(__dirname, "playro_data");

const CERT_DIR =
    path.join(__dirname, "cert");

const CERT_KEY =
    path.join(CERT_DIR, "server.key");

const CERT_FILE =
    path.join(CERT_DIR, "server.crt");

const MAX_BODY_SIZE = 2 * 1024 * 1024;

const SESSION_TIME =
    1000 * 60 * 60 * 24 * 30;

/* =========================================================
   LOGGING
========================================================= */

function log(message) {
    console.log(
        `[${new Date().toISOString()}] ${message}`
    );
}

/* =========================================================
   DIRECTORIES
========================================================= */

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
        recursive: true
    });
}

if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, {
        recursive: true
    });
}

/* =========================================================
   FILE DATABASE
========================================================= */

const files = {
    accounts:
        path.join(DATA_DIR, "accounts.json"),

    sessions:
        path.join(DATA_DIR, "sessions.json"),

    games:
        path.join(DATA_DIR, "games.json"),

    catalog:
        path.join(DATA_DIR, "catalog.json"),

    servers:
        path.join(DATA_DIR, "servers.json")
};

function writeJSON(file, data) {

    const temp =
        file + ".tmp";

    try {

        fs.writeFileSync(
            temp,
            JSON.stringify(
                data,
                null,
                2
            ),
            "utf8"
        );

        fs.renameSync(
            temp,
            file
        );

    } catch (error) {

        console.error(
            "Database write error:",
            error.message
        );

        try {
            if (fs.existsSync(temp)) {
                fs.unlinkSync(temp);
            }
        } catch {}
    }
}

function readJSON(file, fallback) {

    try {

        if (!fs.existsSync(file)) {

            writeJSON(
                file,
                fallback
            );

            return fallback;
        }

        const text =
            fs.readFileSync(
                file,
                "utf8"
            );

        if (!text.trim()) {

            writeJSON(
                file,
                fallback
            );

            return fallback;
        }

        return JSON.parse(text);

    } catch (error) {

        console.error(
            `Could not read ${file}:`,
            error.message
        );

        return fallback;
    }
}

/* =========================================================
   DATABASE
========================================================= */

const db = {

    accounts:
        readJSON(
            files.accounts,
            []
        ),

    sessions:
        readJSON(
            files.sessions,
            {}
        ),

    games:
        readJSON(
            files.games,
            [
                {
                    id: "welcome",
                    name:
                        "PlayRovival Welcome",
                    description:
                        "Welcome to PlayRovival!",
                    creator:
                        "PlayRovival",
                    players: 0,
                    maxPlayers: 20,
                    createdAt:
                        Date.now()
                }
            ]
        ),

    catalog:
        readJSON(
            files.catalog,
            [
                {
                    id: "starter",
                    name: "Starter Item",
                    description:
                        "PlayRovival starter item",
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
        ),

    servers:
        readJSON(
            files.servers,
            []
        )
};

function saveDatabase() {

    writeJSON(
        files.accounts,
        db.accounts
    );

    writeJSON(
        files.sessions,
        db.sessions
    );

    writeJSON(
        files.games,
        db.games
    );

    writeJSON(
        files.catalog,
        db.catalog
    );

    writeJSON(
        files.servers,
        db.servers
    );
}

/* =========================================================
   UTILITIES
========================================================= */

function id(prefix = "") {

    return (
        prefix +
        crypto
            .randomBytes(16)
            .toString("hex")
    );
}

function cleanString(
    value,
    max = 200
) {

    if (
        typeof value !==
        "string"
    ) {
        return "";
    }

    return value
        .trim()
        .slice(0, max);
}

/* =========================================================
   HTTP RESPONSES
========================================================= */

function json(res, status, data) {

    const body =
        JSON.stringify(data);

    res.writeHead(
        status,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Content-Length":
                Buffer.byteLength(body),

            "Access-Control-Allow-Origin":
                NEOCITIES_SITE,

            "Access-Control-Allow-Credentials":
                "true",

            "Cache-Control":
                "no-store"
        }
    );

    res.end(body);
}

function redirect(res) {

    res.writeHead(
        302,
        {
            Location:
                NEOCITIES_SITE
        }
    );

    res.end();
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
                        MAX_BODY_SIZE
                    ) {

                        reject(
                            new Error(
                                "Request too large"
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
   PASSWORDS
========================================================= */

function passwordHash(
    password,
    salt
) {

    return crypto
        .pbkdf2Sync(
            password,
            salt,
            120000,
            64,
            "sha512"
        )
        .toString("hex");
}

function createPassword(
    password
) {

    const salt =
        crypto
            .randomBytes(16)
            .toString("hex");

    return {
        salt,
        hash:
            passwordHash(
                password,
                salt
            )
    };
}

function verifyPassword(
    password,
    account
) {

    const hash =
        passwordHash(
            password,
            account.passwordSalt
        );

    return crypto.timingSafeEqual(
        Buffer.from(
            hash,
            "hex"
        ),
        Buffer.from(
            account.passwordHash,
            "hex"
        )
    );
}

/* =========================================================
   AUTH
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

    const cookies =
        req.headers.cookie ||
        "";

    const match =
        cookies.match(
            /(?:^|;\s*)session=([^;]+)/
        );

    if (match) {
        return decodeURIComponent(
            match[1]
        );
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

    return db.accounts.find(
        account =>
            account.id ===
            session.accountId
    ) || null;
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
   ONLINE PLAYERS
========================================================= */

const onlinePlayers =
    new Map();

/* =========================================================
   API
========================================================= */

async function api(
    req,
    res,
    pathname
) {

    /* -----------------------------------------------------
       API INFORMATION
    ----------------------------------------------------- */

    if (
        pathname ===
        "/api"
    ) {

        return json(
            res,
            200,
            {
                success: true,

                name:
                    "PlayRovival API",

                version:
                    "1.0.0",

                server:
                    SERVER_IP,

                port:
                    PORT,

                website:
                    NEOCITIES_SITE,

                endpoints: [

                    "/api/signup",
                    "/api/login",
                    "/api/logout",
                    "/api/me",

                    "/api/catalog",
                    "/api/buy",
                    "/api/inventory",

                    "/api/games",
                    "/api/games/create",

                    "/api/favorites",
                    "/api/players",
                    "/api/servers"
                ]
            }
        );
    }

    /* -----------------------------------------------------
       HEALTH
    ----------------------------------------------------- */

    if (
        pathname ===
        "/health"
    ) {

        return json(
            res,
            200,
            {
                success: true,

                status:
                    "online",

                server:
                    "PlayRovival",

                address:
                    SERVER_IP,

                port:
                    PORT,

                website:
                    NEOCITIES_SITE,

                uptime:
                    process.uptime(),

                time:
                    new Date()
                        .toISOString()
            }
        );
    }

    /* -----------------------------------------------------
       STATS
    ----------------------------------------------------- */

    if (
        pathname ===
        "/stats"
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

                onlinePlayers:
                    onlinePlayers.size,

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
        pathname ===
        "/api/signup"
    ) {

        if (
            req.method !==
            "POST"
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

        const displayName =
            cleanString(
                body.displayName ||
                username,
                40
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
                        "Invalid username"
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
                        "Password must contain at least 6 characters"
                }
            );
        }

        if (
            db.accounts.some(
                account =>
                    account.username
                        .toLowerCase() ===
                    username.toLowerCase()
            )
        ) {

            return json(
                res,
                409,
                {
                    success: false,
                    error:
                        "Username already exists"
                }
            );
        }

        const passwordData =
            createPassword(
                password
            );

        const account = {

            id:
                id("user_"),

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
            id("session_");

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
        pathname ===
        "/api/login"
    ) {

        if (
            req.method !==
            "POST"
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
            !verifyPassword(
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
                        "Invalid username or password"
                }
            );
        }

        const token =
            id("session_");

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
        pathname ===
        "/api/logout"
    ) {

        if (
            req.method !==
            "POST"
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

            delete db.sessions[
                token
            ];

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
        pathname ===
        "/api/me"
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
                        "Not logged in"
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
        pathname ===
        "/api/catalog"
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
        pathname ===
        "/api/inventory"
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
                        "Login required"
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
       GAMES
    ----------------------------------------------------- */

    if (
        pathname ===
        "/api/games"
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

                            players:
                                [
                                    ...onlinePlayers.values()
                                ]
                                .filter(
                                    player =>
                                        player.gameId ===
                                        game.id
                                )
                                .length
                        })
                    )
            }
        );
    }

    /* -----------------------------------------------------
       CREATE GAME
    ----------------------------------------------------- */

    if (
        pathname ===
        "/api/games/create"
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
                        "Login required"
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

        const game = {

            id:
                id("game_"),

            name:
                cleanString(
                    body.name,
                    80
                ),

            description:
                cleanString(
                    body.description,
                    500
                ),

            creator:
                account.username,

            creatorId:
                account.id,

            players:
                0,

            maxPlayers:
                20,

            createdAt:
                Date.now()
        };

        if (!game.name) {

            return json(
                res,
                400,
                {
                    success: false,
                    error:
                        "Game name required"
                }
            );
        }

        db.games.push(
            game
        );

        saveDatabase();

        log(
            `GAME CREATED: ${game.name}`
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
        pathname ===
        "/api/players"
    ) {

        return json(
            res,
            200,
            {
                success: true,

                players:
                    [
                        ...onlinePlayers.values()
                    ]
                    .map(
                        player => ({
                            id:
                                player.id,

                            username:
                                player.username,

                            gameId:
                                player.gameId ||
                                null
                        })
                    )
            }
        );
    }

    return json(
        res,
        404,
        {
            success: false,
            error:
                "API endpoint not found"
        }
    );
}

/* =========================================================
   LOCAL WEBSITE
========================================================= */

function localWebsite(
    req,
    res
) {

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>PlayRovival Server</title>

<style>

body {
    margin: 0;
    min-height: 100vh;

    display: flex;
    align-items: center;
    justify-content: center;

    background: #111;
    color: white;

    font-family:
        Arial,
        sans-serif;

    text-align: center;
}

.box {
    max-width: 700px;
    padding: 40px;
}

h1 {
    font-size: 42px;
}

.status {
    color: #55ff88;
    font-weight: bold;
}

button {
    padding: 14px 25px;
    border: 0;
    border-radius: 8px;

    background: #ff8a00;
    color: white;

    font-size: 16px;
    cursor: pointer;
}

</style>
</head>

<body>

<div class="box">

<h1>PlayRovival</h1>

<p class="status">
SERVER ONLINE
</p>

<p>
Local server:
</p>

<p>
<strong>
192.168.178.69:3040
</strong>
</p>

<p>
This server is running locally.
</p>

<p>
The main PlayRovival website is hosted on Neocities.
</p>

<button onclick="
window.location.href =
'https://playrovival.neocities.org'
">
Open PlayRovival
</button>

</div>

</body>
</html>
`;

    res.writeHead(
        200,
        {
            "Content-Type":
                "text/html; charset=utf-8",

            "Cache-Control":
                "no-store"
        }
    );

    res.end(html);
}

/* =========================================================
   REQUEST HANDLER
========================================================= */

async function requestHandler(
    req,
    res
) {

    const start =
        Date.now();

    try {

        const parsed =
            new URL(
                req.url,
                `http://${SERVER_IP}:${PORT}`
            );

        const pathname =
            parsed.pathname;

        log(
            `${req.method} ${pathname} FROM ${req.socket.remoteAddress}`
        );

        /* -------------------------------------------------
           CORS
        ------------------------------------------------- */

        if (
            req.method ===
            "OPTIONS"
        ) {

            res.writeHead(
                204,
                {
                    "Access-Control-Allow-Origin":
                        NEOCITIES_SITE,

                    "Access-Control-Allow-Methods":
                        "GET,POST,PUT,DELETE,OPTIONS",

                    "Access-Control-Allow-Headers":
                        "Content-Type, Authorization",

                    "Access-Control-Allow-Credentials":
                        "true"
                }
            );

            res.end();

            return;
        }

        /* -------------------------------------------------
           API
        ------------------------------------------------- */

        if (
            pathname.startsWith(
                "/api/"
            ) ||
            pathname ===
            "/api" ||
            pathname ===
            "/health" ||
            pathname ===
            "/stats"
        ) {

            await api(
                req,
                res,
                pathname
            );

        } else {

            /*
             * Any normal browser visit to the
             * local server goes to Neocities.
             */

            redirect(res);
        }

        log(
            `${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - start}ms)`
        );

    } catch (error) {

        console.error(
            "REQUEST ERROR:",
            error.stack || error
        );

        if (!res.headersSent) {

            json(
                res,
                500,
                {
                    success: false,
                    error:
                        "Internal server error"
                }
            );
        }
    }
}

/* =========================================================
   HTTP / HTTPS MODE
========================================================= */

let server;
let secure = false;

const certificatesExist =
    fs.existsSync(CERT_KEY) &&
    fs.existsSync(CERT_FILE);

if (certificatesExist) {

    try {

        const key =
            fs.readFileSync(
                CERT_KEY
            );

        const cert =
            fs.readFileSync(
                CERT_FILE
            );

        server =
            https.createServer(
                {
                    key,
                    cert
                },
                requestHandler
            );

        secure = true;

        log(
            "HTTPS certificate loaded."
        );

    } catch (error) {

        console.error(
            "HTTPS certificate error:",
            error.message
        );

        log(
            "Falling back to HTTP."
        );

        server =
            http.createServer(
                requestHandler
            );
    }

} else {

    server =
        http.createServer(
            requestHandler
        );

    log(
        "No HTTPS certificate found."
    );

    log(
        "Running in HTTP LAN mode."
    );
}

/* =========================================================
   START SERVER
========================================================= */

server.on(
    "error",
    error => {

        console.error(
            "SERVER ERROR:",
            error
        );

        if (
            error.code ===
            "EADDRINUSE"
        ) {

            console.error(
                `Port ${PORT} is already in use.`
            );
        }
    }
);

server.listen(
    PORT,
    HOST,
    () => {

        const protocol =
            secure
                ? "https"
                : "http";

        console.log("");
        console.log(
            "=============================================="
        );

        console.log(
            "        PLAYROVIVAL SERVER ONLINE"
        );

        console.log(
            "=============================================="
        );

        console.log("");

        console.log(
            `SERVER: ${protocol}://${SERVER_IP}:${PORT}`
        );

        console.log(
            `LISTEN: ${HOST}:${PORT}`
        );

        console.log("");

        console.log(
            `WEBSITE: ${NEOCITIES_SITE}`
        );

        console.log("");

        console.log(
            `API: ${protocol}://${SERVER_IP}:${PORT}/api`
        );

        console.log(
            `HEALTH: ${protocol}://${SERVER_IP}:${PORT}/health`
        );

        console.log(
            `STATS: ${protocol}://${SERVER_IP}:${PORT}/stats`
        );

        console.log("");

        console.log(
            "Browser requests to the local site redirect to:"
        );

        console.log(
            NEOCITIES_SITE
        );

        console.log("");

        console.log(
            "SERVER READY."
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

        console.error(
            "UNCAUGHT EXCEPTION:",
            error.stack || error
        );
    }
);

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "UNHANDLED REJECTION:",
            error
        );
    }
);

/* =========================================================
   SHUTDOWN
========================================================= */

function shutdown(
    signal
) {

    console.log(
        `Received ${signal}. Saving database...`
    );

    saveDatabase();

    server.close(
        () => {

            console.log(
                "PlayRovival server stopped."
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
