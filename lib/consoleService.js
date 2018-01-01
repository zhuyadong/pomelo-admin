"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("pomelo-logger").getLogger("pomelo-admin", "ConsoleService");
const schedule = require("pomelo-scheduler");
const protocol = require("./util/protocol");
const utils = require("./util/utils");
const events_1 = require("events");
const monitorAgent_1 = require("./monitor/monitorAgent");
const masterAgent_1 = require("./master/masterAgent");
const MS_OF_SECOND = 1000;
class ConsoleService extends events_1.EventEmitter {
    /**
     * ConsoleService Constructor
     *
     * @class ConsoleService
     * @constructor
     * @param {Object} opts construct parameter
     *                 opts.type 	{String} server type, 'master', 'connector', etc.
     *                 opts.id 		{String} server id
     *                 opts.host 	{String} (monitor only) master server host
     *                 opts.port 	{String | Number} listen port for master or master port for monitor
     *                 opts.master  {Boolean} current service is master or monitor
     *                 opts.info 	{Object} more server info for current server, {id, serverType, host, port}
     * @api public
     */
    constructor(opts) {
        super();
        this.commands = {
            list: listCommand,
            enable: enableCommand,
            disable: disableCommand
        };
        this.authUser = utils.defaultAuthUser;
        this.port = opts.port;
        this.env = opts.env;
        this.values = {};
        this.master = opts.master;
        this.modules = {};
        if (this.master) {
            this.authUser = opts.authUser || utils.defaultAuthUser;
            this.authServer = opts.authServer || utils.defaultAuthServerMaster;
            this.agent = new masterAgent_1.MasterAgent(this, opts);
        }
        else {
            this.type = opts.type;
            this.id = opts.id;
            this.host = opts.host;
            this.authServer = opts.authServer || utils.defaultAuthServerMonitor;
            this.agent = new monitorAgent_1.MonitorAgent({
                consoleService: this,
                id: this.id,
                type: this.type,
                info: opts.info,
            });
        }
    }
    /**
     * start master or monitor
     *
     * @param {Function} cb callback function
     * @api public
     */
    start(cb) {
        if (this.master) {
            this.agent.listen(this.port, (err) => {
                if (!!err) {
                    utils.invokeCallback(cb, err);
                    return;
                }
                exportEvent(this, this.agent, "register");
                exportEvent(this, this.agent, "disconnect");
                exportEvent(this, this.agent, "reconnect");
                process.nextTick(function () {
                    utils.invokeCallback(cb);
                });
            });
        }
        else {
            logger.info("try to connect master: %j, %j, %j", this.type, this.host, this.port);
            this.agent.connect(this.port, this.host, cb);
            exportEvent(this, this.agent, "close");
        }
        exportEvent(this, this.agent, "error");
        for (let mid in this.modules) {
            this.enable(mid);
        }
    }
    /**
     * stop console modules and stop master server
     *
     * @api public
     */
    stop() {
        for (let mid in this.modules) {
            this.disable(mid);
        }
        this.agent.close();
    }
    /**
     * register a new adminConsole module
     *
     * @param {String} moduleId adminConsole id/name
     * @param {Object} module module object
     * @api public
     */
    register(moduleId, module) {
        this.modules[moduleId] = registerRecord(this, moduleId, module);
    }
    /**
     * enable adminConsole module
     *
     * @param {String} moduleId adminConsole id/name
     * @api public
     */
    enable(moduleId) {
        let record = this.modules[moduleId];
        if (record && !record.enable) {
            record.enable = true;
            addToSchedule(this, record);
            return true;
        }
        return false;
    }
    /**
     * disable adminConsole module
     *
     * @param {String} moduleId adminConsole id/name
     * @api public
     */
    disable(moduleId) {
        let record = this.modules[moduleId];
        if (record && record.enable) {
            record.enable = false;
            if (record.schedule && record.jobId) {
                schedule.cancelJob(record.jobId);
                schedule.jobId = null;
            }
            return true;
        }
        return false;
    }
    /**
     * call concrete module and handler(monitorHandler,masterHandler,clientHandler)
     *
     * @param {String} moduleId adminConsole id/name
     * @param {String} method handler
     * @param {Object} msg message
     * @param {Function} cb callback function
     * @api public
     */
    execute(moduleId, method, msg, cb) {
        let m = this.modules[moduleId];
        if (!m) {
            logger.error("unknown module: %j.", moduleId);
            cb("unknown moduleId:" + moduleId);
            return;
        }
        if (!m.enable) {
            logger.error("module %j is disable.", moduleId);
            cb("module " + moduleId + " is disable");
            return;
        }
        let module = m.module;
        if (!module || typeof module[method] !== "function") {
            logger.error("module %j dose not have a method called %j.", moduleId, method);
            cb("module " +
                moduleId +
                " dose not have a method called " +
                method);
            return;
        }
        let log = {
            action: "execute",
            moduleId: moduleId,
            method: method,
            msg: msg,
            error: null
        };
        let aclMsg = aclControl(this.agent, "execute", method, moduleId, msg);
        if (aclMsg !== 0 && aclMsg !== 1) {
            log["error"] = aclMsg;
            this.emit("admin-log", log, aclMsg);
            cb(new Error(aclMsg), null);
            return;
        }
        if (method === "clientHandler") {
            this.emit("admin-log", log);
        }
        module[method](this.agent, msg, cb);
    }
    command(command, moduleId, msg, cb) {
        let fun = this.commands[command];
        if (!fun || typeof fun !== "function") {
            cb("unknown command:" + command);
            return;
        }
        let log = {
            action: "command",
            moduleId: moduleId,
            msg: msg,
            error: null
        };
        let aclMsg = aclControl(this.agent, "command", null, moduleId, msg);
        if (aclMsg !== 0 && aclMsg !== 1) {
            log["error"] = aclMsg;
            this.emit("admin-log", log, aclMsg);
            cb(new Error(aclMsg), null);
            return;
        }
        this.emit("admin-log", log);
        fun(this, moduleId, msg, cb);
    }
    /**
     * set module data to a map
     *
     * @param {String} moduleId adminConsole id/name
     * @param {Object} value module data
     * @api public
     */
    set(moduleId, value) {
        this.values[moduleId] = value;
    }
    /**
     * get module data from map
     *
     * @param {String} moduleId adminConsole id/name
     * @api public
     */
    get(moduleId) {
        return this.values[moduleId];
    }
}
exports.ConsoleService = ConsoleService;
/**
 * register a module service
 *
 * @param {Object} service consoleService object
 * @param {String} moduleId adminConsole id/name
 * @param {Object} module module object
 * @api private
 */
