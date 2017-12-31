"use strict";
/*!
 * Pomelo -- consoleModule watchServer
 * Copyright(c) 2013 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
const countDownLatch = require("../util/countDownLatch");
const utils = require("../util/utils");
const util = require("util");
const fs = require("fs");
const vm = require("vm");
const logger = require("pomelo-logger").getLogger("pomelo-admin", __filename);
const monitor = require("pomelo-monitor");
module.exports.moduleId = "watchServer";
class WatchServerModule {
    constructor(opts) {
        opts = opts || {};
        this.app = opts.app;
    }
    monitorHandler(agent, msg, cb) {
        let comd = msg["comd"];
        let context = msg["context"];
        let param = msg["param"];
        let app = this.app;
        let handle = "monitor";
        switch (comd) {
            case "servers":
                showServers(handle, agent, comd, context, cb);
                break;
            case "connections":
                showConnections(handle, agent, app, comd, context, cb);
                break;
            case "logins":
                showLogins(handle, agent, app, comd, context, cb);
                break;
            case "modules":
                showModules(handle, agent, comd, context, cb);
                break;
            case "status":
                showStatus(handle, agent, comd, context, cb);
                break;
            case "config":
                showConfig(handle, agent, app, comd, context, param, cb);
                break;
            case "proxy":
                showProxy(handle, agent, app, comd, context, param, cb);
                break;
            case "handler":
                showHandler(handle, agent, app, comd, context, param, cb);
                break;
            case "components":
                showComponents(handle, agent, app, comd, context, param, cb);
                break;
            case "settings":
                showSettings(handle, agent, app, comd, context, param, cb);
                break;
            case "cpu":
                dumpCPU(handle, agent, comd, context, param, cb);
                break;
            case "memory":
                dumpMemory(handle, agent, comd, context, param, cb);
                break;
            case "get":
                getApp(handle, agent, app, comd, context, param, cb);
                break;
            case "set":
                setApp(handle, agent, app, comd, context, param, cb);
                break;
            case "enable":
                enableApp(handle, agent, app, comd, context, param, cb);
                break;
            case "disable":
                disableApp(handle, agent, app, comd, context, param, cb);
                break;
            case "run":
                runScript(handle, agent, app, comd, context, param, cb);
                break;
            default:
                showError(handle, agent, comd, context, cb);
        }
    }
    clientHandler(agent, msg, cb) {
        let comd = msg["comd"];
        let context = msg["context"];
        let param = msg["param"];
        let app = this.app; // master app
        if (!comd || !context) {
            cb("lack of comd or context param");
            return;
        }
        let handle = "client";
        switch (comd) {
            case "servers":
                showServers(handle, agent, comd, context, cb);
                break;
            case "connections":
                showConnections(handle, agent, app, comd, context, cb);
                break;
            case "logins":
                showLogins(handle, agent, app, comd, context, cb);
                break;
            case "modules":
                showModules(handle, agent, comd, context, cb);
                break;
            case "status":
                showStatus(handle, agent, comd, context, cb);
                break;
            case "config":
                showConfig(handle, agent, app, comd, context, param, cb);
                break;
            case "proxy":
                showProxy(handle, agent, app, comd, context, param, cb);
                break;
            case "handler":
                showHandler(handle, agent, app, comd, context, param, cb);
                break;
            case "components":
                showComponents(handle, agent, app, comd, context, param, cb);
                break;
            case "settings":
                showSettings(handle, agent, app, comd, context, param, cb);
                break;
            case "cpu":
                dumpCPU(handle, agent, comd, context, param, cb);
                break;
            case "memory":
                dumpMemory(handle, agent, comd, context, param, cb);
                break;
            case "get":
                getApp(handle, agent, app, comd, context, param, cb);
                break;
            case "set":
                setApp(handle, agent, app, comd, context, param, cb);
                break;
            case "enable":
                enableApp(handle, agent, app, comd, context, param, cb);
                break;
            case "disable":
                disableApp(handle, agent, app, comd, context, param, cb);
                break;
            case "run":
                runScript(handle, agent, app, comd, context, param, cb);
                break;
            default:
                showError(handle, agent, comd, context, cb);
        }
    }
}
function showServers(handle, agent, comd, context, cb) {
    if (handle === "client") {
        let sid, record;
        let serverInfo = {};
        let count = utils.size(agent.idMap);
        let latch = countDownLatch.createCountDownLatch(count, function () {
            cb(null, {
                msg: serverInfo
            });
        });
        for (sid in agent.idMap) {
            record = agent.idMap[sid];
            agent.request(record.id, module.exports.moduleId, {
                comd: comd,
                context: context
            }, (msg) => {
                serverInfo[msg.serverId] = msg.body;
                latch.done();
            });
        }
    }
    else if (handle === "monitor") {
        let serverId = agent.id;
        let serverType = agent.type;
        let info = agent.info;
        let pid = process.pid;
        let heapUsed = (process.memoryUsage().heapUsed / (1000 * 1000)).toFixed(2);
        let uptime = (process.uptime() / 60).toFixed(2);
        cb({
            serverId: serverId,
            body: {
                serverId: serverId,
                serverType: serverType,
                host: info["host"],
                port: info["port"],
                pid: pid,
                heapUsed: heapUsed,
                uptime: uptime
            }
        });
    }
}
function showConnections(handle, agent, app, comd, context, cb) {
    if (handle === "client") {
        if (context === "all") {
            let sid, record;
            let serverInfo = {};
            let count = 0;
            for (let key in agent.idMap) {
                if (agent.idMap[key].info.frontend === "true") {
                    count++;
                }
            }
            let latch = countDownLatch.createCountDownLatch(count, function () {
                cb(null, {
                    msg: serverInfo
                });
            });
            for (sid in agent.idMap) {
                record = agent.idMap[sid];
                if (record.info.frontend === "true") {
                    agent.request(record.id, module.exports.moduleId, {
                        comd: comd,
                        context: context
                    }, (msg) => {
                        serverInfo[msg.serverId] = msg.body;
                        latch.done();
                    });
                }
            }
        }
        else {
            let record = agent.idMap[context];
            if (!record) {
                cb("the server " + context + " not exist");
            }
            if (record.info.frontend === "true") {
                agent.request(record.id, module.exports.moduleId, {
                    comd: comd,
                    context: context
                }, (msg) => {
                    let serverInfo = {};
                    serverInfo[msg.serverId] = msg.body;
                    cb(null, {
                        msg: serverInfo
                    });
                });
            }
            else {
                cb("\nthis command should be applied to frontend server\n");
            }
        }
    }
    else if (handle === "monitor") {
        let connection = app.components.__connection__;
        if (!connection) {
            cb({
                serverId: agent.id,
                body: "error"
            });
            return;
        }
        cb({
            serverId: agent.id,
            body: connection.getStatisticsInfo()
        });
    }
}
function showLogins(handle, agent, app, comd, context, cb) {
    showConnections(handle, agent, app, comd, context, cb);
}
function showModules(handle, agent, comd, context, cb) {
    let modules = agent.consoleService.modules;
    let result = [];
    for (let module in modules) {
        result.push(module);
    }
    cb(null, {
        msg: result
    });
}
function showStatus(handle, agent, comd, context, cb) {
    if (handle === "client") {
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            context: context
        }, (err, msg) => {
            cb(null, {
                msg: msg
            });
        });
    }
    else if (handle === "monitor") {
        let serverId = agent.id;
        let pid = process.pid;
        let params = {
            serverId: serverId,
            pid: pid
        };
        monitor.psmonitor.getPsInfo(params, (err, data) => {
            cb(null, {
                serverId: agent.id,
                body: data
            });
        });
    }
}
function showConfig(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (param === "master") {
            cb(null, {
                masterConfig: app.get("masterConfig") || "no config to master in app.js",
                masterInfo: app.get("master")
            });
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        let key = param + "Config";
        cb(null, clone(param, app.get(key)));
    }
}
function showProxy(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        proxyCb(app, context, cb);
    }
}
function showHandler(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        handlerCb(app, context, cb);
    }
}
function showComponents(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        let _components = app.components;
        let res = {};
        for (let key in _components) {
            let name = getComponentName(key);
            res[name] = clone(name, app.get(name + "Config"));
        }
        cb(null, res);
    }
}
function showSettings(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        let _settings = app.settings;
        let res = {};
        for (let key in _settings) {
            if (key.match(/^__\w+__$/) || key.match(/\w+Config$/)) {
                continue;
            }
            if (!checkJSON(_settings[key])) {
                res[key] = "Object";
                continue;
            }
            res[key] = _settings[key];
        }
        cb(null, res);
    }
}
function dumpCPU(handle, agent, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(err, msg);
        });
    }
    else if (handle === "monitor") {
        let times = param["times"];
        let filepath = param["filepath"];
        let force = param["force"];
        cb(null, "cpu dump is unused in 1.0 of pomelo");
        /**
        if (!/\.cpuprofile$/.test(filepath)) {
            filepath = filepath + '.cpuprofile';
        }
        if (!times || !/^[0-9]*[1-9][0-9]*$/.test(times)) {
            cb('no times or times invalid error');
            return;
        }
        checkFilePath(filepath, force, function(err) {
            if (err) {
                cb(err);
                return;
            }
            //ndump.cpu(filepath, times);
            cb(null, filepath + ' cpu dump ok');
        });
        */
    }
}
function dumpMemory(handle, agent, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(err, msg);
        });
    }
    else if (handle === "monitor") {
        let filepath = param["filepath"];
        let force = param["force"];
        if (!/\.heapsnapshot$/.test(filepath)) {
            filepath = filepath + ".heapsnapshot";
        }
        checkFilePath(filepath, force, (err) => {
            if (err) {
                cb(err);
                return;
            }
            let heapdump = null;
            try {
                heapdump = require("heapdump");
                heapdump.writeSnapshot(filepath);
                cb(null, filepath + " memory dump ok");
            }
            catch (e) {
                cb("pomelo-admin require heapdump");
            }
        });
    }
}
function getApp(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        let res = app.get(param);
        if (!checkJSON(res)) {
            res = "object";
        }
        cb(null, res || null);
    }
}
function setApp(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        let key = param["key"];
        let value = param["value"];
        app.set(key, value);
        cb(null, "set " + key + ":" + value + " ok");
    }
}
function enableApp(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        app.enable(param);
        cb(null, "enable " + param + " ok");
    }
}
function disableApp(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        app.disable(param);
        cb(null, "disable " + param + " ok");
    }
}
function runScript(handle, agent, app, comd, context, param, cb) {
    if (handle === "client") {
        if (context === "all") {
            cb("context error");
            return;
        }
        agent.request(context, module.exports.moduleId, {
            comd: comd,
            param: param,
            context: context
        }, (err, msg) => {
            cb(null, msg);
        });
    }
    else if (handle === "monitor") {
        let ctx = {
            app: app,
            result: null
        };
        try {
            vm.runInNewContext("result = " + param, ctx, "myApp.vm");
            cb(null, util.inspect(ctx.result));
        }
        catch (e) {
            cb(null, e.stack);
        }
    }
}
function showError(handle, agent, comd, context, cb) { }
function clone(param, obj) {
    let result = {};
    let flag = 1;
    for (let key in obj) {
        if (typeof obj[key] === "function" || typeof obj[key] === "object") {
            continue;
        }
        flag = 0;
        result[key] = obj[key];
    }
    if (flag) {
        // return 'no ' + param + 'Config info';
    }
    return result;
}
function checkFilePath(filepath, force, cb) {
    if (!force && fs.existsSync(filepath)) {
        cb("filepath file exist");
        return;
    }
    fs.writeFile(filepath, "test", function (err) {
        if (err) {
            cb("filepath invalid error");
            return;
        }
        fs.unlinkSync(filepath);
        cb(null);
    });
}
function proxyCb(app, context, cb) {
    let msg = {};
    let __proxy__ = app.components.__proxy__;
    if (__proxy__ && __proxy__.client && __proxy__.client.proxies.user) {
        let proxies = __proxy__.client.proxies.user;
        let server = app.getServerById(context);
        if (!server) {
            cb("no server with this id " + context);
        }
        else {
            let type = server["serverType"];
            let tmp = proxies[type];
            msg[type] = {};
            for (let _proxy in tmp) {
                let r = tmp[_proxy];
                msg[type][_proxy] = {};
                for (let _rpc in r) {
                    if (typeof r[_rpc] === "function") {
                        msg[type][_proxy][_rpc] = "function";
                    }
                }
            }
            cb(null, msg);
        }
    }
    else {
        cb("no proxy loaded");
    }
}
function handlerCb(app, context, cb) {
    let msg = {};
    let __server__ = app.components.__server__;
    if (__server__ &&
        __server__.server &&
        __server__.server.handlerService.handlers) {
        let handles = __server__.server.handlerService.handlers;
        let server = app.getServerById(context);
        if (!server) {
            cb("no server with this id " + context);
        }
        else {
            let type = server["serverType"];
            let tmp = handles;
            msg[type] = {};
            for (let _p in tmp) {
                let r = tmp[_p];
                msg[type][_p] = {};
                for (let _r in r) {
                    if (typeof r[_r] === "function") {
                        msg[type][_p][_r] = "function";
                    }
                }
            }
            cb(null, msg);
        }
    }
    else {
        cb("no handler loaded");
    }
}
function getComponentName(c) {
    let t = c.match(/^__(\w+)__$/);
    let ret;
    if (t) {
        ret = t[1];
    }
    return ret;
}
function checkJSON(obj) {
    if (!obj) {
        return true;
    }
    try {
        JSON.stringify(obj);
    }
    catch (e) {
        return false;
    }
    return true;
}
module.exports = (opts) => {
    return new WatchServerModule(opts);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hTZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YXRjaFNlcnZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0E7Ozs7R0FJRztBQUNILHlEQUEwRDtBQUMxRCx1Q0FBd0M7QUFDeEMsNkJBQThCO0FBQzlCLHlCQUEwQjtBQUMxQix5QkFBMEI7QUFHMUIsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDOUUsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFNMUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEdBQUcsYUFBYSxDQUFDO0FBRXhDO0lBRUMsWUFBWSxJQUFTO1FBQ3BCLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztJQUNyQixDQUFDO0lBRUQsY0FBYyxDQUFDLEtBQWlDLEVBQUUsR0FBUSxFQUFFLEVBQVk7UUFDdkUsSUFBSSxJQUFJLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZCLElBQUksT0FBTyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QixJQUFJLEtBQUssR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDekIsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUVuQixJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUM7UUFFdkIsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNkLEtBQUssU0FBUztnQkFDYixXQUFXLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLENBQUM7WUFDUCxLQUFLLGFBQWE7Z0JBQ2pCLGVBQWUsQ0FBQyxN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QUFDO0lBQ0QsSUFBSSxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNyQixDQUFDO0lBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNaLE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztBQUNiLENBQUM7QUFuNkJELGlCQUFTLENBQUMsSUFBUyxFQUFFLEVBQUU7SUFDdEIsTUFBTSxDQUFDLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTWFzdGVyQWdlbnQgfSBmcm9tIFwiLi4vbWFzdGVyL21hc3RlckFnZW50XCI7XG4vKiFcbiAqIFBvbWVsbyAtLSBjb25zb2xlTW9kdWxlIHdhdGNoU2VydmVyXG4gKiBDb3B5cmlnaHQoYykgMjAxMyBmYW50YXN5bmkgPGZhbnRhc3luaUAxNjMuY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cbmltcG9ydCBjb3VudERvd25MYXRjaCA9IHJlcXVpcmUoXCIuLi91dGlsL2NvdW50RG93bkxhdGNoXCIpO1xuaW1wb3J0IHV0aWxzID0gcmVxdWlyZShcIi4uL3V0aWwvdXRpbHNcIik7XG5pbXBvcnQgdXRpbCA9IHJlcXVpcmUoXCJ1dGlsXCIpO1xuaW1wb3J0IGZzID0gcmVxdWlyZShcImZzXCIpO1xuaW1wb3J0IHZtID0gcmVxdWlyZShcInZtXCIpO1xuaW1wb3J0IHsgTW9uaXRvckFnZW50IH0gZnJvbSBcIi4uL21vbml0b3IvbW9uaXRvckFnZW50XCI7XG5cbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoXCJwb21lbG8tbG9nZ2VyXCIpLmdldExvZ2dlcihcInBvbWVsby1hZG1pblwiLCBfX2ZpbGVuYW1lKTtcbmNvbnN0IG1vbml0b3IgPSByZXF1aXJlKFwicG9tZWxvLW1vbml0b3JcIik7XG5cbmV4cG9ydCA9IChvcHRzOiBhbnkpID0+IHtcblx0cmV0dXJuIG5ldyBXYXRjaFNlcnZlck1vZHVsZShvcHRzKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLm1vZHVsZUlkID0gXCJ3YXRjaFNlcnZlclwiO1xuXG5jbGFzcyBXYXRjaFNlcnZlck1vZHVsZSB7XG5cdHByaXZhdGUgYXBwOiBhbnk7IC8vVE9ET1xuXHRjb25zdHJ1Y3RvcihvcHRzOiBhbnkpIHtcblx0XHRvcHRzID0gb3B0cyB8fCB7fTtcblx0XHR0aGlzLmFwcCA9IG9wdHMuYXBwO1xuXHR9XG5cblx0bW9uaXRvckhhbmRsZXIoYWdlbnQ6IE1hc3RlckFnZW50ICYgTW9uaXRvckFnZW50LCBtc2c6IGFueSwgY2I6IEZ1bmN0aW9uKSB7XG5cdFx0bGV0IGNvbWQgPSBtc2dbXCJjb21kXCJdO1xuXHRcdGxldCBjb250ZXh0ID0gbXNnW1wiY29udGV4dFwiXTtcblx0XHRsZXQgcGFyYW0gPSBtc2dbXCJwYXJhbVwiXTtcblx0XHRsZXQgYXBwID0gdGhpcy5hcHA7XG5cblx0XHRsZXQgaGFuZGxlID0gXCJtb25pdG9yXCI7XG5cblx0XHRzd2l0Y2ggKGNvbWQpIHtcblx0XHRcdGNhc2UgXCJzZXJ2ZXJzXCI6XG5cdFx0XHRcdHNob3dTZXJ2ZXJzKGhhbmRsZSwgYWdlbnQsIGNvbWQsIGNvbnRleHQsIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwiY29ubmVjdGlvbnNcIjpcblx0XHRcdFx0c2hvd0Nvbm5lY3Rpb25zKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJsb2dpbnNcIjpcblx0XHRcdFx0c2hvd0xvZ2lucyhoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwibW9kdWxlc1wiOlxuXHRcdFx0XHRzaG93TW9kdWxlcyhoYW5kbGUsIGFnZW50LCBjb21kLCBjb250ZXh0LCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcInN0YXR1c1wiOlxuXHRcdFx0XHRzaG93U3RhdHVzKGhhbmRsZSwgYWdlbnQsIGNvbWQsIGNvbnRleHQsIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwiY29uZmlnXCI6XG5cdFx0XHRcdHNob3dDb25maWcoaGFuZGxlLCBhZ2VudCwgYXBwLCBjb21kLCBjb250ZXh0LCBwYXJhbSwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJwcm94eVwiOlxuXHRcdFx0XHRzaG93UHJveHkoaGFuZGxlLCBhZ2VudCwgYXBwLCBjb21kLCBjb250ZXh0LCBwYXJhbSwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJoYW5kbGVyXCI6XG5cdFx0XHRcdHNob3dIYW5kbGVyKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwiY29tcG9uZW50c1wiOlxuXHRcdFx0XHRzaG93Q29tcG9uZW50cyhoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcInNldHRpbmdzXCI6XG5cdFx0XHRcdHNob3dTZXR0aW5ncyhoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcImNwdVwiOlxuXHRcdFx0XHRkdW1wQ1BVKGhhbmRsZSwgYWdlbnQsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcIm1lbW9yeVwiOlxuXHRcdFx0XHRkdW1wTWVtb3J5KGhhbmRsZSwgYWdlbnQsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcImdldFwiOlxuXHRcdFx0XHRnZXRBcHAoaGFuZGxlLCBhZ2VudCwgYXBwLCBjb21kLCBjb250ZXh0LCBwYXJhbSwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJzZXRcIjpcblx0XHRcdFx0c2V0QXBwKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwiZW5hYmxlXCI6XG5cdFx0XHRcdGVuYWJsZUFwcChoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcImRpc2FibGVcIjpcblx0XHRcdFx0ZGlzYWJsZUFwcChoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcInJ1blwiOlxuXHRcdFx0XHRydW5TY3JpcHQoaGFuZGxlLCBhZ2VudCwgYXBwLCBjb21kLCBjb250ZXh0LCBwYXJhbSwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHNob3dFcnJvcihoYW5kbGUsIGFnZW50LCBjb21kLCBjb250ZXh0LCBjYik7XG5cdFx0fVxuXHR9XG5cblx0Y2xpZW50SGFuZGxlcihhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsIG1zZzogYW55LCBjYjogRnVuY3Rpb24pIHtcblx0XHRsZXQgY29tZCA9IG1zZ1tcImNvbWRcIl07XG5cdFx0bGV0IGNvbnRleHQgPSBtc2dbXCJjb250ZXh0XCJdO1xuXHRcdGxldCBwYXJhbSA9IG1zZ1tcInBhcmFtXCJdO1xuXHRcdGxldCBhcHAgPSB0aGlzLmFwcDsgLy8gbWFzdGVyIGFwcFxuXG5cdFx0aWYgKCFjb21kIHx8ICFjb250ZXh0KSB7XG5cdFx0XHRjYihcImxhY2sgb2YgY29tZCBvciBjb250ZXh0IHBhcmFtXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBoYW5kbGUgPSBcImNsaWVudFwiO1xuXHRcdHN3aXRjaCAoY29tZCkge1xuXHRcdFx0Y2FzZSBcInNlcnZlcnNcIjpcblx0XHRcdFx0c2hvd1NlcnZlcnMoaGFuZGxlLCBhZ2VudCwgY29tZCwgY29udGV4dCwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJjb25uZWN0aW9uc1wiOlxuXHRcdFx0XHRzaG93Q29ubmVjdGlvbnMoaGFuZGxlLCBhZ2VudCwgYXBwLCBjb21kLCBjb250ZXh0LCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcImxvZ2luc1wiOlxuXHRcdFx0XHRzaG93TG9naW5zKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJtb2R1bGVzXCI6XG5cdFx0XHRcdHNob3dNb2R1bGVzKGhhbmRsZSwgYWdlbnQsIGNvbWQsIGNvbnRleHQsIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwic3RhdHVzXCI6XG5cdFx0XHRcdHNob3dTdGF0dXMoaGFuZGxlLCBhZ2VudCwgY29tZCwgY29udGV4dCwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJjb25maWdcIjpcblx0XHRcdFx0c2hvd0NvbmZpZyhoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcInByb3h5XCI6XG5cdFx0XHRcdHNob3dQcm94eShoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcImhhbmRsZXJcIjpcblx0XHRcdFx0c2hvd0hhbmRsZXIoaGFuZGxlLCBhZ2VudCwgYXBwLCBjb21kLCBjb250ZXh0LCBwYXJhbSwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJjb21wb25lbnRzXCI6XG5cdFx0XHRcdHNob3dDb21wb25lbnRzKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwic2V0dGluZ3NcIjpcblx0XHRcdFx0c2hvd1NldHRpbmdzKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwiY3B1XCI6XG5cdFx0XHRcdGR1bXBDUFUoaGFuZGxlLCBhZ2VudCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwibWVtb3J5XCI6XG5cdFx0XHRcdGR1bXBNZW1vcnkoaGFuZGxlLCBhZ2VudCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwiZ2V0XCI6XG5cdFx0XHRcdGdldEFwcChoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBcInNldFwiOlxuXHRcdFx0XHRzZXRBcHAoaGFuZGxlLCBhZ2VudCwgYXBwLCBjb21kLCBjb250ZXh0LCBwYXJhbSwgY2IpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgXCJlbmFibGVcIjpcblx0XHRcdFx0ZW5hYmxlQXBwKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwiZGlzYWJsZVwiOlxuXHRcdFx0XHRkaXNhYmxlQXBwKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgcGFyYW0sIGNiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFwicnVuXCI6XG5cdFx0XHRcdHJ1blNjcmlwdChoYW5kbGUsIGFnZW50LCBhcHAsIGNvbWQsIGNvbnRleHQsIHBhcmFtLCBjYik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0c2hvd0Vycm9yKGhhbmRsZSwgYWdlbnQsIGNvbWQsIGNvbnRleHQsIGNiKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gc2hvd1NlcnZlcnMoXG5cdGhhbmRsZTogc3RyaW5nLFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGNvbWQ6IHN0cmluZyxcblx0Y29udGV4dDogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRpZiAoaGFuZGxlID09PSBcImNsaWVudFwiKSB7XG5cdFx0bGV0IHNpZCwgcmVjb3JkO1xuXHRcdGxldCBzZXJ2ZXJJbmZvOiBhbnkgPSB7fTtcblx0XHRsZXQgY291bnQgPSB1dGlscy5zaXplKGFnZW50LmlkTWFwKTtcblx0XHRsZXQgbGF0Y2ggPSBjb3VudERvd25MYXRjaC5jcmVhdGVDb3VudERvd25MYXRjaChjb3VudCwgZnVuY3Rpb24oKSB7XG5cdFx0XHRjYihudWxsLCB7XG5cdFx0XHRcdG1zZzogc2VydmVySW5mb1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRmb3IgKHNpZCBpbiBhZ2VudC5pZE1hcCkge1xuXHRcdFx0cmVjb3JkID0gYWdlbnQuaWRNYXBbc2lkXTtcblx0XHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRcdHJlY29yZC5pZCxcblx0XHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb21kOiBjb21kLFxuXHRcdFx0XHRcdGNvbnRleHQ6IGNvbnRleHRcblx0XHRcdFx0fSxcblx0XHRcdFx0KG1zZzogYW55KSA9PiB7XG5cdFx0XHRcdFx0c2VydmVySW5mb1ttc2cuc2VydmVySWRdID0gbXNnLmJvZHk7XG5cdFx0XHRcdFx0bGF0Y2guZG9uZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblx0fSBlbHNlIGlmIChoYW5kbGUgPT09IFwibW9uaXRvclwiKSB7XG5cdFx0bGV0IHNlcnZlcklkID0gYWdlbnQuaWQ7XG5cdFx0bGV0IHNlcnZlclR5cGUgPSBhZ2VudC50eXBlO1xuXHRcdGxldCBpbmZvID0gYWdlbnQuaW5mbztcblx0XHRsZXQgcGlkID0gcHJvY2Vzcy5waWQ7XG5cdFx0bGV0IGhlYXBVc2VkID0gKHByb2Nlc3MubWVtb3J5VXNhZ2UoKS5oZWFwVXNlZCAvICgxMDAwICogMTAwMCkpLnRvRml4ZWQoXG5cdFx0XHQyXG5cdFx0KTtcblx0XHRsZXQgdXB0aW1lID0gKHByb2Nlc3MudXB0aW1lKCkgLyA2MCkudG9GaXhlZCgyKTtcblx0XHRjYih7XG5cdFx0XHRzZXJ2ZXJJZDogc2VydmVySWQsXG5cdFx0XHRib2R5OiB7XG5cdFx0XHRcdHNlcnZlcklkOiBzZXJ2ZXJJZCxcblx0XHRcdFx0c2VydmVyVHlwZTogc2VydmVyVHlwZSxcblx0XHRcdFx0aG9zdDogaW5mb1tcImhvc3RcIl0sXG5cdFx0XHRcdHBvcnQ6IGluZm9bXCJwb3J0XCJdLFxuXHRcdFx0XHRwaWQ6IHBpZCxcblx0XHRcdFx0aGVhcFVzZWQ6IGhlYXBVc2VkLFxuXHRcdFx0XHR1cHRpbWU6IHVwdGltZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNob3dDb25uZWN0aW9ucyhcblx0aGFuZGxlOiBzdHJpbmcsXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0YXBwOiBhbnksXG5cdGNvbWQ6IHN0cmluZyxcblx0Y29udGV4dDogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRpZiAoaGFuZGxlID09PSBcImNsaWVudFwiKSB7XG5cdFx0aWYgKGNvbnRleHQgPT09IFwiYWxsXCIpIHtcblx0XHRcdGxldCBzaWQsIHJlY29yZDtcblx0XHRcdGxldCBzZXJ2ZXJJbmZvOiBhbnkgPSB7fTtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRmb3IgKGxldCBrZXkgaW4gYWdlbnQuaWRNYXApIHtcblx0XHRcdFx0aWYgKGFnZW50LmlkTWFwW2tleV0uaW5mby5mcm9udGVuZCA9PT0gXCJ0cnVlXCIpIHtcblx0XHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRsZXQgbGF0Y2ggPSBjb3VudERvd25MYXRjaC5jcmVhdGVDb3VudERvd25MYXRjaChjb3VudCwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGNiKG51bGwsIHtcblx0XHRcdFx0XHRtc2c6IHNlcnZlckluZm9cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChzaWQgaW4gYWdlbnQuaWRNYXApIHtcblx0XHRcdFx0cmVjb3JkID0gYWdlbnQuaWRNYXBbc2lkXTtcblx0XHRcdFx0aWYgKHJlY29yZC5pbmZvLmZyb250ZW5kID09PSBcInRydWVcIikge1xuXHRcdFx0XHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRcdFx0XHRyZWNvcmQuaWQsXG5cdFx0XHRcdFx0XHRtb2R1bGUuZXhwb3J0cy5tb2R1bGVJZCxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0Y29tZDogY29tZCxcblx0XHRcdFx0XHRcdFx0Y29udGV4dDogY29udGV4dFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdChtc2c6IGFueSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJJbmZvW21zZy5zZXJ2ZXJJZF0gPSBtc2cuYm9keTtcblx0XHRcdFx0XHRcdFx0bGF0Y2guZG9uZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHJlY29yZCA9IGFnZW50LmlkTWFwW2NvbnRleHRdO1xuXHRcdFx0aWYgKCFyZWNvcmQpIHtcblx0XHRcdFx0Y2IoXCJ0aGUgc2VydmVyIFwiICsgY29udGV4dCArIFwiIG5vdCBleGlzdFwiKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWNvcmQuaW5mby5mcm9udGVuZCA9PT0gXCJ0cnVlXCIpIHtcblx0XHRcdFx0YWdlbnQucmVxdWVzdChcblx0XHRcdFx0XHRyZWNvcmQuaWQsXG5cdFx0XHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Y29tZDogY29tZCxcblx0XHRcdFx0XHRcdGNvbnRleHQ6IGNvbnRleHRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdChtc2c6IGFueSkgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IHNlcnZlckluZm86IGFueSA9IHt9O1xuXHRcdFx0XHRcdFx0c2VydmVySW5mb1ttc2cuc2VydmVySWRdID0gbXNnLmJvZHk7XG5cdFx0XHRcdFx0XHRjYihudWxsLCB7XG5cdFx0XHRcdFx0XHRcdG1zZzogc2VydmVySW5mb1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2IoXCJcXG50aGlzIGNvbW1hbmQgc2hvdWxkIGJlIGFwcGxpZWQgdG8gZnJvbnRlbmQgc2VydmVyXFxuXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIGlmIChoYW5kbGUgPT09IFwibW9uaXRvclwiKSB7XG5cdFx0bGV0IGNvbm5lY3Rpb24gPSBhcHAuY29tcG9uZW50cy5fX2Nvbm5lY3Rpb25fXztcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdGNiKHtcblx0XHRcdFx0c2VydmVySWQ6IGFnZW50LmlkLFxuXHRcdFx0XHRib2R5OiBcImVycm9yXCJcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNiKHtcblx0XHRcdHNlcnZlcklkOiBhZ2VudC5pZCxcblx0XHRcdGJvZHk6IGNvbm5lY3Rpb24uZ2V0U3RhdGlzdGljc0luZm8oKVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNob3dMb2dpbnMoXG5cdGhhbmRsZTogc3RyaW5nLFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGFwcDogYW55LFxuXHRjb21kOiBzdHJpbmcsXG5cdGNvbnRleHQ6IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0c2hvd0Nvbm5lY3Rpb25zKGhhbmRsZSwgYWdlbnQsIGFwcCwgY29tZCwgY29udGV4dCwgY2IpO1xufVxuXG5mdW5jdGlvbiBzaG93TW9kdWxlcyhcblx0aGFuZGxlOiBzdHJpbmcsXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0Y29tZDogc3RyaW5nLFxuXHRjb250ZXh0OiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7XG5cdGxldCBtb2R1bGVzID0gYWdlbnQuY29uc29sZVNlcnZpY2UubW9kdWxlcztcblx0bGV0IHJlc3VsdCA9IFtdO1xuXHRmb3IgKGxldCBtb2R1bGUgaW4gbW9kdWxlcykge1xuXHRcdHJlc3VsdC5wdXNoKG1vZHVsZSk7XG5cdH1cblx0Y2IobnVsbCwge1xuXHRcdG1zZzogcmVzdWx0XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBzaG93U3RhdHVzKFxuXHRoYW5kbGU6IHN0cmluZyxcblx0YWdlbnQ6IE1hc3RlckFnZW50ICYgTW9uaXRvckFnZW50LFxuXHRjb21kOiBzdHJpbmcsXG5cdGNvbnRleHQ6IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0aWYgKGhhbmRsZSA9PT0gXCJjbGllbnRcIikge1xuXHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbWQ6IGNvbWQsXG5cdFx0XHRcdGNvbnRleHQ6IGNvbnRleHRcblx0XHRcdH0sXG5cdFx0XHQoZXJyOiBhbnksIG1zZzogYW55KSA9PiB7XG5cdFx0XHRcdGNiKG51bGwsIHtcblx0XHRcdFx0XHRtc2c6IG1zZ1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHQpO1xuXHR9IGVsc2UgaWYgKGhhbmRsZSA9PT0gXCJtb25pdG9yXCIpIHtcblx0XHRsZXQgc2VydmVySWQgPSBhZ2VudC5pZDtcblx0XHRsZXQgcGlkID0gcHJvY2Vzcy5waWQ7XG5cdFx0bGV0IHBhcmFtcyA9IHtcblx0XHRcdHNlcnZlcklkOiBzZXJ2ZXJJZCxcblx0XHRcdHBpZDogcGlkXG5cdFx0fTtcblx0XHRtb25pdG9yLnBzbW9uaXRvci5nZXRQc0luZm8ocGFyYW1zLCAoZXJyOiBhbnksIGRhdGE6IGFueSkgPT4ge1xuXHRcdFx0Y2IobnVsbCwge1xuXHRcdFx0XHRzZXJ2ZXJJZDogYWdlbnQuaWQsXG5cdFx0XHRcdGJvZHk6IGRhdGFcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNob3dDb25maWcoXG5cdGhhbmRsZTogc3RyaW5nLFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGFwcDogYW55LFxuXHRjb21kOiBzdHJpbmcsXG5cdGNvbnRleHQ6IGFueSxcblx0cGFyYW06IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0aWYgKGhhbmRsZSA9PT0gXCJjbGllbnRcIikge1xuXHRcdGlmIChwYXJhbSA9PT0gXCJtYXN0ZXJcIikge1xuXHRcdFx0Y2IobnVsbCwge1xuXHRcdFx0XHRtYXN0ZXJDb25maWc6XG5cdFx0XHRcdFx0YXBwLmdldChcIm1hc3RlckNvbmZpZ1wiKSB8fCBcIm5vIGNvbmZpZyB0byBtYXN0ZXIgaW4gYXBwLmpzXCIsXG5cdFx0XHRcdG1hc3RlckluZm86IGFwcC5nZXQoXCJtYXN0ZXJcIilcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbWQ6IGNvbWQsXG5cdFx0XHRcdHBhcmFtOiBwYXJhbSxcblx0XHRcdFx0Y29udGV4dDogY29udGV4dFxuXHRcdFx0fSxcblx0XHRcdChlcnI6IGFueSwgbXNnOiBhbnkpID0+IHtcblx0XHRcdFx0Y2IobnVsbCwgbXNnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9IGVsc2UgaWYgKGhhbmRsZSA9PT0gXCJtb25pdG9yXCIpIHtcblx0XHRsZXQga2V5ID0gcGFyYW0gKyBcIkNvbmZpZ1wiO1xuXHRcdGNiKG51bGwsIGNsb25lKHBhcmFtLCBhcHAuZ2V0KGtleSkpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzaG93UHJveHkoXG5cdGhhbmRsZTogc3RyaW5nLFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGFwcDogYW55LFxuXHRjb21kOiBzdHJpbmcsXG5cdGNvbnRleHQ6IGFueSxcblx0cGFyYW06IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0aWYgKGhhbmRsZSA9PT0gXCJjbGllbnRcIikge1xuXHRcdGlmIChjb250ZXh0ID09PSBcImFsbFwiKSB7XG5cdFx0XHRjYihcImNvbnRleHQgZXJyb3JcIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWdlbnQucmVxdWVzdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRtb2R1bGUuZXhwb3J0cy5tb2R1bGVJZCxcblx0XHRcdHtcblx0XHRcdFx0Y29tZDogY29tZCxcblx0XHRcdFx0cGFyYW06IHBhcmFtLFxuXHRcdFx0XHRjb250ZXh0OiBjb250ZXh0XG5cdFx0XHR9LFxuXHRcdFx0KGVycjogYW55LCBtc2c6IGFueSkgPT4ge1xuXHRcdFx0XHRjYihudWxsLCBtc2cpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0gZWxzZSBpZiAoaGFuZGxlID09PSBcIm1vbml0b3JcIikge1xuXHRcdHByb3h5Q2IoYXBwLCBjb250ZXh0LCBjYik7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2hvd0hhbmRsZXIoXG5cdGhhbmRsZTogc3RyaW5nLFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGFwcDogYW55LFxuXHRjb21kOiBzdHJpbmcsXG5cdGNvbnRleHQ6IGFueSxcblx0cGFyYW06IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0aWYgKGhhbmRsZSA9PT0gXCJjbGllbnRcIikge1xuXHRcdGlmIChjb250ZXh0ID09PSBcImFsbFwiKSB7XG5cdFx0XHRjYihcImNvbnRleHQgZXJyb3JcIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWdlbnQucmVxdWVzdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRtb2R1bGUuZXhwb3J0cy5tb2R1bGVJZCxcblx0XHRcdHtcblx0XHRcdFx0Y29tZDogY29tZCxcblx0XHRcdFx0cGFyYW06IHBhcmFtLFxuXHRcdFx0XHRjb250ZXh0OiBjb250ZXh0XG5cdFx0XHR9LFxuXHRcdFx0KGVycjogYW55LCBtc2c6IGFueSkgPT4ge1xuXHRcdFx0XHRjYihudWxsLCBtc2cpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0gZWxzZSBpZiAoaGFuZGxlID09PSBcIm1vbml0b3JcIikge1xuXHRcdGhhbmRsZXJDYihhcHAsIGNvbnRleHQsIGNiKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzaG93Q29tcG9uZW50cyhcblx0aGFuZGxlOiBzdHJpbmcsXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0YXBwOiBhbnksXG5cdGNvbWQ6IHN0cmluZyxcblx0Y29udGV4dDogYW55LFxuXHRwYXJhbTogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRpZiAoaGFuZGxlID09PSBcImNsaWVudFwiKSB7XG5cdFx0aWYgKGNvbnRleHQgPT09IFwiYWxsXCIpIHtcblx0XHRcdGNiKFwiY29udGV4dCBlcnJvclwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhZ2VudC5yZXF1ZXN0KFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdG1vZHVsZS5leHBvcnRzLm1vZHVsZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRjb21kOiBjb21kLFxuXHRcdFx0XHRwYXJhbTogcGFyYW0sXG5cdFx0XHRcdGNvbnRleHQ6IGNvbnRleHRcblx0XHRcdH0sXG5cdFx0XHQoZXJyOiBhbnksIG1zZzogYW55KSA9PiB7XG5cdFx0XHRcdGNiKG51bGwsIG1zZyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSBlbHNlIGlmIChoYW5kbGUgPT09IFwibW9uaXRvclwiKSB7XG5cdFx0bGV0IF9jb21wb25lbnRzID0gYXBwLmNvbXBvbmVudHM7XG5cdFx0bGV0IHJlczogYW55ID0ge307XG5cdFx0Zm9yIChsZXQga2V5IGluIF9jb21wb25lbnRzKSB7XG5cdFx0XHRsZXQgbmFtZSA9IGdldENvbXBvbmVudE5hbWUoa2V5KTtcblx0XHRcdHJlc1tuYW1lIV0gPSBjbG9uZShuYW1lLCBhcHAuZ2V0KG5hbWUgKyBcIkNvbmZpZ1wiKSk7XG5cdFx0fVxuXHRcdGNiKG51bGwsIHJlcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2hvd1NldHRpbmdzKFxuXHRoYW5kbGU6IHN0cmluZyxcblx0YWdlbnQ6IE1hc3RlckFnZW50ICYgTW9uaXRvckFnZW50LFxuXHRhcHA6IGFueSxcblx0Y29tZDogc3RyaW5nLFxuXHRjb250ZXh0OiBhbnksXG5cdHBhcmFtOiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7XG5cdGlmIChoYW5kbGUgPT09IFwiY2xpZW50XCIpIHtcblx0XHRpZiAoY29udGV4dCA9PT0gXCJhbGxcIikge1xuXHRcdFx0Y2IoXCJjb250ZXh0IGVycm9yXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbWQ6IGNvbWQsXG5cdFx0XHRcdHBhcmFtOiBwYXJhbSxcblx0XHRcdFx0Y29udGV4dDogY29udGV4dFxuXHRcdFx0fSxcblx0XHRcdChlcnI6IGFueSwgbXNnOiBhbnkpID0+IHtcblx0XHRcdFx0Y2IobnVsbCwgbXNnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9IGVsc2UgaWYgKGhhbmRsZSA9PT0gXCJtb25pdG9yXCIpIHtcblx0XHRsZXQgX3NldHRpbmdzID0gYXBwLnNldHRpbmdzO1xuXHRcdGxldCByZXM6IGFueSA9IHt9O1xuXHRcdGZvciAobGV0IGtleSBpbiBfc2V0dGluZ3MpIHtcblx0XHRcdGlmIChrZXkubWF0Y2goL15fX1xcdytfXyQvKSB8fCBrZXkubWF0Y2goL1xcdytDb25maWckLykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWNoZWNrSlNPTihfc2V0dGluZ3Nba2V5XSkpIHtcblx0XHRcdFx0cmVzW2tleV0gPSBcIk9iamVjdFwiO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJlc1trZXldID0gX3NldHRpbmdzW2tleV07XG5cdFx0fVxuXHRcdGNiKG51bGwsIHJlcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZHVtcENQVShcblx0aGFuZGxlOiBzdHJpbmcsXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0Y29tZDogc3RyaW5nLFxuXHRjb250ZXh0OiBhbnksXG5cdHBhcmFtOiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7XG5cdGlmIChoYW5kbGUgPT09IFwiY2xpZW50XCIpIHtcblx0XHRpZiAoY29udGV4dCA9PT0gXCJhbGxcIikge1xuXHRcdFx0Y2IoXCJjb250ZXh0IGVycm9yXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbWQ6IGNvbWQsXG5cdFx0XHRcdHBhcmFtOiBwYXJhbSxcblx0XHRcdFx0Y29udGV4dDogY29udGV4dFxuXHRcdFx0fSxcblx0XHRcdChlcnI6IGFueSwgbXNnOiBhbnkpID0+IHtcblx0XHRcdFx0Y2IoZXJyLCBtc2cpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0gZWxzZSBpZiAoaGFuZGxlID09PSBcIm1vbml0b3JcIikge1xuXHRcdGxldCB0aW1lcyA9IHBhcmFtW1widGltZXNcIl07XG5cdFx0bGV0IGZpbGVwYXRoID0gcGFyYW1bXCJmaWxlcGF0aFwiXTtcblx0XHRsZXQgZm9yY2UgPSBwYXJhbVtcImZvcmNlXCJdO1xuXHRcdGNiKG51bGwsIFwiY3B1IGR1bXAgaXMgdW51c2VkIGluIDEuMCBvZiBwb21lbG9cIik7XG5cdFx0LyoqXG5cdFx0aWYgKCEvXFwuY3B1cHJvZmlsZSQvLnRlc3QoZmlsZXBhdGgpKSB7XG5cdFx0XHRmaWxlcGF0aCA9IGZpbGVwYXRoICsgJy5jcHVwcm9maWxlJztcblx0XHR9XG5cdFx0aWYgKCF0aW1lcyB8fCAhL15bMC05XSpbMS05XVswLTldKiQvLnRlc3QodGltZXMpKSB7XG5cdFx0XHRjYignbm8gdGltZXMgb3IgdGltZXMgaW52YWxpZCBlcnJvcicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjaGVja0ZpbGVQYXRoKGZpbGVwYXRoLCBmb3JjZSwgZnVuY3Rpb24oZXJyKSB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGNiKGVycik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vbmR1bXAuY3B1KGZpbGVwYXRoLCB0aW1lcyk7XG5cdFx0XHRjYihudWxsLCBmaWxlcGF0aCArICcgY3B1IGR1bXAgb2snKTtcblx0XHR9KTtcblx0XHQqL1xuXHR9XG59XG5cbmZ1bmN0aW9uIGR1bXBNZW1vcnkoXG5cdGhhbmRsZTogc3RyaW5nLFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGNvbWQ6IHN0cmluZyxcblx0Y29udGV4dDogYW55LFxuXHRwYXJhbTogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRpZiAoaGFuZGxlID09PSBcImNsaWVudFwiKSB7XG5cdFx0aWYgKGNvbnRleHQgPT09IFwiYWxsXCIpIHtcblx0XHRcdGNiKFwiY29udGV4dCBlcnJvclwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhZ2VudC5yZXF1ZXN0KFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdG1vZHVsZS5leHBvcnRzLm1vZHVsZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRjb21kOiBjb21kLFxuXHRcdFx0XHRwYXJhbTogcGFyYW0sXG5cdFx0XHRcdGNvbnRleHQ6IGNvbnRleHRcblx0XHRcdH0sXG5cdFx0XHQoZXJyOiBhbnksIG1zZzogYW55KSA9PiB7XG5cdFx0XHRcdGNiKGVyciwgbXNnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9IGVsc2UgaWYgKGhhbmRsZSA9PT0gXCJtb25pdG9yXCIpIHtcblx0XHRsZXQgZmlsZXBhdGggPSBwYXJhbVtcImZpbGVwYXRoXCJdO1xuXHRcdGxldCBmb3JjZSA9IHBhcmFtW1wiZm9yY2VcIl07XG5cdFx0aWYgKCEvXFwuaGVhcHNuYXBzaG90JC8udGVzdChmaWxlcGF0aCkpIHtcblx0XHRcdGZpbGVwYXRoID0gZmlsZXBhdGggKyBcIi5oZWFwc25hcHNob3RcIjtcblx0XHR9XG5cdFx0Y2hlY2tGaWxlUGF0aChmaWxlcGF0aCwgZm9yY2UsIChlcnI6IGFueSkgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjYihlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgaGVhcGR1bXAgPSBudWxsO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aGVhcGR1bXAgPSByZXF1aXJlKFwiaGVhcGR1bXBcIik7XG5cdFx0XHRcdGhlYXBkdW1wLndyaXRlU25hcHNob3QoZmlsZXBhdGgpO1xuXHRcdFx0XHRjYihudWxsLCBmaWxlcGF0aCArIFwiIG1lbW9yeSBkdW1wIG9rXCIpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjYihcInBvbWVsby1hZG1pbiByZXF1aXJlIGhlYXBkdW1wXCIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEFwcChcblx0aGFuZGxlOiBzdHJpbmcsXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0YXBwOiBhbnksXG5cdGNvbWQ6IHN0cmluZyxcblx0Y29udGV4dDogYW55LFxuXHRwYXJhbTogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRpZiAoaGFuZGxlID09PSBcImNsaWVudFwiKSB7XG5cdFx0aWYgKGNvbnRleHQgPT09IFwiYWxsXCIpIHtcblx0XHRcdGNiKFwiY29udGV4dCBlcnJvclwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhZ2VudC5yZXF1ZXN0KFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdG1vZHVsZS5leHBvcnRzLm1vZHVsZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRjb21kOiBjb21kLFxuXHRcdFx0XHRwYXJhbTogcGFyYW0sXG5cdFx0XHRcdGNvbnRleHQ6IGNvbnRleHRcblx0XHRcdH0sXG5cdFx0XHQoZXJyOiBhbnksIG1zZzogYW55KSA9PiB7XG5cdFx0XHRcdGNiKG51bGwsIG1zZyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSBlbHNlIGlmIChoYW5kbGUgPT09IFwibW9uaXRvclwiKSB7XG5cdFx0bGV0IHJlcyA9IGFwcC5nZXQocGFyYW0pO1xuXHRcdGlmICghY2hlY2tKU09OKHJlcykpIHtcblx0XHRcdHJlcyA9IFwib2JqZWN0XCI7XG5cdFx0fVxuXHRcdGNiKG51bGwsIHJlcyB8fCBudWxsKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzZXRBcHAoXG5cdGhhbmRsZTogc3RyaW5nLFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGFwcDogYW55LFxuXHRjb21kOiBzdHJpbmcsXG5cdGNvbnRleHQ6IGFueSxcblx0cGFyYW06IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0aWYgKGhhbmRsZSA9PT0gXCJjbGllbnRcIikge1xuXHRcdGlmIChjb250ZXh0ID09PSBcImFsbFwiKSB7XG5cdFx0XHRjYihcImNvbnRleHQgZXJyb3JcIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWdlbnQucmVxdWVzdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRtb2R1bGUuZXhwb3J0cy5tb2R1bGVJZCxcblx0XHRcdHtcblx0XHRcdFx0Y29tZDogY29tZCxcblx0XHRcdFx0cGFyYW06IHBhcmFtLFxuXHRcdFx0XHRjb250ZXh0OiBjb250ZXh0XG5cdFx0XHR9LFxuXHRcdFx0KGVycjogYW55LCBtc2c6IGFueSkgPT4ge1xuXHRcdFx0XHRjYihudWxsLCBtc2cpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0gZWxzZSBpZiAoaGFuZGxlID09PSBcIm1vbml0b3JcIikge1xuXHRcdGxldCBrZXkgPSBwYXJhbVtcImtleVwiXTtcblx0XHRsZXQgdmFsdWUgPSBwYXJhbVtcInZhbHVlXCJdO1xuXHRcdGFwcC5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0Y2IobnVsbCwgXCJzZXQgXCIgKyBrZXkgKyBcIjpcIiArIHZhbHVlICsgXCIgb2tcIik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZW5hYmxlQXBwKFxuXHRoYW5kbGU6IHN0cmluZyxcblx0YWdlbnQ6IE1hc3RlckFnZW50ICYgTW9uaXRvckFnZW50LFxuXHRhcHA6IGFueSxcblx0Y29tZDogc3RyaW5nLFxuXHRjb250ZXh0OiBhbnksXG5cdHBhcmFtOiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7XG5cdGlmIChoYW5kbGUgPT09IFwiY2xpZW50XCIpIHtcblx0XHRpZiAoY29udGV4dCA9PT0gXCJhbGxcIikge1xuXHRcdFx0Y2IoXCJjb250ZXh0IGVycm9yXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbWQ6IGNvbWQsXG5cdFx0XHRcdHBhcmFtOiBwYXJhbSxcblx0XHRcdFx0Y29udGV4dDogY29udGV4dFxuXHRcdFx0fSxcblx0XHRcdChlcnI6IGFueSwgbXNnOiBhbnkpID0+IHtcblx0XHRcdFx0Y2IobnVsbCwgbXNnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9IGVsc2UgaWYgKGhhbmRsZSA9PT0gXCJtb25pdG9yXCIpIHtcblx0XHRhcHAuZW5hYmxlKHBhcmFtKTtcblx0XHRjYihudWxsLCBcImVuYWJsZSBcIiArIHBhcmFtICsgXCIgb2tcIik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZGlzYWJsZUFwcChcblx0aGFuZGxlOiBzdHJpbmcsXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0YXBwOiBhbnksXG5cdGNvbWQ6IHN0cmluZyxcblx0Y29udGV4dDogYW55LFxuXHRwYXJhbTogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRpZiAoaGFuZGxlID09PSBcImNsaWVudFwiKSB7XG5cdFx0aWYgKGNvbnRleHQgPT09IFwiYWxsXCIpIHtcblx0XHRcdGNiKFwiY29udGV4dCBlcnJvclwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhZ2VudC5yZXF1ZXN0KFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdG1vZHVsZS5leHBvcnRzLm1vZHVsZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRjb21kOiBjb21kLFxuXHRcdFx0XHRwYXJhbTogcGFyYW0sXG5cdFx0XHRcdGNvbnRleHQ6IGNvbnRleHRcblx0XHRcdH0sXG5cdFx0XHQoZXJyOiBhbnksIG1zZzogYW55KSA9PiB7XG5cdFx0XHRcdGNiKG51bGwsIG1zZyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSBlbHNlIGlmIChoYW5kbGUgPT09IFwibW9uaXRvclwiKSB7XG5cdFx0YXBwLmRpc2FibGUocGFyYW0pO1xuXHRcdGNiKG51bGwsIFwiZGlzYWJsZSBcIiArIHBhcmFtICsgXCIgb2tcIik7XG5cdH1cbn1cblxuZnVuY3Rpb24gcnVuU2NyaXB0KFxuXHRoYW5kbGU6IHN0cmluZyxcblx0YWdlbnQ6IE1hc3RlckFnZW50ICYgTW9uaXRvckFnZW50LFxuXHRhcHA6IGFueSxcblx0Y29tZDogc3RyaW5nLFxuXHRjb250ZXh0OiBhbnksXG5cdHBhcmFtOiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7XG5cdGlmIChoYW5kbGUgPT09IFwiY2xpZW50XCIpIHtcblx0XHRpZiAoY29udGV4dCA9PT0gXCJhbGxcIikge1xuXHRcdFx0Y2IoXCJjb250ZXh0IGVycm9yXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFnZW50LnJlcXVlc3QoXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9kdWxlLmV4cG9ydHMubW9kdWxlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbWQ6IGNvbWQsXG5cdFx0XHRcdHBhcmFtOiBwYXJhbSxcblx0XHRcdFx0Y29udGV4dDogY29udGV4dFxuXHRcdFx0fSxcblx0XHRcdChlcnI6IGFueSwgbXNnOiBhbnkpID0+IHtcblx0XHRcdFx0Y2IobnVsbCwgbXNnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9IGVsc2UgaWYgKGhhbmRsZSA9PT0gXCJtb25pdG9yXCIpIHtcblx0XHRsZXQgY3R4ID0ge1xuXHRcdFx0YXBwOiBhcHAsXG5cdFx0XHRyZXN1bHQ6IG51bGxcblx0XHR9O1xuXHRcdHRyeSB7XG5cdFx0XHR2bS5ydW5Jbk5ld0NvbnRleHQoXCJyZXN1bHQgPSBcIiArIHBhcmFtLCBjdHgsIDxhbnk+XCJteUFwcC52bVwiKTtcblx0XHRcdGNiKG51bGwsIHV0aWwuaW5zcGVjdChjdHgucmVzdWx0KSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y2IobnVsbCwgZS5zdGFjayk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHNob3dFcnJvcihcblx0aGFuZGxlOiBzdHJpbmcsXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0Y29tZDogc3RyaW5nLFxuXHRjb250ZXh0OiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7fVxuXG5mdW5jdGlvbiBjbG9uZShwYXJhbTogYW55LCBvYmo6IGFueSkge1xuXHRsZXQgcmVzdWx0OiBhbnkgPSB7fTtcblx0bGV0IGZsYWcgPSAxO1xuXHRmb3IgKGxldCBrZXkgaW4gb2JqKSB7XG5cdFx0aWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gXCJmdW5jdGlvblwiIHx8IHR5cGVvZiBvYmpba2V5XSA9PT0gXCJvYmplY3RcIikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGZsYWcgPSAwO1xuXHRcdHJlc3VsdFtrZXldID0gb2JqW2tleV07XG5cdH1cblx0aWYgKGZsYWcpIHtcblx0XHQvLyByZXR1cm4gJ25vICcgKyBwYXJhbSArICdDb25maWcgaW5mbyc7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY2hlY2tGaWxlUGF0aChmaWxlcGF0aDogc3RyaW5nLCBmb3JjZTogYm9vbGVhbiwgY2I6IEZ1bmN0aW9uKSB7XG5cdGlmICghZm9yY2UgJiYgZnMuZXhpc3RzU3luYyhmaWxlcGF0aCkpIHtcblx0XHRjYihcImZpbGVwYXRoIGZpbGUgZXhpc3RcIik7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGZzLndyaXRlRmlsZShmaWxlcGF0aCwgXCJ0ZXN0XCIsIGZ1bmN0aW9uKGVycikge1xuXHRcdGlmIChlcnIpIHtcblx0XHRcdGNiKFwiZmlsZXBhdGggaW52YWxpZCBlcnJvclwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZnMudW5saW5rU3luYyhmaWxlcGF0aCk7XG5cdFx0Y2IobnVsbCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBwcm94eUNiKGFwcDogYW55LCBjb250ZXh0OiBhbnksIGNiOiBGdW5jdGlvbikge1xuXHRsZXQgbXNnOiBhbnkgPSB7fTtcblx0bGV0IF9fcHJveHlfXyA9IGFwcC5jb21wb25lbnRzLl9fcHJveHlfXztcblx0aWYgKF9fcHJveHlfXyAmJiBfX3Byb3h5X18uY2xpZW50ICYmIF9fcHJveHlfXy5jbGllbnQucHJveGllcy51c2VyKSB7XG5cdFx0bGV0IHByb3hpZXMgPSBfX3Byb3h5X18uY2xpZW50LnByb3hpZXMudXNlcjtcblx0XHRsZXQgc2VydmVyID0gYXBwLmdldFNlcnZlckJ5SWQoY29udGV4dCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdGNiKFwibm8gc2VydmVyIHdpdGggdGhpcyBpZCBcIiArIGNvbnRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgdHlwZSA9IHNlcnZlcltcInNlcnZlclR5cGVcIl07XG5cdFx0XHRsZXQgdG1wID0gcHJveGllc1t0eXBlXTtcblx0XHRcdG1zZ1t0eXBlXSA9IHt9O1xuXHRcdFx0Zm9yIChsZXQgX3Byb3h5IGluIHRtcCkge1xuXHRcdFx0XHRsZXQgciA9IHRtcFtfcHJveHldO1xuXHRcdFx0XHRtc2dbdHlwZV1bX3Byb3h5XSA9IHt9O1xuXHRcdFx0XHRmb3IgKGxldCBfcnBjIGluIHIpIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHJbX3JwY10gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRcdFx0bXNnW3R5cGVdW19wcm94eV1bX3JwY10gPSBcImZ1bmN0aW9uXCI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYihudWxsLCBtc2cpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRjYihcIm5vIHByb3h5IGxvYWRlZFwiKTtcblx0fVxufVxuXG5mdW5jdGlvbiBoYW5kbGVyQ2IoYXBwOiBhbnksIGNvbnRleHQ6IGFueSwgY2I6IEZ1bmN0aW9uKSB7XG5cdGxldCBtc2c6IGFueSA9IHt9O1xuXHRsZXQgX19zZXJ2ZXJfXyA9IGFwcC5jb21wb25lbnRzLl9fc2VydmVyX187XG5cdGlmIChcblx0XHRfX3NlcnZlcl9fICYmXG5cdFx0X19zZXJ2ZXJfXy5zZXJ2ZXIgJiZcblx0XHRfX3NlcnZlcl9fLnNlcnZlci5oYW5kbGVyU2VydmljZS5oYW5kbGVyc1xuXHQpIHtcblx0XHRsZXQgaGFuZGxlcyA9IF9fc2VydmVyX18uc2VydmVyLmhhbmRsZXJTZXJ2aWNlLmhhbmRsZXJzO1xuXHRcdGxldCBzZXJ2ZXIgPSBhcHAuZ2V0U2VydmVyQnlJZChjb250ZXh0KTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0Y2IoXCJubyBzZXJ2ZXIgd2l0aCB0aGlzIGlkIFwiICsgY29udGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB0eXBlID0gc2VydmVyW1wic2VydmVyVHlwZVwiXTtcblx0XHRcdGxldCB0bXAgPSBoYW5kbGVzO1xuXHRcdFx0bXNnW3R5cGVdID0ge307XG5cdFx0XHRmb3IgKGxldCBfcCBpbiB0bXApIHtcblx0XHRcdFx0bGV0IHIgPSB0bXBbX3BdO1xuXHRcdFx0XHRtc2dbdHlwZV1bX3BdID0ge307XG5cdFx0XHRcdGZvciAobGV0IF9yIGluIHIpIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHJbX3JdID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0XHRcdG1zZ1t0eXBlXVtfcF1bX3JdID0gXCJmdW5jdGlvblwiO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2IobnVsbCwgbXNnKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y2IoXCJubyBoYW5kbGVyIGxvYWRlZFwiKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRDb21wb25lbnROYW1lKGM6IHN0cmluZykge1xuXHRsZXQgdCA9IGMubWF0Y2goL15fXyhcXHcrKV9fJC8pO1xuXHRsZXQgcmV0O1xuXHRpZiAodCkge1xuXHRcdHJldCA9IHRbMV0gYXMgc3RyaW5nO1xuXHR9XG5cdHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIGNoZWNrSlNPTihvYmo6IGFueSkge1xuXHRpZiAoIW9iaikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHRyeSB7XG5cdFx0SlNPTi5zdHJpbmdpZnkob2JqKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cbiJdfQ==