const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 3040;

const WEBSITE = "https://rovival.onrender.com";

const DATA_DIR = path.join(__dirname, "playro_data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILES = {
    accounts: path.join(DATA_DIR, "accounts.json"),
    sessions: path.join(DATA_DIR, "sessions.json"),
    games: path.join(DATA_DIR, "games.json"),
    catalog: path.join(DATA_DIR, "catalog.json"),
    inventory: path.join(DATA_DIR, "inventory.json"),
    avatars: path.join(DATA_DIR, "avatars.json")
};

function loadJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
            return fallback;
        }

        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.error("Failed loading:", file, error);
        return fallback;
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let accounts = loadJSON(FILES.accounts, []);
let sessions = loadJSON(FILES.sessions, []);
let games = loadJSON(FILES.games, []);
let catalog = loadJSON(FILES.catalog, []);
let inventory = loadJSON(FILES.inventory, []);
let avatars = loadJSON(FILES.avatars, []);


// ============================================
// WEBSITE FILE SERVER
// ============================================

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf"
};

function serveWebsiteFile(req, res, pathname) {
    try {
        const decoded = decodeURIComponent(pathname);

        const relativePath =
            decoded === "/"
                ? "index.html"
                : decoded.replace(/^\/+/, "");

        const root = path.resolve(__dirname);
        const filePath = path.resolve(root, relativePath);

        // Prevent ../ path traversal
        if (
            filePath !== root &&
            !filePath.startsWith(root + path.sep)
        ) {
            res.writeHead(403);
            res.end("Forbidden");
            return true;
        }

        if (!fs.existsSync(filePath)) {
            return false;
        }

        const stat = fs.statSync(filePath);

        if (!stat.isFile()) {
            return false;
        }

        const ext = path.extname(filePath).toLowerCase();

        const contentType =
            MIME_TYPES[ext] ||
            "application/octet-stream";

        const data = fs.readFileSync(filePath);

        res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": data.length
        });

        res.end(data);

        return true;

    } catch (error) {
        console.error("Website file error:", error);
        return false;
    }
}


// ============================================
// HTTP HELPERS
// ============================================

function sendJSON(res, req, status, data) {
    const body = JSON.stringify(data);

    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Access-Control-Allow-Origin":
            req.headers.origin || WEBSITE,
        "Access-Control-Allow-Credentials": "true"
    });

    res.end(body);
}

function sendText(res, req, status, text) {
    res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(text)
    });

    res.end(text);
}

function parseCookies(req) {
    const cookies = {};

    const header = req.headers.cookie || "";

    header.split(";").forEach(part => {
        const index = part.indexOf("=");

        if (index === -1) return;

        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();

        cookies[key] = decodeURIComponent(value);
    });

    return cookies;
}

function makeID() {
    return crypto.randomBytes(16).toString("hex");
}

function makeToken() {
    return crypto.randomBytes(32).toString("hex");
}

function hashPassword(password, salt) {
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

function createPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");

    return {
        salt,
        hash: hashPassword(password, salt)
    };
}

function verifyPassword(password, salt, hash) {
    return hashPassword(password, salt) === hash;
}

function getSession(req) {
    const cookies = parseCookies(req);

    if (!cookies.session) {
        return null;
    }

    return sessions.find(
        session => session.token === cookies.session
    ) || null;
}

function getUser(req) {
    const session = getSession(req);

    if (!session) {
        return null;
    }

    return accounts.find(
        account => account.id === session.userId
    ) || null;
}

function setSessionCookie(res, token) {
    res.setHeader(
        "Set-Cookie",
        "session=" +
        encodeURIComponent(token) +
        "; Path=/; HttpOnly; SameSite=Lax"
    );
}

function clearSessionCookie(res) {
    res.setHeader(
        "Set-Cookie",
        "session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    );
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;

            if (body.length > 1024 * 1024) {
                reject(new Error("Request body too large"));
                req.destroy();
            }
        });

        req.on("end", () => {
            try {
                resolve(
                    body
                        ? JSON.parse(body)
                        : {}
                );
            } catch {
                reject(
                    new Error("Invalid JSON")
                );
            }
        });

        req.on("error", reject);
    });
}


