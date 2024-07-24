module.exports = {
    apps: [
        {
            name: "mao-dao-ws",
            script: "./ws.js",
            // Additional configuration options
        },
        {
            name: "mao-dao-vc",
            script: "./videochat.js",
            // Additional configuration options
        },
        {
            name: "mao-dao-cron-60",
            script: "./cron-60.js",
            cron_restart: "*/15 * * * *",
            // Additional configuration options
        }
    ]
};
