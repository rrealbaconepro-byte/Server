// ============================================================
// ROVIVAL SERVER
// Node.js built-in modules only
// ============================================================

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIG
// ============================================================

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 3040;

const WEBSITE = "https://arovival.neocities.org";

const DATA_DIR = path.join(__dirname, "playro_data");

const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const GAMES_FILE = path.join(DATA_DIR, "games.json");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");
const AVATARS_FILE = path.join(DATA_DIR, "avatars.json");

// ============================================================
// CREATE DATA DIRECTORY
// ============================================================

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// JSON HELPERS
// ============================================================

function loadJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 2)
            );

            return fallback;
        }

        const data = fs.readFileSync(file, "utf8");

        if (!data.trim()) {
            return fallback;
        }

        return JSON.parse(data);

    } catch (error) {

        console.error(
            "Could not load:",
            file,
            error.message
        );

        return fallback;
    }
}


function saveJSON(file, data) {

    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2)
    );

}


// ============================================================
// DATA
// ============================================================

let accounts = loadJSON(
    ACCOUNTS_FILE,
    []
);

let sessions = loadJSON(
    SESSIONS_FILE,
    {}
);

let games = loadJSON(
    GAMES_FILE,
    [
        {
            id: 1,
            name: "Escape the iPhone",
            description: "Escape the giant iPhone!",
            author: "Rovival",
            locked: true,
            players: 0
        },
        {
            id: 2,
            name: "Natural Disaster Survival",
            description: "Survive dangerous disasters.",
            author: "Rovival",
            locked: true,
            players: 0
        },
        {
            id: 3,
            name: "Rovival Obby",
            description: "Complete the classic obstacle course.",
            author: "Rovival",
            locked: true,
            players: 0
        },
        {
            id: 4,
            name: "Brick Battle",
            description: "Classic brick battle gameplay.",
            author: "Rovival",
            locked: true,
            players: 0
        },
        {
            id: 5,
            name: "Build Your House",
            description: "Build your own Rovival home.",
            author: "Rovival",
            locked: true,
            players: 0
        },
        {
            id: 6,
            name: "Rovival High School",
            description: "Explore the school.",
            author: "Rovival",
            locked: true,
            players: 0
        },
        {
            id: 7,
            name: "Rovival Racing",
            description: "Race around Rovival.",
            author: "Rovival",
            locked: true,
            players: 0
        },
        {
            id: 8,
            name: "Hide and Seek",
            description: "Hide before the seeker finds you.",
            author: "Rovival",
            locked: true,
            players: 0
        }
    ]
);


let catalog = loadJSON(
    CATALOG_FILE,
    [
        {
            id: 1,
            name: "Classic Blue Shirt",
            price: 0,
            type: "shirt"
        },
        {
            id: 2,
            name: "Classic Red Shirt",
            price: 0,
            type: "shirt"
        },
        {
            id: 3,
            name: "Green Shirt",
            price: 0,
            type: "shirt"
        },
        {
            id: 4,
            name: "Classic Pants",
            price: 0,
            type: "pants"
        },
        {
            id: 5,
            name: "Black Pants",
            price: 0,
            type: "pants"
        },
        {
            id: 6,
            name: "Classic Head",
            price: 0,
            type: "body"
        },
        {
            id: 7,
            name: "Classic Hat",
            price: 0,
            type: "hat"
        }
    ]
);


let inventory = loadJSON(
    INVENTORY_FILE,
    {}
);


let avatars = loadJSON(
    AVATARS_FILE,
    {}
);


// ============================================================
// SAVE INITIAL DATA
// ============================================================

saveJSON(
    GAMES_FILE,
    games
);

saveJSON(
    CATALOG_FILE,
    catalog
);


// ============================================================
// STATISTICS
// ============================================================

const stats = {
    requests: 0,
    successful: 0,
    failed: 0,
    accountsCreated: 0,
    logins: 0
};


// ============================================================
// PASSWORD HASHING
// ============================================================

function hashPassword(password) {

    const salt =
        crypto.randomBytes(16).toString("hex");

    const hash =
        crypto.pbkdf2Sync(
            password,
            salt,
            100000,
            64,
            "sha512"
        ).toString("hex");

    return {
        salt,
        hash
    };

}


function verifyPassword(password, account) {

    const hash =
        crypto.pbkdf2Sync(
            password,
            account.salt,
            100000,
            64,
            "sha512"
        ).toString("hex");

    return crypto.timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(account.passwordHash, "hex")
    );

}