function registerRecord(service, moduleId, module) {
    let record = {
        moduleId: moduleId,
        module: module,
        enable: false
    };
    if (module.type && module.interval) {
        if ((!service.master && record.module.type === "push") ||
            (service.master && record.module.type !== "push")) {
            // push for monitor or pull for master(default)
            record.delay = module.delay || 0;
            record.interval = module.interval || 1;
            // normalize the arguments
            if (record.delay < 0) {
                record.delay = 0;
            }
            if (record.interval < 0) {
                record.interval = 1;
            }
            record.interval = Math.ceil(record.interval);
            record.delay *= MS_OF_SECOND;
            record.interval *= MS_OF_SECOND;
            record.schedule = true;
        }
    }
    return record;
}
/**
 * schedule console module
 *
 * @param {Object} service consoleService object
 * @param {Object} record  module object
 * @api private
 */
function addToSchedule(service, record) {
    if (record && record.schedule) {
        record.jobId = schedule.scheduleJob({
            start: Date.now() + record.delay,
            period: record.interval
        }, doScheduleJob, {
            service: service,
            record: record
        });
    }
}
/**
 * run schedule job
 *
 * @param {Object} args argments
 * @api private
 */
function doScheduleJob(args) {
    let service = args.service;
    let record = args.record;
    if (!service || !record || !record.module || !record.enable) {
        return;
    }
    if (service.master) {
        record.module.masterHandler(service.agent, null, (err) => {
            logger.error("interval push should not have a callback.");
        });
    }
    else {
        record.module.monitorHandler(service.agent, null, (err) => {
            logger.error("interval push should not have a callback.");
        });
    }
}
/**
 * export closure function out
 *
 * @param {Function} outer outer function
 * @param {Function} inner inner function
 * @param {object} event
 * @api private
 */
function exportEvent(outer, inner, event) {
    inner.on(event, function () {
        let args = Array.prototype.slice.call(arguments, 0);
        args.unshift(event);
        outer.emit.apply(outer, args);
    });
}
/**
 * List current modules
 */
function listCommand(consoleService, moduleId, msg, cb) {
    let modules = consoleService.modules;
    let result = [];
    for (let moduleId in modules) {
        if (/^__\w+__$/.test(moduleId)) {
            continue;
        }
        result.push(moduleId);
    }
    cb(null, {
        modules: result
    });
}
/**
 * enable module in current server
 */
function enableCommand(consoleService, moduleId, msg, cb) {
    if (!moduleId) {
        logger.error("fail to enable admin module for " + moduleId);
        cb("empty moduleId");
        return;
    }
    let modules = consoleService.modules;
    if (!modules[moduleId]) {
        cb(null, protocol.PRO_FAIL);
        return;
    }
    if (consoleService.master) {
        consoleService.enable(moduleId);
        consoleService.agent.notifyCommand("enable", moduleId, msg);
        cb(null, protocol.PRO_OK);
    }
    else {
        consoleService.enable(moduleId);
        cb(null, protocol.PRO_OK);
    }
}
/**
 * disable module in current server
 */
function disableCommand(consoleService, moduleId, msg, cb) {
    if (!moduleId) {
        logger.error("fail to enable admin module for " + moduleId);
        cb("empty moduleId");
        return;
    }
    let modules = consoleService.modules;
    if (!modules[moduleId]) {
        cb(null, protocol.PRO_FAIL);
        return;
    }
    if (consoleService.master) {
        consoleService.disable(moduleId);
        consoleService.agent.notifyCommand("disable", moduleId, msg);
        cb(null, protocol.PRO_OK);
    }
    else {
        consoleService.disable(moduleId);
        cb(null, protocol.PRO_OK);
    }
}
function aclControl(agent, action, method, moduleId, msg) {
    if (action === "execute") {
        if (method !== "clientHandler" || moduleId !== "__console__") {
            return 0;
        }
        let signal = msg.signal;
        if (!signal ||
            !(signal === "stop" || signal === "add" || signal === "kill")) {
            return 0;
        }
    }
    let clientId = msg.clientId;
    if (!clientId) {
        return "Unknow clientId";
    }
    let _client = agent.getClientById(clientId);
    if (_client && _client.info && _client.info.level) {
        let level = _client.info.level;
        if (level > 1) {
            return "Command permission denied";
        }
    }
    else {
        return "Client info error";
    }
    return 1;
}
/**
 * Create master ConsoleService
 *
 * @param {Object} opts construct parameter
 *                      opts.port {String | Number} listen port for master console
 */
function createMasterConsole(opts) {
    opts = opts || {};
    opts.master = true;
    return new ConsoleService(opts);
}
exports.createMasterConsole = createMasterConsole;
/**
 * Create monitor ConsoleService
 *
 * @param {Object} opts construct parameter
 *                      opts.type {String} server type, 'master', 'connector', etc.
 *                      opts.id {String} server id
 *                      opts.host {String} master server host
 *                      opts.port {String | Number} master port
 */
