"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const config_1 = require("prisma/config");
const config_2 = require("@prisma/orm-mongo/config");
exports.default = (0, config_1.definePrismaConfig)({
    orm: (0, config_2.defineConfig)({
        contract: 'prisma/contract.prisma',
        db: {
            connection: process.env.DATABASE_URL ?? '',
        },
    }),
});
//# sourceMappingURL=prisma.config.js.map