// ============================================================
// SESSION HELPERS
// ============================================================

function createSession(username) {

    const token =
        crypto.randomBytes(32).toString("hex");

    sessions[token] = {
        username,
        created: Date.now()
    };

    saveJSON(
        SESSIONS_FILE,
        sessions
    );

    return token;
}


function deleteSession(token) {

    if (sessions[token]) {

        delete sessions[token];

        saveJSON(
            SESSIONS_FILE,
            sessions
        );

    }

}


function parseCookies(req) {

    const cookies = {};

    const header =
        req.headers.cookie;

    if (!header) {
        return cookies;
    }

    header
        .split(";")
        .forEach(part => {

            const index =
                part.indexOf("=");

            if (index === -1) {
                return;
            }

            const key =
                part
                    .slice(0, index)
                    .trim();

            const value =
                part
                    .slice(index + 1)
                    .trim();

            cookies[key] =
                decodeURIComponent(value);

        });

    return cookies;
}


function getUser(req) {

    const cookies =
        parseCookies(req);

    const token =
        cookies.rovival_session;

    if (!token) {
        return null;
    }

    const session =
        sessions[token];

    if (!session) {
        return null;
    }

    return accounts.find(
        account =>
            account.username ===
            session.username
    ) || null;

}


// ============================================================
// COOKIE
// ============================================================

function sessionCookie(token) {

    return [
        "rovival_session=" +
        encodeURIComponent(token),

        "Path=/",

        "HttpOnly",

        "SameSite=None",

        "Secure",

        "Max-Age=2592000"
    ].join("; ");

}


// ============================================================
// CLEAR COOKIE
// ============================================================

function clearSessionCookie() {

    return [
        "rovival_session=",

        "Path=/",

        "HttpOnly",

        "SameSite=None",

        "Secure",

        "Max-Age=0"
    ].join("; ");

}


// ============================================================
// CORS
// ============================================================

function setCORS(res, req) {

    const origin =
        req.headers.origin;

    if (
        origin === WEBSITE ||
        origin === "http://localhost" ||
        origin === "http://127.0.0.1"
    ) {

        res.setHeader(
            "Access-Control-Allow-Origin",
            origin
        );

    } else {

        res.setHeader(
            "Access-Control-Allow-Origin",
            WEBSITE
        );

    }

    res.setHeader(
        "Access-Control-Allow-Credentials",
        "true"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );

}


// ============================================================
// RESPONSE HELPERS
// ============================================================

function sendJSON(
    res,
    req,
    status,
    data,
    extraHeaders = {}
) {

    setCORS(
        res,
        req
    );

    res.writeHead(
        status,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Cache-Control":
                "no-store",

            ...extraHeaders
        }
    );

    res.end(
        JSON.stringify(data)
    );

}


function sendText(
    res,
    req,
    status,
    text
) {

    setCORS(
        res,
        req
    );

    res.writeHead(
        status,
        {
            "Content-Type":
                "text/plain; charset=utf-8"
        }
    );

    res.end(text);

}


// ============================================================
// REQUEST BODY
// ============================================================

