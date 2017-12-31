"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const consoleService_1 = require("../lib/consoleService");
const TestModule = require('./module');
const port = 3300;
// var host = '192.168.131.1';
const host = 'localhost';
const opts = {
    id: 'test-server-1',
    type: 'test',
    host: host,
    port: port,
    info: {
        id: 'test-server-1',
        host: host,
        port: 4300
    }
};
let monitorConsole = consoleService_1.createMonitorConsole(opts);
let mod = TestModule();
monitorConsole.register(TestModule.moduleId, mod);
monitorConsole.start(function () {
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMERBQTZEO0FBRTdELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUN2QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUM7QUFDbEIsOEJBQThCO0FBQzlCLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQztBQUV6QixNQUFNLElBQUksR0FBRztJQUNaLEVBQUUsRUFBRSxlQUFlO0lBQ25CLElBQUksRUFBRSxNQUFNO0lBQ1osSUFBSSxFQUFFLElBQUk7SUFDVixJQUFJLEVBQUUsSUFBSTtJQUNWLElBQUksRUFBRTtRQUNMLEVBQUUsRUFBRSxlQUFlO1FBQ25CLElBQUksRUFBRSxJQUFJO1FBQ1YsSUFBSSxFQUFFLElBQUk7S0FDVjtDQUNELENBQUE7QUFFRCxJQUFJLGNBQWMsR0FBRyxxQ0FBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNoRCxJQUFJLEdBQUcsR0FBRyxVQUFVLEVBQUUsQ0FBQztBQUN2QixjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFFbEQsY0FBYyxDQUFDLEtBQUssQ0FBQztBQUVyQixDQUFDLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGNyZWF0ZU1vbml0b3JDb25zb2xlIH0gZnJvbSBcIi4uL2xpYi9jb25zb2xlU2VydmljZVwiO1xuXG5jb25zdCBUZXN0TW9kdWxlID0gcmVxdWlyZSgnLi9tb2R1bGUnKTtcbmNvbnN0IHBvcnQgPSAzMzAwO1xuLy8gdmFyIGhvc3QgPSAnMTkyLjE2OC4xMzEuMSc7XG5jb25zdCBob3N0ID0gJ2xvY2FsaG9zdCc7XG5cbmNvbnN0IG9wdHMgPSB7XG5cdGlkOiAndGVzdC1zZXJ2ZXItMScsXG5cdHR5cGU6ICd0ZXN0Jyxcblx0aG9zdDogaG9zdCxcblx0cG9ydDogcG9ydCxcblx0aW5mbzoge1xuXHRcdGlkOiAndGVzdC1zZXJ2ZXItMScsXG5cdFx0aG9zdDogaG9zdCxcblx0XHRwb3J0OiA0MzAwXG5cdH1cbn1cblxubGV0IG1vbml0b3JDb25zb2xlID0gY3JlYXRlTW9uaXRvckNvbnNvbGUob3B0cyk7XG5sZXQgbW9kID0gVGVzdE1vZHVsZSgpO1xubW9uaXRvckNvbnNvbGUucmVnaXN0ZXIoVGVzdE1vZHVsZS5tb2R1bGVJZCwgbW9kKTtcblxubW9uaXRvckNvbnNvbGUuc3RhcnQoZnVuY3Rpb24oKSB7XG5cbn0pXG4iXX0=