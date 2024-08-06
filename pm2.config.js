module.exports = {
    apps: [
        {
            name: "mtest-ws",
            script: "./ws.js",
            // Additional configuration options
        },
        {
            name: "test-vc",
            script: "./videochat.js",
            // Additional configuration options
        },
        {
            name: "test-cron-60",
            script: "./cron-60.js",
            cron_restart: "*/15 * * * *",
            // Additional configuration options
        }
    ]
};