function readBody(req) {

    return new Promise(
        (resolve, reject) => {

            let body = "";

            req.on(
                "data",
                chunk => {

                    body += chunk;

                    if (
                        body.length >
                        1024 * 1024
                    ) {

                        reject(
                            new Error(
                                "Request body too large."
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
                                "Invalid JSON."
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


// ============================================================
// USERNAME VALIDATION
// ============================================================

function validUsername(username) {

    return (
        typeof username === "string" &&
        /^[A-Za-z0-9_]{3,20}$/.test(username)
    );

}


// ============================================================
// PASSWORD VALIDATION
// ============================================================

function validPassword(password) {

    return (
        typeof password === "string" &&
        password.length >= 4 &&
        password.length <= 100
    );

}


// ============================================================
// ROUTER
// ============================================================

const server =
    http.createServer(
        async (req, res) => {

            stats.requests++;

            setCORS(
                res,
                req
            );


            // ------------------------------------------------
            // OPTIONS
            // ------------------------------------------------

            if (req.method === "OPTIONS") {

                res.writeHead(
                    204
                );

                res.end();

                return;
            }


            const requestURL =
                new URL(
                    req.url,
                    `http://${req.headers.host || "localhost"}`
                );


            const pathname =
                requestURL.pathname;


            try {


                // ============================================
                // ROOT
                // ============================================

                if (
                    pathname === "/" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            name: "Rovival",
                            status: "online",
                            message:
                                "Rovival server is running."
                        }
                    );

                    stats.successful++;

                    return;
                }


                // ============================================
                // HEALTH
                // ============================================

                if (
                    pathname === "/health" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            status: "ok",
                            name: "Rovival",
                            uptime:
                                process.uptime(),
                            time:
                                new Date().toISOString()
                        }
                    );

                    stats.successful++;

                    return;
                }


                // ============================================
                // STATS
                // ============================================

                if (
                    pathname === "/api/stats" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            requests:
                                stats.requests,

                            successful:
                                stats.successful,

                            failed:
                                stats.failed,

                            accounts:
                                accounts.length,

                            games:
                                games.length,

                            lockedGames:
                                games.filter(
                                    game =>
                                        game.locked
                                ).length
                        }
                    );

                    return;
                }


                // ============================================
                // SIGNUP
                // ============================================

                if (
                    pathname === "/api/signup" &&
                    req.method === "POST"
                ) {

                    const body =
                        await readBody(req);


                    const username =
                        String(
                            body.username || ""
                        ).trim();


                    const password =
                        String(
                            body.password || ""
                        );


                    if (
                        !validUsername(
                            username
                        )
                    ) {

                        stats.failed++;

                        sendJSON(
                            res,
                            req,
                            400,
                            {
                                error:
                                    "Username must be 3-20 characters and only use letters, numbers or underscores."
                            }
                        );

                        return;
                    }


                    if (
                        !validPassword(
                            password
                        )
                    ) {

                        stats.failed++;

                        sendJSON(
                            res,
                            req,
                            400,
                            {
                                error:
                                    "Password must be at least 4 characters."
                            }
                        );

                        return;
                    }


                    const exists =
                        accounts.some(
                            account =>
                                account.username
                                    .toLowerCase() ===
                                username.toLowerCase()
                        );


                    if (exists) {

                        stats.failed++;

                        sendJSON(
                            res,
                            req,
                            409,
                            {
                                error:
                                    "That username already exists."
                            }
                        );

                        return;
                    }


                    const passwordData =
                        hashPassword(
                            password
                        );


                    const account = {
                        id:
                            crypto
                                .randomUUID(),

                        username,

                        passwordHash:
                            passwordData.hash,

                        salt:
                            passwordData.salt,

                        created:
                            new Date().toISOString()
                    };


                    accounts.push(
                        account
                    );


                    inventory[username] = [];

                    avatars[username] = {
                        bodyColor:
                            "#ffd323",

                        shirt:
                            "#2469a8",

                        pants:
                            "#222f5b",

                        hat:
                            false
                    };


                    saveJSON(
                        ACCOUNTS_FILE,
                        accounts
                    );

                    saveJSON(
                        INVENTORY_FILE,
                        inventory
                    );

                    saveJSON(
                        AVATARS_FILE,
                        avatars
                    );


                    stats.accountsCreated++;
                    stats.successful++;


                    sendJSON(
                        res,
                        req,
                        201,
                        {
                            success: true,

                            message:
                                "Rovival account created.",

                            username
                        }
                    );

                    return;
                }


                // ============================================
                // LOGIN
                // ============================================

                if (
                    pathname === "/api/login" &&
                    req.method === "POST"
                ) {

                    const body =
                        await readBody(req);


                    const username =
                        String(
                            body.username || ""
                        ).trim();


                    const password =
                        String(
                            body.password || ""
                        );


                    const account =
                        accounts.find(
                            item =>
                                item.username
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

                        stats.failed++;

                        sendJSON(
                            res,
                            req,
                            401,
                            {
                                error:
                                    "Invalid username or password."
                            }
                        );

                        return;
                    }


                    const token =
                        createSession(
                            account.username
                        );


                    stats.logins++;
                    stats.successful++;


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            success: true,

                            message:
                                "Login successful.",

                            user: {
                                username:
                                    account.username,

                                id:
                                    account.id
                            }
                        },
                        {
                            "Set-Cookie":
                                sessionCookie(
                                    token
                                )
                        }
                    );

                    return;
                }


                // ============================================
                // LOGOUT
                // ============================================

                if (
                    pathname === "/api/logout" &&
                    req.method === "POST"
                ) {

                    const cookies =
                        parseCookies(req);


                    if (
                        cookies.rovival_session
                    ) {

                        deleteSession(
                            cookies.rovival_session
                        );

                    }


                    stats.successful++;


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            success: true
                        },
                        {
                            "Set-Cookie":
                                clearSessionCookie()
                        }
                    );

                    return;
                }


                // ============================================
                // CURRENT USER
                // ============================================

                if (
                    pathname === "/api/me" &&
                    req.method === "GET"
                ) {

                    const user =
                        getUser(req);


                    if (!user) {

                        sendJSON(
                            res,
                            req,
                            401,
                            {
                                error:
                                    "Not logged in."
                            }
                        );

                        return;
                    }


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            user: {
                                id:
                                    user.id,

                                username:
                                    user.username,

                                created:
                                    user.created
                            }
                        }
                    );

                    return;
                }


                // ============================================
                // GAMES
                // ============================================

                if (
                    pathname === "/api/games" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            games
                        }
                    );

                    return;
                }


                // ============================================
                // SINGLE GAME
                // ============================================

                if (
                    pathname.startsWith(
                        "/api/games/"
                    ) &&
                    req.method === "GET"
                ) {

                    const id =
                        Number(
                            pathname
                                .split("/")
                                .pop()
                        );


                    const game =
                        games.find(
                            item =>
                                item.id === id
                        );


                    if (!game) {

                        sendJSON(
                            res,
                            req,
                            404,
                            {
                                error:
                                    "Game not found."
                            }
                        );

                        return;
                    }


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            game
                        }
                    );

                    return;
                }


                // ============================================
                // CREATE GAME
                // ============================================

                if (
                    pathname ===
                    "/api/games/create" &&
                    req.method === "POST"
                ) {

                    const user =
                        getUser(req);


                    if (!user) {

                        sendJSON(
                            res,
                            req,
                            401,
                            {
                                error:
                                    "You must be logged in."
                            }
                        );

                        return;
                    }


                    const body =
                        await readBody(req);


                    const name =
                        String(
                            body.name || ""
                        ).trim();


                    if (
                        name.length < 3 ||
                        name.length > 60
                    ) {

                        sendJSON(
                            res,
                            req,
                            400,
                            {
                                error:
                                    "Game name must be 3-60 characters."
                            }
                        );

                        return;
                    }


                    const game = {

                        id:
                            games.length
                            ? Math.max(
                                ...games.map(
                                    game =>
                                        game.id
                                )
                            ) + 1
                            : 1,

                        name,

                        description:
                            String(
                                body.description ||
                                ""
                            ),

                        author:
                            user.username,

                        locked: true,

                        players: 0,

                        created:
                            new Date().toISOString()
                    };


                    games.push(
                        game
                    );


                    saveJSON(
                        GAMES_FILE,
                        games
                    );


                    sendJSON(
                        res,
                        req,
                        201,
                        {
                            success: true,
                            game
                        }
                    );

                    return;
                }


                // ============================================
                // CATALOG
                // ============================================

                if (
                    pathname === "/api/catalog" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            catalog
                        }
                    );

                    return;
                }


                // ============================================
                // INVENTORY
                // ============================================

                if (
                    pathname === "/api/inventory" &&
                    req.method === "GET"
                ) {

                    const user =
                        getUser(req);


                    if (!user) {

                        sendJSON(
                            res,
                            req,
                            401,
                            {
                                error:
                                    "You must be logged in."
                            }
                        );

                        return;
                    }


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            inventory:
                                inventory[
                                    user.username
                                ] || []
                        }
                    );

                    return;
                }


                // ============================================
                // BUY ITEM
                // ============================================

                if (
                    pathname === "/api/buy" &&
                    req.method === "POST"
                ) {

                    const user =
                        getUser(req);


                    if (!user) {

                        sendJSON(
                            res,
                            req,
                            401,
                            {
                                error:
                                    "You must be logged in."
                            }
                        );

                        return;
                    }


                    const body =
                        await readBody(req);


                    const item =
                        catalog.find(
                            product =>
                                product.id ===
                                Number(body.itemId)
                        );


                    if (!item) {

                        sendJSON(
                            res,
                            req,
                            404,
                            {
                                error:
                                    "Item not found."
                            }
                        );

                        return;
                    }


                    if (
                        !inventory[
                            user.username
                        ]
                    ) {

                        inventory[
                            user.username
                        ] = [];

                    }


                    const alreadyOwned =
                        inventory[
                            user.username
                        ].some(
                            id =>
                                id === item.id
                        );


                    if (!alreadyOwned) {

                        inventory[
                            user.username
                        ].push(
                            item.id
                        );

                        saveJSON(
                            INVENTORY_FILE,
                            inventory
                        );

                    }


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            success: true,

                            message:
                                "Item added to inventory.",

                            item
                        }
                    );

                    return;
                }


                // ============================================
                // AVATAR GET
                // ============================================

                if (
                    pathname === "/api/avatar" &&
                    req.method === "GET"
                ) {

                    const user =
                        getUser(req);


                    if (!user) {

                        sendJSON(
                            res,
                            req,
                            401,
                            {
                                error:
                                    "You must be logged in."
                            }
                        );

                        return;
                    }


                    if (
                        !avatars[
                            user.username
                        ]
                    ) {

                        avatars[
                            user.username
                        ] = {
                            bodyColor:
                                "#ffd323",

                            shirt:
                                "#2469a8",

                            pants:
                                "#222f5b",

                            hat:
                                false
                        };

                    }


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            avatar:
                                avatars[
                                    user.username
                                ]
                        }
                    );

                    return;
                }


                // ============================================
                // AVATAR SAVE
                // ============================================

                if (
                    pathname === "/api/avatar" &&
                    req.method === "POST"
                ) {

                    const user =
                        getUser(req);


                    if (!user) {

                        sendJSON(
                            res,
                            req,
                            401,
                            {
                                error:
                                    "You must be logged in."
                            }
                        );

                        return;
                    }


                    const body =
                        await readBody(req);


                    const current =
                        avatars[
                            user.username
                        ] || {};


                    avatars[
                        user.username
                    ] = {

                        bodyColor:
                            body.bodyColor ||
                            current.bodyColor ||
                            "#ffd323",

                        shirt:
                            body.shirt ||
                            current.shirt ||
                            "#2469a8",

                        pants:
                            body.pants ||
                            current.pants ||
                            "#222f5b",

                        hat:
                            Boolean(
                                body.hat
                            )
                    };


                    saveJSON(
                        AVATARS_FILE,
                        avatars
                    );


                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            success: true,

                            avatar:
                                avatars[
                                    user.username
                                ]
                        }
                    );

                    return;
                }


                // ============================================
                // PLAYERS
                // ============================================

                if (
                    pathname === "/api/players" &&
                    req.method === "GET"
                ) {

                    sendJSON(
                        res,
                        req,
                        200,
                        {
                            players: []
                        }
                    );

                    return;
                }


                // ============================================
                // 404
                // ============================================

                stats.failed++;

                sendJSON(
                    res,
                    req,
                    404,
                    {
                        error:
                            "Rovival API endpoint not found."
                    }
                );


            } catch (error) {

                console.error(
                    "SERVER ERROR:",
                    error
                );


                stats.failed++;


                sendJSON(
                    res,
                    req,
                    500,
                    {
                        error:
                            "Internal server error."
                    }
                );

            }

        }
    );


