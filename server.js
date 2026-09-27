// ============================================
// WEBSITE
// ============================================

if (
    req.method === "GET" &&
    !pathname.startsWith("/api/")
) {

    // Files that actually exist are served normally.
    const requestedFile =
        pathname === "/"
            ? "/index.html"
            : pathname;

    if (
        serveWebsiteFile(
            req,
            res,
            requestedFile
        )
    ) {
        return;
    }

    // If the requested page doesn't exist,
    // send the user to index.html.
    if (
        !pathname.includes(".")
    ) {
        if (
            serveWebsiteFile(
                req,
                res,
                "/index.html"
            )
        ) {
            return;
        }
    }

    sendText(
        res,
        req,
        404,
        "Page not found."
    );

    return;
}