// ============================================
// SERVER
// ============================================

const server = http.createServer(async (req, res) => {

    const requestURL =
        new URL(
            req.url,
            "http://" +
            (req.headers.host || "localhost")
        );

    const pathname = requestURL.pathname;


    // ========================================
    // CORS
    // ========================================

    const origin = req.headers.origin;

    if (
        origin === WEBSITE ||
        origin === "http://localhost:3000" ||
        origin === "http://127.0.0.1:3000"
    ) {
        res.setHeader(
            "Access-Control-Allow-Origin",
            origin
        );

        res.setHeader(
            "Access-Control-Allow-Credentials",
            "true"
        );
    }

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin":
                origin || WEBSITE,
            "Access-Control-Allow-Credentials":
                "true",
            "Access-Control-Allow-Headers":
                "Content-Type",
            "Access-Control-Allow-Methods":
                "GET,POST,PUT,DELETE,OPTIONS"
        });

        res.end();
        return;
    }


    // ========================================
    // IMPORTANT:
    // WEBSITE ROUTING MUST BE INSIDE
    // createServer()
    // ========================================

    if (
        req.method === "GET" &&
        !pathname.startsWith("/api/")
    ) {

        // First try the actual requested file.
        if (
            serveWebsiteFile(
                req,
                res,
                pathname === "/"
                    ? "/index.html"
                    : pathname
            )
        ) {
            return;
        }

        // If it doesn't exist,
        // send index.html instead.
        if (
            serveWebsiteFile(
                req,
                res,
                "/index.html"
            )
        ) {
            return;
        }

        sendText(
            res,
            req,
            500,
            "index.html could not be found on the server."
        );

        return;
    }


    // ========================================
    // HEALTH
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/health"
    ) {
        sendJSON(res, req, 200, {
            ok: true,
            service: "Rovival",
            status: "online"
        });

        return;
    }


    if (
        req.method === "GET" &&
        pathname === "/api/health"
    ) {
        sendJSON(res, req, 200, {
            ok: true,
            service: "Rovival API",
            status: "online"
        });

        return;
    }


    // ========================================
    // STATS
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/api/stats"
    ) {
        sendJSON(res, req, 200, {
            accounts: accounts.length,
            games: games.length,
            catalog: catalog.length,
            inventory: inventory.length,
            sessions: sessions.length
        });

        return;
    }


    // ========================================
    // SIGNUP
    // ========================================

    if (
        req.method === "POST" &&
        pathname === "/api/signup"
    ) {

        try {
            const body = await readBody(req);

            const username =
                String(body.username || "").trim();

            const password =
                String(body.password || "");

            if (
                username.length < 3 ||
                username.length > 20
            ) {
                sendJSON(res, req, 400, {
                    error: "Username must be 3-20 characters."
                });

                return;
            }

            if (password.length < 6) {
                sendJSON(res, req, 400, {
                    error: "Password must be at least 6 characters."
                });

                return;
            }

            if (
                accounts.some(
                    account =>
                        account.username.toLowerCase() ===
                        username.toLowerCase()
                )
            ) {
                sendJSON(res, req, 409, {
                    error: "Username already exists."
                });

                return;
            }

            const passwordData =
                createPassword(password);

            const account = {
                id: makeID(),
                username,
                passwordHash: passwordData.hash,
                passwordSalt: passwordData.salt,
                createdAt: new Date().toISOString()
            };

            accounts.push(account);

            saveJSON(
                FILES.accounts,
                accounts
            );

            avatars.push({
                userId: account.id,
                bodyColor: "#ffd323",
                shirt: "#2469a8",
                pants: "#222f5b",
                hat: false
            });

            saveJSON(
                FILES.avatars,
                avatars
            );

            const token = makeToken();

            sessions.push({
                token,
                userId: account.id,
                createdAt: new Date().toISOString()
            });

            saveJSON(
                FILES.sessions,
                sessions
            );

            setSessionCookie(res, token);

            sendJSON(res, req, 201, {
                ok: true,
                user: {
                    id: account.id,
                    username: account.username
                }
            });

            return;

        } catch (error) {
            sendJSON(res, req, 400, {
                error: error.message
            });

            return;
        }
    }


    // ========================================
    // LOGIN
    // ========================================

    if (
        req.method === "POST" &&
        pathname === "/api/login"
    ) {

        try {
            const body = await readBody(req);

            const username =
                String(body.username || "").trim();

            const password =
                String(body.password || "");

            const account =
                accounts.find(
                    user =>
                        user.username.toLowerCase() ===
                        username.toLowerCase()
                );

            if (
                !account ||
                !verifyPassword(
                    password,
                    account.passwordSalt,
                    account.passwordHash
                )
            ) {
                sendJSON(res, req, 401, {
                    error: "Invalid username or password."
                });

                return;
            }

            const token = makeToken();

            sessions.push({
                token,
                userId: account.id,
                createdAt: new Date().toISOString()
            });

            saveJSON(
                FILES.sessions,
                sessions
            );

            setSessionCookie(res, token);

            sendJSON(res, req, 200, {
                ok: true,
                user: {
                    id: account.id,
                    username: account.username
                }
            });

            return;

        } catch (error) {
            sendJSON(res, req, 400, {
                error: error.message
            });

            return;
        }
    }


    // ========================================
    // LOGOUT
    // ========================================

    if (
        req.method === "POST" &&
        pathname === "/api/logout"
    ) {

        const cookies = parseCookies(req);

        sessions =
            sessions.filter(
                session =>
                    session.token !== cookies.session
            );

        saveJSON(
            FILES.sessions,
            sessions
        );

        clearSessionCookie(res);

        sendJSON(res, req, 200, {
            ok: true
        });

        return;
    }


    // ========================================
    // ME
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/api/me"
    ) {

        const user = getUser(req);

        if (!user) {
            sendJSON(res, req, 401, {
                authenticated: false
            });

            return;
        }

        sendJSON(res, req, 200, {
            authenticated: true,
            user: {
                id: user.id,
                username: user.username
            }
        });

        return;
    }


    // ========================================
    // GAMES
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/api/games"
    ) {
        sendJSON(res, req, 200, games);
        return;
    }


    if (
        req.method === "GET" &&
        pathname.startsWith("/api/games/")
    ) {

        const id =
            pathname.split("/").pop();

        const game =
            games.find(
                item => String(item.id) === String(id)
            );

        if (!game) {
            sendJSON(res, req, 404, {
                error: "Game not found."
            });

            return;
        }

        sendJSON(res, req, 200, game);
        return;
    }


    if (
        req.method === "POST" &&
        pathname === "/api/games/create"
    ) {

        const user = getUser(req);

        if (!user) {
            sendJSON(res, req, 401, {
                error: "You must be logged in."
            });

            return;
        }

        try {
            const body = await readBody(req);

            const game = {
                id: makeID(),
                name:
                    String(body.name || "Untitled Game"),
                description:
                    String(body.description || ""),
                creatorId: user.id,
                creator:
                    user.username,
                createdAt:
                    new Date().toISOString(),
                visits: 0
            };

            games.push(game);

            saveJSON(
                FILES.games,
                games
            );

            sendJSON(res, req, 201, game);

            return;

        } catch (error) {
            sendJSON(res, req, 400, {
                error: error.message
            });

            return;
        }
    }


    // ========================================
    // CATALOG
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/api/catalog"
    ) {
        sendJSON(res, req, 200, catalog);
        return;
    }


    // ========================================
    // INVENTORY
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/api/inventory"
    ) {

        const user = getUser(req);

        if (!user) {
            sendJSON(res, req, 401, {
                error: "You must be logged in."
            });

            return;
        }

        sendJSON(
            res,
            req,
            200,
            inventory.filter(
                item => item.userId === user.id
            )
        );

        return;
    }


    // ========================================
    // BUY
    // ========================================

    if (
        req.method === "POST" &&
        pathname === "/api/buy"
    ) {

        const user = getUser(req);

        if (!user) {
            sendJSON(res, req, 401, {
                error: "You must be logged in."
            });

            return;
        }

        try {
            const body = await readBody(req);

            const item =
                catalog.find(
                    item =>
                        String(item.id) ===
                        String(body.itemId)
                );

            if (!item) {
                sendJSON(res, req, 404, {
                    error: "Item not found."
                });

                return;
            }

            inventory.push({
                id: makeID(),
                userId: user.id,
                itemId: item.id,
                purchasedAt:
                    new Date().toISOString()
            });

            saveJSON(
                FILES.inventory,
                inventory
            );

            sendJSON(res, req, 200, {
                ok: true,
                item
            });

            return;

        } catch (error) {
            sendJSON(res, req, 400, {
                error: error.message
            });

            return;
        }
    }


    // ========================================
    // AVATAR GET
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/api/avatar"
    ) {

        const user = getUser(req);

        if (!user) {
            sendJSON(res, req, 401, {
                error: "You must be logged in."
            });

            return;
        }

        let avatar =
            avatars.find(
                item => item.userId === user.id
            );

        if (!avatar) {
            avatar = {
                userId: user.id,
                bodyColor: "#ffd323",
                shirt: "#2469a8",
                pants: "#222f5b",
                hat: false
            };

            avatars.push(avatar);

            saveJSON(
                FILES.avatars,
                avatars
            );
        }

        sendJSON(res, req, 200, avatar);
        return;
    }


    // ========================================
    // AVATAR POST
    // ========================================

    if (
        req.method === "POST" &&
        pathname === "/api/avatar"
    ) {

        const user = getUser(req);

        if (!user) {
            sendJSON(res, req, 401, {
                error: "You must be logged in."
            });

            return;
        }

        try {
            const body = await readBody(req);

            let avatar =
                avatars.find(
                    item => item.userId === user.id
                );

            if (!avatar) {
                avatar = {
                    userId: user.id
                };

                avatars.push(avatar);
            }

            if (body.bodyColor)
                avatar.bodyColor =
                    String(body.bodyColor);

            if (body.shirt)
                avatar.shirt =
                    String(body.shirt);

            if (body.pants)
                avatar.pants =
                    String(body.pants);

            if (typeof body.hat === "boolean")
                avatar.hat =
                    body.hat;

            saveJSON(
                FILES.avatars,
                avatars
            );

            sendJSON(res, req, 200, avatar);

            return;

        } catch (error) {
            sendJSON(res, req, 400, {
                error: error.message
            });

            return;
        }
    }


    // ========================================
    // PLAYERS
    // ========================================

    if (
        req.method === "GET" &&
        pathname === "/api/players"
    ) {

        sendJSON(
            res,
            req,
            200,
            accounts.map(account => ({
                id: account.id,
                username: account.username
            }))
        );

        return;
    }


    // ========================================
    // API 404
    // ========================================

    if (pathname.startsWith("/api/")) {
        sendJSON(res, req, 404, {
            error: "Rovival API endpoint not found."
        });

        return;
    }


    // ========================================
    // GENERAL 404
    // ========================================

    sendText(
        res,
        req,
        404,
        "Not Found"
    );
});


// ============================================
// START SERVER
// ============================================

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            "Rovival server running on port " +
            PORT
        );

        console.log(
            "Website: " +
            WEBSITE
        );

        console.log(
            "Index exists:",
            fs.existsSync(
                path.join(
                    __dirname,
                    "index.html"
                )
            )
        );
    }
);


// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on("SIGTERM", () => {
    console.log("SIGTERM received.");
    server.close(() => {
        process.exit(0);
    });
});

process.on("SIGINT", () => {
    console.log("SIGINT received.");
    server.close(() => {
        process.exit(0);
    });
});