// ============================================================
// ERROR HANDLING
// ============================================================

server.on(
    "error",
    error => {

        console.error(
            "Server error:",
            error
        );

    }
);


// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    HOST,
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "           ROVIVAL SERVER"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Status: ONLINE"
        );

        console.log(
            "Host:",
            HOST
        );

        console.log(
            "Port:",
            PORT
        );

        console.log(
            "Website:",
            WEBSITE
        );

        console.log(
            "Games:",
            games.length
        );

        console.log(
            "Locked games:",
            games.filter(
                game =>
                    game.locked
            ).length
        );

        console.log(
            "Accounts:",
            accounts.length
        );

        console.log(
            "========================================"
        );

    }
);


// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function shutdown() {

    console.log(
        "Shutting down Rovival server..."
    );


    saveJSON(
        ACCOUNTS_FILE,
        accounts
    );

    saveJSON(
        SESSIONS_FILE,
        sessions
    );

    saveJSON(
        GAMES_FILE,
        games
    );

    saveJSON(
        CATALOG_FILE,
        catalog
    );

    saveJSON(
        INVENTORY_FILE,
        inventory
    );

    saveJSON(
        AVATARS_FILE,
        avatars
    );


    server.close(
        () => {

            console.log(
                "Rovival server stopped."
            );

            process.exit(0);

        }
    );

}


process.on(
    "SIGTERM",
    shutdown
);

process.on(
    "SIGINT",
    shutdown
);
