"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const drizzle_kit_1 = require("drizzle-kit");
exports.default = (0, drizzle_kit_1.defineConfig)({
    schema: './src/schema/*',
    out: './migrations',
    dialect: 'sqlite',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'content-os.db',
    },
});
