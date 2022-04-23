"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveMouse = void 0;
const robot = require("robotjs");
// Speed up the mouse.
robot.setMouseDelay(2);
function moveMouse(x, y) {
    robot.moveMouse(x, y);
}
exports.moveMouse = moveMouse;
moveMouse(300, 500);
//# sourceMappingURL=mouse-control.js.map