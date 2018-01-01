"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const monitorAgent_1 = require("./lib/monitor/monitorAgent");
exports.MonitorAgent = monitorAgent_1.MonitorAgent;
const masterAgent_1 = require("./lib/master/masterAgent");
exports.MasterAgent = masterAgent_1.MasterAgent;
const client_1 = require("./lib/client/client");
exports.AdminClient = client_1.AdminClient;
const consoleService_1 = require("./lib/consoleService");
exports.ConsoleService = consoleService_1.ConsoleService;
const masterSocket_1 = require("./lib/master/masterSocket");
exports.MasterSocket = masterSocket_1.MasterSocket;
const consoleService = require("./lib/consoleService");
const mqttClient_1 = require("./lib/protocol/mqtt/mqttClient");
exports.MqttClient = mqttClient_1.MqttClient;
const mqttServer_1 = require("./lib/protocol/mqtt/mqttServer");
exports.MqttServer = mqttServer_1.MqttServer;
exports.createMasterConsole = consoleService.createMasterConsole;
exports.createMonitorConsole = consoleService.createMonitorConsole;
exports.adminClient = client_1.AdminClient;
exports.modules = {};
fs.readdirSync(__dirname + "/lib/modules").forEach(filename => {
    if (/\.js$/.test(filename)) {
        var name = filename.substr(0, filename.lastIndexOf("."));
        var _module = require("./lib/modules/" + name);
        if (!_module.moduleError) {
            exports.modules.__defineGetter__(name, () => {
                return _module;
            });
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLHlCQUEwQjtBQUMxQiw2REFBMEQ7QUFVekQsdUJBVlEsMkJBQVksQ0FVUjtBQVRiLDBEQUF1RDtBQVV0RCxzQkFWUSx5QkFBVyxDQVVSO0FBVFosZ0RBQWtEO0FBVWpELHNCQVZRLG9CQUFXLENBVVI7QUFUWix5REFBc0Q7QUFVckQseUJBVlEsK0JBQWMsQ0FVUjtBQVRmLDREQUF5RDtBQVV4RCx1QkFWUSwyQkFBWSxDQVVSO0FBVGIsdURBQXdEO0FBQ3hELCtEQUE0RDtBQVMzRCxxQkFUUSx1QkFBVSxDQVNSO0FBUlgsK0RBQTREO0FBUzNELHFCQVRRLHVCQUFVLENBU1I7QUFpREUsUUFBQSxtQkFBbUIsR0FBRyxjQUFjLENBQUMsbUJBQW1CLENBQUM7QUFDekQsUUFBQSxvQkFBb0IsR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUM7QUFDM0QsUUFBQSxXQUFXLEdBQUcsb0JBQVcsQ0FBQztBQVcxQixRQUFBLE9BQU8sR0FBaUIsRUFBRSxDQUFDO0FBRXhDLEVBQUUsQ0FBQyxXQUFXLENBQUMsU0FBUyxHQUFHLGNBQWMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTtJQUM3RCxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1QixJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDekQsSUFBSSxPQUFPLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxDQUFDO1FBQy9DLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDcEIsZUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7Z0JBQzFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU19JRkJMSyB9IGZyb20gXCJjb25zdGFudHNcIjtcbmltcG9ydCBNcXR0Q29uID0gcmVxdWlyZShcIm1xdHQtY29ubmVjdGlvblwiKTtcbmltcG9ydCBmcyA9IHJlcXVpcmUoXCJmc1wiKTtcbmltcG9ydCB7IE1vbml0b3JBZ2VudCB9IGZyb20gXCIuL2xpYi9tb25pdG9yL21vbml0b3JBZ2VudFwiO1xuaW1wb3J0IHsgTWFzdGVyQWdlbnQgfSBmcm9tIFwiLi9saWIvbWFzdGVyL21hc3RlckFnZW50XCI7XG5pbXBvcnQgeyBBZG1pbkNsaWVudCB9IGZyb20gXCIuL2xpYi9jbGllbnQvY2xpZW50XCI7XG5pbXBvcnQgeyBDb25zb2xlU2VydmljZSB9IGZyb20gXCIuL2xpYi9jb25zb2xlU2VydmljZVwiO1xuaW1wb3J0IHsgTWFzdGVyU29ja2V0IH0gZnJvbSBcIi4vbGliL21hc3Rlci9tYXN0ZXJTb2NrZXRcIjtcbmltcG9ydCBjb25zb2xlU2VydmljZSA9IHJlcXVpcmUoXCIuL2xpYi9jb25zb2xlU2VydmljZVwiKTtcbmltcG9ydCB7IE1xdHRDbGllbnQgfSBmcm9tIFwiLi9saWIvcHJvdG9jb2wvbXF0dC9tcXR0Q2xpZW50XCI7XG5pbXBvcnQgeyBNcXR0U2VydmVyIH0gZnJvbSBcIi4vbGliL3Byb3RvY29sL21xdHQvbXF0dFNlcnZlclwiO1xuXG5leHBvcnQge1xuXHRNb25pdG9yQWdlbnQsXG5cdE1hc3RlckFnZW50LFxuXHRBZG1pbkNsaWVudCxcblx0Q29uc29sZVNlcnZpY2UsXG5cdE1hc3RlclNvY2tldCxcblx0TXF0dENsaWVudCxcblx0TXF0dFNlcnZlclxufTtcblxuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJJbmZvIHtcblx0aWQ6IHN0cmluZztcblx0c2VydmVyVHlwZTogc3RyaW5nO1xuXHRob3N0OiBzdHJpbmc7XG5cdHBvcnQ6IG51bWJlcjtcblx0c29ja2V0PzogTXF0dENvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNcXR0UGFja2V0IHtcblx0Y21kOiBzdHJpbmc7XG5cdHJldGFpbjogYm9vbGVhbjtcblx0cW9zOiBudW1iZXI7XG5cdGR1cDogYm9vbGVhbjtcblx0bGVuZ3RoOiBudW1iZXI7XG5cdHRvcGljOiBzdHJpbmc7XG5cdHBheWxvYWQ6IGFueTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTbGF2ZVJlY29yZCB7XG5cdGlkOiBzdHJpbmc7XG5cdHR5cGU6IHN0cmluZztcblx0cGlkOiBudW1iZXI7XG5cdGhvc3Q/OiBzdHJpbmc7XG5cdHBvcnQ/OiBudW1iZXI7XG5cdGluZm86IFNlcnZlckluZm87XG5cdHNvY2tldDogTXF0dENvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNb2R1bGVSZWNvcmQge1xuXHRtb2R1bGVJZDogc3RyaW5nO1xuXHRtb2R1bGU6IGFueTtcblx0ZW5hYmxlOiBib29sZWFuO1xuXHRkZWxheT86IG51bWJlcjtcblx0c2NoZWR1bGU/OiBib29sZWFuO1xuXHR0eXBlPzogc3RyaW5nO1xuXHRpbnRlcnZhbD86IG51bWJlcjtcblx0am9iSWQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9kdWxlIHtcblx0bW9kdWxlSWQ6c3RyaW5nO1xuXHRtb25pdG9ySGFuZGxlcjogKGFnZW50OiBNb25pdG9yQWdlbnQsIG1zZzogYW55LCBjYjogRnVuY3Rpb24pID0+IHZvaWQ7XG5cdGNsaWVudEhhbmRsZXI6IChhZ2VudDogTWFzdGVyQWdlbnQsIG1zZzogYW55LCBjYjogRnVuY3Rpb24pID0+IHZvaWQ7XG5cdG1hc3RlckhhbmRsZXI/OiAoYWdlbnQ6IE1hc3RlckFnZW50LCBtc2c6IGFueSwgY2I6IEZ1bmN0aW9uKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgY3JlYXRlTWFzdGVyQ29uc29sZSA9IGNvbnNvbGVTZXJ2aWNlLmNyZWF0ZU1hc3RlckNvbnNvbGU7XG5leHBvcnQgY29uc3QgY3JlYXRlTW9uaXRvckNvbnNvbGUgPSBjb25zb2xlU2VydmljZS5jcmVhdGVNb25pdG9yQ29uc29sZTtcbmV4cG9ydCBjb25zdCBhZG1pbkNsaWVudCA9IEFkbWluQ2xpZW50O1xuXG5leHBvcnQgaW50ZXJmYWNlIE1vZHVsZXMge1xuXHRtb25pdG9yTG9nOiBNb2R1bGU7XG5cdG5vZGVJbmZvOiBNb2R1bGU7XG5cdHByb2ZpbGVyOiBNb2R1bGU7XG5cdHNjcmlwdHM6IE1vZHVsZTtcblx0c3lzdGVtSW5mbzogTW9kdWxlO1xuXHR3YXRjaFNlcnZlcjogTW9kdWxlO1xufVxuXG5leHBvcnQgY29uc3QgbW9kdWxlczogTW9kdWxlcyA9IDxhbnk+e307XG5cbmZzLnJlYWRkaXJTeW5jKF9fZGlybmFtZSArIFwiL2xpYi9tb2R1bGVzXCIpLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRpZiAoL1xcLmpzJC8udGVzdChmaWxlbmFtZSkpIHtcblx0XHR2YXIgbmFtZSA9IGZpbGVuYW1lLnN1YnN0cigwLCBmaWxlbmFtZS5sYXN0SW5kZXhPZihcIi5cIikpO1xuXHRcdHZhciBfbW9kdWxlID0gcmVxdWlyZShcIi4vbGliL21vZHVsZXMvXCIgKyBuYW1lKTtcblx0XHRpZiAoIV9tb2R1bGUubW9kdWxlRXJyb3IpIHtcblx0XHRcdCg8YW55Pm1vZHVsZXMpLl9fZGVmaW5lR2V0dGVyX18obmFtZSwgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gX21vZHVsZTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufSk7XG4iXX0=