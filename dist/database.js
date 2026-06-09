"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearBusLocationDatabase = exports.getTotalLocationCount = exports.getBusLocationHistory = exports.saveBusLocation = exports.database = void 0;
var busLocationRepository_1 = require("./repositories/busLocationRepository");
Object.defineProperty(exports, "database", { enumerable: true, get: function () { return busLocationRepository_1.database; } });
Object.defineProperty(exports, "saveBusLocation", { enumerable: true, get: function () { return busLocationRepository_1.saveBusLocation; } });
Object.defineProperty(exports, "getBusLocationHistory", { enumerable: true, get: function () { return busLocationRepository_1.getBusLocationHistory; } });
Object.defineProperty(exports, "getTotalLocationCount", { enumerable: true, get: function () { return busLocationRepository_1.getTotalLocationCount; } });
Object.defineProperty(exports, "clearBusLocationDatabase", { enumerable: true, get: function () { return busLocationRepository_1.clearBusLocationDatabase; } });