function createMonitorConsole(opts) {
    return new ConsoleService(opts);
}
exports.createMonitorConsole = createMonitorConsole;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc29sZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb25zb2xlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxTQUFTLENBQ2hELGNBQWMsRUFDZCxnQkFBZ0IsQ0FDaEIsQ0FBQztBQUNGLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQzdDLDRDQUE2QztBQUM3QyxzQ0FBdUM7QUFFdkMsbUNBQXNDO0FBQ3RDLHlEQUF3RTtBQUN4RSxzREFBb0U7QUFHcEUsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDO0FBYzFCLG9CQUE0QixTQUFRLHFCQUFZO0lBa0IvQzs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsWUFBWSxJQUF3QjtRQUNuQyxLQUFLLEVBQUUsQ0FBQztRQTNCRCxhQUFRLEdBQUc7WUFDbEIsSUFBSSxFQUFFLFdBQVc7WUFDakIsTUFBTSxFQUFFLGFBQWE7WUFDckIsT0FBTyxFQUFFLGNBQWM7U0FDdkIsQ0FBQztRQUVNLGFBQVEsR0FBSSxLQUFLLENBQUMsZUFBZSxDQUFDO1FBc0J6QyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDdEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUUxQixJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUVsQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNqQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQztZQUN2RCxJQUFJLENBQUMsVUFBVSxH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QWlCLENBQUM7SUFDMUIsQ0FBQztJQUVELElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUMsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ25ELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQy9CLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2YsTUFBTSxDQUFDLDJCQUEyQixDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDUCxNQUFNLENBQUMsbUJBQW1CLENBQUM7SUFDNUIsQ0FBQztJQUNELE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDVixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCw2QkFBb0MsSUFBUztJQUM1QyxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztJQUNsQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNuQixNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUpELGtEQUlDO0FBRUQ7Ozs7Ozs7O0dBUUc7QUFDSCw4QkFBcUMsSUFBUztJQUM3QyxNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUZELG9EQUVDIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbG9nZ2VyID0gcmVxdWlyZShcInBvbWVsby1sb2dnZXJcIikuZ2V0TG9nZ2VyKFxuXHRcInBvbWVsby1hZG1pblwiLFxuXHRcIkNvbnNvbGVTZXJ2aWNlXCJcbik7XG5jb25zdCBzY2hlZHVsZSA9IHJlcXVpcmUoXCJwb21lbG8tc2NoZWR1bGVyXCIpO1xuaW1wb3J0IHByb3RvY29sID0gcmVxdWlyZShcIi4vdXRpbC9wcm90b2NvbFwiKTtcbmltcG9ydCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWwvdXRpbHNcIik7XG5pbXBvcnQgdXRpbCA9IHJlcXVpcmUoXCJ1dGlsXCIpO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSBcImV2ZW50c1wiO1xuaW1wb3J0IHsgTW9uaXRvckFnZW50LCBNb25pdG9yQWdlbnRPcHRzIH0gZnJvbSAnLi9tb25pdG9yL21vbml0b3JBZ2VudCc7XG5pbXBvcnQgeyBNYXN0ZXJBZ2VudCwgTWFzdGVyQWdlbnRPcHRzIH0gZnJvbSBcIi4vbWFzdGVyL21hc3RlckFnZW50XCI7XG5pbXBvcnQgeyBNb2R1bGVSZWNvcmQsIFNlcnZlckluZm8gfSBmcm9tICcuLi9pbmRleCc7XG5cbmNvbnN0IE1TX09GX1NFQ09ORCA9IDEwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29uc29sZVNlcnZpY2VPcHRzIHtcblx0aWQ/OnN0cmluZztcblx0dHlwZT86c3RyaW5nO1xuXHRlbnY/OnN0cmluZztcbiAgICBtYXN0ZXI/OmJvb2xlYW47XG4gICAgaG9zdD86c3RyaW5nO1xuICAgIHBvcnQ6bnVtYmVyO1xuXHRpbmZvPzpTZXJ2ZXJJbmZvO1xuXHRhdXRoU2VydmVyPzoobXNnOiBhbnksIGVudjogc3RyaW5nLCBjYjogRnVuY3Rpb24pPT52b2lkO1xuXHRhdXRoVXNlcj86KG1zZzogYW55LCBlbnY6IHN0cmluZywgY2I6IEZ1bmN0aW9uKT0+dm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIENvbnNvbGVTZXJ2aWNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcblx0cHJpdmF0ZSBwb3J0OiBudW1iZXI7XG5cdHByaXZhdGUgZW52Pzogc3RyaW5nO1xuXHRwcml2YXRlIHZhbHVlczogeyBbaWR4OiBzdHJpbmddOiBhbnkgfTtcblx0cmVhZG9ubHkgbWFzdGVyPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbW9kdWxlczogeyBbaWR4OiBzdHJpbmddOiBNb2R1bGVSZWNvcmQgfTtcblx0cHJpdmF0ZSBjb21tYW5kcyA9IHtcblx0XHRsaXN0OiBsaXN0Q29tbWFuZCxcblx0XHRlbmFibGU6IGVuYWJsZUNvbW1hbmQsXG5cdFx0ZGlzYWJsZTogZGlzYWJsZUNvbW1hbmRcblx0fTtcblx0cHJpdmF0ZSBhdXRoU2VydmVyOiAobXNnOiBhbnksIGVudjogc3RyaW5nLCBjYjogRnVuY3Rpb24pID0+IHZvaWQ7XG5cdHByaXZhdGUgYXV0aFVzZXI/ID0gdXRpbHMuZGVmYXVsdEF1dGhVc2VyO1xuXHRyZWFkb25seSBhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQ7XG5cblx0cHJpdmF0ZSB0eXBlPzogc3RyaW5nO1xuXHRwcml2YXRlIGlkPzogc3RyaW5nO1xuXHRwcml2YXRlIGhvc3Q/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBDb25zb2xlU2VydmljZSBDb25zdHJ1Y3RvclxuXHQgKlxuXHQgKiBAY2xhc3MgQ29uc29sZVNlcnZpY2Vcblx0ICogQGNvbnN0cnVjdG9yXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIGNvbnN0cnVjdCBwYXJhbWV0ZXJcblx0ICogICAgICAgICAgICAgICAgIG9wdHMudHlwZSBcdHtTdHJpbmd9IHNlcnZlciB0eXBlLCAnbWFzdGVyJywgJ2Nvbm5lY3RvcicsIGV0Yy5cblx0ICogICAgICAgICAgICAgICAgIG9wdHMuaWQgXHRcdHtTdHJpbmd9IHNlcnZlciBpZFxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5ob3N0IFx0e1N0cmluZ30gKG1vbml0b3Igb25seSkgbWFzdGVyIHNlcnZlciBob3N0XG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLnBvcnQgXHR7U3RyaW5nIHwgTnVtYmVyfSBsaXN0ZW4gcG9ydCBmb3IgbWFzdGVyIG9yIG1hc3RlciBwb3J0IGZvciBtb25pdG9yXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLm1hc3RlciAge0Jvb2xlYW59IGN1cnJlbnQgc2VydmljZSBpcyBtYXN0ZXIgb3IgbW9uaXRvclxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5pbmZvIFx0e09iamVjdH0gbW9yZSBzZXJ2ZXIgaW5mbyBmb3IgY3VycmVudCBzZXJ2ZXIsIHtpZCwgc2VydmVyVHlwZSwgaG9zdCwgcG9ydH1cblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdGNvbnN0cnVjdG9yKG9wdHM6IENvbnNvbGVTZXJ2aWNlT3B0cykge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5wb3J0ID0gb3B0cy5wb3J0O1xuXHRcdHRoaXMuZW52ID0gb3B0cy5lbnY7XG5cdFx0dGhpcy52YWx1ZXMgPSB7fTtcblx0XHR0aGlzLm1hc3RlciA9IG9wdHMubWFzdGVyO1xuXG5cdFx0dGhpcy5tb2R1bGVzID0ge307XG5cblx0XHRpZiAodGhpcy5tYXN0ZXIpIHtcblx0XHRcdHRoaXMuYXV0aFVzZXIgPSBvcHRzLmF1dGhVc2VyIHx8IHV0aWxzLmRlZmF1bHRBdXRoVXNlcjtcblx0XHRcdHRoaXMuYXV0aFNlcnZlciA9IG9wdHMuYXV0aFNlcnZlciB8fCB1dGlscy5kZWZhdWx0QXV0aFNlcnZlck1hc3Rlcjtcblx0XHRcdHRoaXMuYWdlbnQgPSA8YW55Pm5ldyBNYXN0ZXJBZ2VudCh0aGlzLCBvcHRzIGFzIE1hc3RlckFnZW50T3B0cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHlwZSA9IG9wdHMudHlwZTtcblx0XHRcdHRoaXMuaWQgPSBvcHRzLmlkO1xuXHRcdFx0dGhpcy5ob3N0ID0gb3B0cy5ob3N0O1xuXHRcdFx0dGhpcy5hdXRoU2VydmVyID0gb3B0cy5hdXRoU2VydmVyIHx8IHV0aWxzLmRlZmF1bHRBdXRoU2VydmVyTW9uaXRvcjtcblx0XHRcdHRoaXMuYWdlbnQgPSA8YW55Pm5ldyBNb25pdG9yQWdlbnQoe1xuXHRcdFx0XHRjb25zb2xlU2VydmljZTogdGhpcyxcblx0XHRcdFx0aWQ6IHRoaXMuaWQgYXMgc3RyaW5nLFxuXHRcdFx0XHR0eXBlOiB0aGlzLnR5cGUgYXMgc3RyaW5nLFxuXHRcdFx0XHRpbmZvOiBvcHRzLmluZm8gYXMgU2VydmVySW5mbyxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBzdGFydCBtYXN0ZXIgb3IgbW9uaXRvclxuXHQgKlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYiBjYWxsYmFjayBmdW5jdGlvblxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0c3RhcnQoY2I6IEZ1bmN0aW9uKSB7XG5cdFx0aWYgKHRoaXMubWFzdGVyKSB7XG5cdFx0XHR0aGlzLmFnZW50Lmxpc3Rlbih0aGlzLnBvcnQsIChlcnI6IGFueSkgPT4ge1xuXHRcdFx0XHRpZiAoISFlcnIpIHtcblx0XHRcdFx0XHR1dGlscy5pbnZva2VDYWxsYmFjayhjYiwgZXJyKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRleHBvcnRFdmVudCh0aGlzLCB0aGlzLmFnZW50LCBcInJlZ2lzdGVyXCIpO1xuXHRcdFx0XHRleHBvcnRFdmVudCh0aGlzLCB0aGlzLmFnZW50LCBcImRpc2Nvbm5lY3RcIik7XG5cdFx0XHRcdGV4cG9ydEV2ZW50KHRoaXMsIHRoaXMuYWdlbnQsIFwicmVjb25uZWN0XCIpO1xuXHRcdFx0XHRwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHV0aWxzLmludm9rZUNhbGxiYWNrKGNiKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9nZ2VyLmluZm8oXG5cdFx0XHRcdFwidHJ5IHRvIGNvbm5lY3QgbWFzdGVyOiAlaiwgJWosICVqXCIsXG5cdFx0XHRcdHRoaXMudHlwZSxcblx0XHRcdFx0dGhpcy5ob3N0LFxuXHRcdFx0XHR0aGlzLnBvcnRcblx0XHRcdCk7XG5cdFx0XHR0aGlzLmFnZW50LmNvbm5lY3QodGhpcy5wb3J0LCB0aGlzLmhvc3QhLCBjYik7XG5cdFx0XHRleHBvcnRFdmVudCh0aGlzLCB0aGlzLmFnZW50LCBcImNsb3NlXCIpO1xuXHRcdH1cblxuXHRcdGV4cG9ydEV2ZW50KHRoaXMsIHRoaXMuYWdlbnQsIFwiZXJyb3JcIik7XG5cblx0XHRmb3IgKGxldCBtaWQgaW4gdGhpcy5tb2R1bGVzKSB7XG5cdFx0XHR0aGlzLmVuYWJsZShtaWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBzdG9wIGNvbnNvbGUgbW9kdWxlcyBhbmQgc3RvcCBtYXN0ZXIgc2VydmVyXG5cdCAqXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRzdG9wKCkge1xuXHRcdGZvciAobGV0IG1pZCBpbiB0aGlzLm1vZHVsZXMpIHtcblx0XHRcdHRoaXMuZGlzYWJsZShtaWQpO1xuXHRcdH1cblx0XHR0aGlzLmFnZW50LmNsb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogcmVnaXN0ZXIgYSBuZXcgYWRtaW5Db25zb2xlIG1vZHVsZVxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgYWRtaW5Db25zb2xlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IG1vZHVsZSBtb2R1bGUgb2JqZWN0XG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRyZWdpc3Rlcihtb2R1bGVJZDogc3RyaW5nLCBtb2R1bGU6IGFueSkge1xuXHRcdHRoaXMubW9kdWxlc1ttb2R1bGVJZF0gPSByZWdpc3RlclJlY29yZCh0aGlzLCBtb2R1bGVJZCwgbW9kdWxlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBlbmFibGUgYWRtaW5Db25zb2xlIG1vZHVsZVxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgYWRtaW5Db25zb2xlIGlkL25hbWVcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdGVuYWJsZShtb2R1bGVJZDogc3RyaW5nKSB7XG5cdFx0bGV0IHJlY29yZCA9IHRoaXMubW9kdWxlc1ttb2R1bGVJZF07XG5cdFx0aWYgKHJlY29yZCAmJiAhcmVjb3JkLmVuYWJsZSkge1xuXHRcdFx0cmVjb3JkLmVuYWJsZSA9IHRydWU7XG5cdFx0XHRhZGRUb1NjaGVkdWxlKHRoaXMsIHJlY29yZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIGRpc2FibGUgYWRtaW5Db25zb2xlIG1vZHVsZVxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgYWRtaW5Db25zb2xlIGlkL25hbWVcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdGRpc2FibGUobW9kdWxlSWQ6IHN0cmluZykge1xuXHRcdGxldCByZWNvcmQgPSB0aGlzLm1vZHVsZXNbbW9kdWxlSWRdO1xuXHRcdGlmIChyZWNvcmQgJiYgcmVjb3JkLmVuYWJsZSkge1xuXHRcdFx0cmVjb3JkLmVuYWJsZSA9IGZhbHNlO1xuXHRcdFx0aWYgKHJlY29yZC5zY2hlZHVsZSAmJiByZWNvcmQuam9iSWQpIHtcblx0XHRcdFx0c2NoZWR1bGUuY2FuY2VsSm9iKHJlY29yZC5qb2JJZCk7XG5cdFx0XHRcdHNjaGVkdWxlLmpvYklkID0gbnVsbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogY2FsbCBjb25jcmV0ZSBtb2R1bGUgYW5kIGhhbmRsZXIobW9uaXRvckhhbmRsZXIsbWFzdGVySGFuZGxlcixjbGllbnRIYW5kbGVyKVxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgYWRtaW5Db25zb2xlIGlkL25hbWVcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1ldGhvZCBoYW5kbGVyXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2cgbWVzc2FnZVxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYiBjYWxsYmFjayBmdW5jdGlvblxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0ZXhlY3V0ZShtb2R1bGVJZDogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgbXNnOiBhbnksIGNiOiBGdW5jdGlvbikge1xuXHRcdGxldCBtID0gdGhpcy5tb2R1bGVzW21vZHVsZUlkXTtcblx0XHRpZiAoIW0pIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcInVua25vd24gbW9kdWxlOiAlai5cIiwgbW9kdWxlSWQpO1xuXHRcdFx0Y2IoXCJ1bmtub3duIG1vZHVsZUlkOlwiICsgbW9kdWxlSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghbS5lbmFibGUpIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcIm1vZHVsZSAlaiBpcyBkaXNhYmxlLlwiLCBtb2R1bGVJZCk7XG5cdFx0XHRjYihcIm1vZHVsZSBcIiArIG1vZHVsZUlkICsgXCIgaXMgZGlzYWJsZVwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbW9kdWxlID0gbS5tb2R1bGU7XG5cdFx0aWYgKCFtb2R1bGUgfHwgdHlwZW9mIG1vZHVsZVttZXRob2RdICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcblx0XHRcdFx0XCJtb2R1bGUgJWogZG9zZSBub3QgaGF2ZSBhIG1ldGhvZCBjYWxsZWQgJWouXCIsXG5cdFx0XHRcdG1vZHVsZUlkLFxuXHRcdFx0XHRtZXRob2Rcblx0XHRcdCk7XG5cdFx0XHRjYihcblx0XHRcdFx0XCJtb2R1bGUgXCIgK1xuXHRcdFx0XHRcdG1vZHVsZUlkICtcblx0XHRcdFx0XHRcIiBkb3NlIG5vdCBoYXZlIGEgbWV0aG9kIGNhbGxlZCBcIiArXG5cdFx0XHRcdFx0bWV0aG9kXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBsb2cgPSB7XG5cdFx0XHRhY3Rpb246IFwiZXhlY3V0ZVwiLFxuXHRcdFx0bW9kdWxlSWQ6IG1vZHVsZUlkLFxuXHRcdFx0bWV0aG9kOiBtZXRob2QsXG5cdFx0XHRtc2c6IG1zZyxcblx0XHRcdGVycm9yOiBudWxsIGFzIGFueVxuXHRcdH07XG5cblx0XHRsZXQgYWNsTXNnID0gYWNsQ29udHJvbCh0aGlzLmFnZW50LCBcImV4ZWN1dGVcIiwgbWV0aG9kLCBtb2R1bGVJZCwgbXNnKTtcblx0XHRpZiAoYWNsTXNnICE9PSAwICYmIGFjbE1zZyAhPT0gMSkge1xuXHRcdFx0bG9nW1wiZXJyb3JcIl0gPSBhY2xNc2c7XG5cdFx0XHR0aGlzLmVtaXQoXCJhZG1pbi1sb2dcIiwgbG9nLCBhY2xNc2cpO1xuXHRcdFx0Y2IobmV3IEVycm9yKGFjbE1zZyBhcyBzdHJpbmcpLCBudWxsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobWV0aG9kID09PSBcImNsaWVudEhhbmRsZXJcIikge1xuXHRcdFx0dGhpcy5lbWl0KFwiYWRtaW4tbG9nXCIsIGxvZyk7XG5cdFx0fVxuXG5cdFx0bW9kdWxlW21ldGhvZF0odGhpcy5hZ2VudCwgbXNnLCBjYik7XG5cdH1cblxuXHRjb21tYW5kKGNvbW1hbmQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnksIGNiOiBGdW5jdGlvbikge1xuXHRcdGxldCBmdW46IEZ1bmN0aW9uID0gKDxhbnk+dGhpcy5jb21tYW5kcylbY29tbWFuZF07XG5cdFx0aWYgKCFmdW4gfHwgdHlwZW9mIGZ1biAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRjYihcInVua25vd24gY29tbWFuZDpcIiArIGNvbW1hbmQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBsb2cgPSB7XG5cdFx0XHRhY3Rpb246IFwiY29tbWFuZFwiLFxuXHRcdFx0bW9kdWxlSWQ6IG1vZHVsZUlkLFxuXHRcdFx0bXNnOiBtc2csXG5cdFx0XHRlcnJvcjogbnVsbCBhcyBhbnlcblx0XHR9O1xuXG5cdFx0bGV0IGFjbE1zZyA9IGFjbENvbnRyb2wodGhpcy5hZ2VudCwgXCJjb21tYW5kXCIsIG51bGwhLCBtb2R1bGVJZCwgbXNnKTtcblx0XHRpZiAoYWNsTXNnICE9PSAwICYmIGFjbE1zZyAhPT0gMSkge1xuXHRcdFx0bG9nW1wiZXJyb3JcIl0gPSBhY2xNc2c7XG5cdFx0XHR0aGlzLmVtaXQoXCJhZG1pbi1sb2dcIiwgbG9nLCBhY2xNc2cpO1xuXHRcdFx0Y2IobmV3IEVycm9yKGFjbE1zZyBhcyBzdHJpbmcpLCBudWxsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVtaXQoXCJhZG1pbi1sb2dcIiwgbG9nKTtcblx0XHRmdW4odGhpcywgbW9kdWxlSWQsIG1zZywgY2IpO1xuXHR9XG5cblx0LyoqXG5cdCAqIHNldCBtb2R1bGUgZGF0YSB0byBhIG1hcFxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgYWRtaW5Db25zb2xlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IHZhbHVlIG1vZHVsZSBkYXRhXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXG5cdHNldChtb2R1bGVJZDogc3RyaW5nLCB2YWx1ZTogYW55KSB7XG5cdFx0dGhpcy52YWx1ZXNbbW9kdWxlSWRdID0gdmFsdWU7XG5cdH1cblxuXHQvKipcblx0ICogZ2V0IG1vZHVsZSBkYXRhIGZyb20gbWFwXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBhZG1pbkNvbnNvbGUgaWQvbmFtZVxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0Z2V0KG1vZHVsZUlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZXNbbW9kdWxlSWRdO1xuXHR9XG59XG4vKipcbiAqIHJlZ2lzdGVyIGEgbW9kdWxlIHNlcnZpY2VcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gc2VydmljZSBjb25zb2xlU2VydmljZSBvYmplY3RcbiAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBhZG1pbkNvbnNvbGUgaWQvbmFtZVxuICogQHBhcmFtIHtPYmplY3R9IG1vZHVsZSBtb2R1bGUgb2JqZWN0XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gcmVnaXN0ZXJSZWNvcmQoXG5cdHNlcnZpY2U6IENvbnNvbGVTZXJ2aWNlLFxuXHRtb2R1bGVJZDogc3RyaW5nLFxuXHRtb2R1bGU6IGFueVxuKSB7XG5cdGxldCByZWNvcmQ6IE1vZHVsZVJlY29yZCA9IHtcblx0XHRtb2R1bGVJZDogbW9kdWxlSWQsXG5cdFx0bW9kdWxlOiBtb2R1bGUsXG5cdFx0ZW5hYmxlOiBmYWxzZVxuXHR9O1xuXG5cdGlmIChtb2R1bGUudHlwZSAmJiBtb2R1bGUuaW50ZXJ2YWwpIHtcblx0XHRpZiAoXG5cdFx0XHQoIXNlcnZpY2UubWFzdGVyICYmIHJlY29yZC5tb2R1bGUudHlwZSA9PT0gXCJwdXNoXCIpIHx8XG5cdFx0XHQoc2VydmljZS5tYXN0ZXIgJiYgcmVjb3JkLm1vZHVsZS50eXBlICE9PSBcInB1c2hcIilcblx0XHQpIHtcblx0XHRcdC8vIHB1c2ggZm9yIG1vbml0b3Igb3IgcHVsbCBmb3IgbWFzdGVyKGRlZmF1bHQpXG5cdFx0XHRyZWNvcmQuZGVsYXkgPSBtb2R1bGUuZGVsYXkgfHwgMDtcblx0XHRcdHJlY29yZC5pbnRlcnZhbCA9IG1vZHVsZS5pbnRlcnZhbCB8fCAxO1xuXHRcdFx0Ly8gbm9ybWFsaXplIHRoZSBhcmd1bWVudHNcblx0XHRcdGlmIChyZWNvcmQuZGVsYXkhIDwgMCkge1xuXHRcdFx0XHRyZWNvcmQuZGVsYXkgPSAwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY29yZC5pbnRlcnZhbCEgPCAwKSB7XG5cdFx0XHRcdHJlY29yZC5pbnRlcnZhbCA9IDE7XG5cdFx0XHR9XG5cdFx0XHRyZWNvcmQuaW50ZXJ2YWwgPSBNYXRoLmNlaWwocmVjb3JkLmludGVydmFsISk7XG5cdFx0XHRyZWNvcmQuZGVsYXkhICo9IE1TX09GX1NFQ09ORDtcblx0XHRcdHJlY29yZC5pbnRlcnZhbCAqPSBNU19PRl9TRUNPTkQ7XG5cdFx0XHRyZWNvcmQuc2NoZWR1bGUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZWNvcmQ7XG59XG5cbi8qKlxuICogc2NoZWR1bGUgY29uc29sZSBtb2R1bGVcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gc2VydmljZSBjb25zb2xlU2VydmljZSBvYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSByZWNvcmQgIG1vZHVsZSBvYmplY3RcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBhZGRUb1NjaGVkdWxlKHNlcnZpY2U6IENvbnNvbGVTZXJ2aWNlLCByZWNvcmQ6IE1vZHVsZVJlY29yZCkge1xuXHRpZiAocmVjb3JkICYmIHJlY29yZC5zY2hlZHVsZSkge1xuXHRcdHJlY29yZC5qb2JJZCA9IHNjaGVkdWxlLnNjaGVkdWxlSm9iKFxuXHRcdFx0e1xuXHRcdFx0XHRzdGFydDogRGF0ZS5ub3coKSArIHJlY29yZC5kZWxheSEsXG5cdFx0XHRcdHBlcmlvZDogcmVjb3JkLmludGVydmFsXG5cdFx0XHR9LFxuXHRcdFx0ZG9TY2hlZHVsZUpvYixcblx0XHRcdHtcblx0XHRcdFx0c2VydmljZTogc2VydmljZSxcblx0XHRcdFx0cmVjb3JkOiByZWNvcmRcblx0XHRcdH1cblx0XHQpO1xuXHR9XG59XG5cbi8qKlxuICogcnVuIHNjaGVkdWxlIGpvYlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhcmdzIGFyZ21lbnRzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gZG9TY2hlZHVsZUpvYihhcmdzOiBhbnkpIHtcblx0bGV0IHNlcnZpY2UgPSBhcmdzLnNlcnZpY2U7XG5cdGxldCByZWNvcmQgPSBhcmdzLnJlY29yZDtcblx0aWYgKCFzZXJ2aWNlIHx8ICFyZWNvcmQgfHwgIXJlY29yZC5tb2R1bGUgfHwgIXJlY29yZC5lbmFibGUpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoc2VydmljZS5tYXN0ZXIpIHtcblx0XHRyZWNvcmQubW9kdWxlLm1hc3RlckhhbmRsZXIoc2VydmljZS5hZ2VudCwgbnVsbCwgKGVycjogYW55KSA9PiB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXCJpbnRlcnZhbCBwdXNoIHNob3VsZCBub3QgaGF2ZSBhIGNhbGxiYWNrLlwiKTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRyZWNvcmQubW9kdWxlLm1vbml0b3JIYW5kbGVyKHNlcnZpY2UuYWdlbnQsIG51bGwsIChlcnI6IGFueSkgPT4ge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFwiaW50ZXJ2YWwgcHVzaCBzaG91bGQgbm90IGhhdmUgYSBjYWxsYmFjay5cIik7XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBleHBvcnQgY2xvc3VyZSBmdW5jdGlvbiBvdXRcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvdXRlciBvdXRlciBmdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gaW5uZXIgaW5uZXIgZnVuY3Rpb25cbiAqIEBwYXJhbSB7b2JqZWN0fSBldmVudFxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGV4cG9ydEV2ZW50KFxuXHRvdXRlcjogQ29uc29sZVNlcnZpY2UsXG5cdGlubmVyOiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0ZXZlbnQ6IHN0cmluZ1xuKSB7XG5cdGlubmVyLm9uKGV2ZW50LCBmdW5jdGlvbigpIHtcblx0XHRsZXQgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG5cdFx0YXJncy51bnNoaWZ0KGV2ZW50KTtcblx0XHRvdXRlci5lbWl0LmFwcGx5KG91dGVyLCBhcmdzKTtcblx0fSk7XG59XG5cbi8qKlxuICogTGlzdCBjdXJyZW50IG1vZHVsZXNcbiAqL1xuZnVuY3Rpb24gbGlzdENvbW1hbmQoXG5cdGNvbnNvbGVTZXJ2aWNlOiBDb25zb2xlU2VydmljZSxcblx0bW9kdWxlSWQ6IHN0cmluZyxcblx0bXNnOiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7XG5cdGxldCBtb2R1bGVzID0gY29uc29sZVNlcnZpY2UubW9kdWxlcztcblxuXHRsZXQgcmVzdWx0ID0gW107XG5cdGZvciAobGV0IG1vZHVsZUlkIGluIG1vZHVsZXMpIHtcblx0XHRpZiAoL15fX1xcdytfXyQvLnRlc3QobW9kdWxlSWQpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaChtb2R1bGVJZCk7XG5cdH1cblxuXHRjYihudWxsLCB7XG5cdFx0bW9kdWxlczogcmVzdWx0XG5cdH0pO1xufVxuXG4vKipcbiAqIGVuYWJsZSBtb2R1bGUgaW4gY3VycmVudCBzZXJ2ZXJcbiAqL1xuZnVuY3Rpb24gZW5hYmxlQ29tbWFuZChcblx0Y29uc29sZVNlcnZpY2U6IENvbnNvbGVTZXJ2aWNlLFxuXHRtb2R1bGVJZDogc3RyaW5nLFxuXHRtc2c6IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0aWYgKCFtb2R1bGVJZCkge1xuXHRcdGxvZ2dlci5lcnJvcihcImZhaWwgdG8gZW5hYmxlIGFkbWluIG1vZHVsZSBmb3IgXCIgKyBtb2R1bGVJZCk7XG5cdFx0Y2IoXCJlbXB0eSBtb2R1bGVJZFwiKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRsZXQgbW9kdWxlcyA9IGNvbnNvbGVTZXJ2aWNlLm1vZHVsZXM7XG5cdGlmICghbW9kdWxlc1ttb2R1bGVJZF0pIHtcblx0XHRjYihudWxsLCBwcm90b2NvbC5QUk9fRkFJTCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKGNvbnNvbGVTZXJ2aWNlLm1hc3Rlcikge1xuXHRcdGNvbnNvbGVTZXJ2aWNlLmVuYWJsZShtb2R1bGVJZCk7XG5cdFx0Y29uc29sZVNlcnZpY2UuYWdlbnQubm90aWZ5Q29tbWFuZChcImVuYWJsZVwiLCBtb2R1bGVJZCwgbXNnKTtcblx0XHRjYihudWxsLCBwcm90b2NvbC5QUk9fT0spO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnNvbGVTZXJ2aWNlLmVuYWJsZShtb2R1bGVJZCk7XG5cdFx0Y2IobnVsbCwgcHJvdG9jb2wuUFJPX09LKTtcblx0fVxufVxuXG4vKipcbiAqIGRpc2FibGUgbW9kdWxlIGluIGN1cnJlbnQgc2VydmVyXG4gKi9cbmZ1bmN0aW9uIGRpc2FibGVDb21tYW5kKFxuXHRjb25zb2xlU2VydmljZTogQ29uc29sZVNlcnZpY2UsXG5cdG1vZHVsZUlkOiBzdHJpbmcsXG5cdG1zZzogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRpZiAoIW1vZHVsZUlkKSB7XG5cdFx0bG9nZ2VyLmVycm9yKFwiZmFpbCB0byBlbmFibGUgYWRtaW4gbW9kdWxlIGZvciBcIiArIG1vZHVsZUlkKTtcblx0XHRjYihcImVtcHR5IG1vZHVsZUlkXCIpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGxldCBtb2R1bGVzID0gY29uc29sZVNlcnZpY2UubW9kdWxlcztcblx0aWYgKCFtb2R1bGVzW21vZHVsZUlkXSkge1xuXHRcdGNiKG51bGwsIHByb3RvY29sLlBST19GQUlMKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoY29uc29sZVNlcnZpY2UubWFzdGVyKSB7XG5cdFx0Y29uc29sZVNlcnZpY2UuZGlzYWJsZShtb2R1bGVJZCk7XG5cdFx0Y29uc29sZVNlcnZpY2UuYWdlbnQubm90aWZ5Q29tbWFuZChcImRpc2FibGVcIiwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0Y2IobnVsbCwgcHJvdG9jb2wuUFJPX09LKTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlU2VydmljZS5kaXNhYmxlKG1vZHVsZUlkKTtcblx0XHRjYihudWxsLCBwcm90b2NvbC5QUk9fT0spO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFjbENvbnRyb2woXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCAmIE1vbml0b3JBZ2VudCxcblx0YWN0aW9uOiBzdHJpbmcsXG5cdG1ldGhvZDogc3RyaW5nLFxuXHRtb2R1bGVJZDogc3RyaW5nLFxuXHRtc2c6IGFueVxuKSB7XG5cdGlmIChhY3Rpb24gPT09IFwiZXhlY3V0ZVwiKSB7XG5cdFx0aWYgKG1ldGhvZCAhPT0gXCJjbGllbnRIYW5kbGVyXCIgfHwgbW9kdWxlSWQgIT09IFwiX19jb25zb2xlX19cIikge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0bGV0IHNpZ25hbCA9IG1zZy5zaWduYWw7XG5cdFx0aWYgKFxuXHRcdFx0IXNpZ25hbCB8fFxuXHRcdFx0IShzaWduYWwgPT09IFwic3RvcFwiIHx8IHNpZ25hbCA9PT0gXCJhZGRcIiB8fCBzaWduYWwgPT09IFwia2lsbFwiKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGNsaWVudElkID0gbXNnLmNsaWVudElkO1xuXHRpZiAoIWNsaWVudElkKSB7XG5cdFx0cmV0dXJuIFwiVW5rbm93IGNsaWVudElkXCI7XG5cdH1cblxuXHRsZXQgX2NsaWVudCA9IGFnZW50LmdldENsaWVudEJ5SWQoY2xpZW50SWQpO1xuXHRpZiAoX2NsaWVudCAmJiBfY2xpZW50LmluZm8gJiYgX2NsaWVudC5pbmZvLmxldmVsKSB7XG5cdFx0bGV0IGxldmVsID0gX2NsaWVudC5pbmZvLmxldmVsO1xuXHRcdGlmIChsZXZlbCA+IDEpIHtcblx0XHRcdHJldHVybiBcIkNvbW1hbmQgcGVybWlzc2lvbiBkZW5pZWRcIjtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIFwiQ2xpZW50IGluZm8gZXJyb3JcIjtcblx0fVxuXHRyZXR1cm4gMTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgbWFzdGVyIENvbnNvbGVTZXJ2aWNlXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgY29uc3RydWN0IHBhcmFtZXRlclxuICogICAgICAgICAgICAgICAgICAgICAgb3B0cy5wb3J0IHtTdHJpbmcgfCBOdW1iZXJ9IGxpc3RlbiBwb3J0IGZvciBtYXN0ZXIgY29uc29sZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWFzdGVyQ29uc29sZShvcHRzOiBhbnkpIHtcblx0b3B0cyA9IG9wdHMgfHwge307XG5cdG9wdHMubWFzdGVyID0gdHJ1ZTtcblx0cmV0dXJuIG5ldyBDb25zb2xlU2VydmljZShvcHRzKTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgbW9uaXRvciBDb25zb2xlU2VydmljZVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIGNvbnN0cnVjdCBwYXJhbWV0ZXJcbiAqICAgICAgICAgICAgICAgICAgICAgIG9wdHMudHlwZSB7U3RyaW5nfSBzZXJ2ZXIgdHlwZSwgJ21hc3RlcicsICdjb25uZWN0b3InLCBldGMuXG4gKiAgICAgICAgICAgICAgICAgICAgICBvcHRzLmlkIHtTdHJpbmd9IHNlcnZlciBpZFxuICogICAgICAgICAgICAgICAgICAgICAgb3B0cy5ob3N0IHtTdHJpbmd9IG1hc3RlciBzZXJ2ZXIgaG9zdFxuICogICAgICAgICAgICAgICAgICAgICAgb3B0cy5wb3J0IHtTdHJpbmcgfCBOdW1iZXJ9IG1hc3RlciBwb3J0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb25pdG9yQ29uc29sZShvcHRzOiBhbnkpIHtcblx0cmV0dXJuIG5ldyBDb25zb2xlU2VydmljZShvcHRzKTtcbn1cbiJdfQ==