import * as  robot  from "robotjs";

// Speed up the mouse.
robot.setMouseDelay(2);

export function moveMouse(x, y) {
        robot.moveMouse(x, y);

}

moveMouse(300, 500);
