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
                info: opts.info
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc29sZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb25zb2xlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxTQUFTLENBQ2hELGNBQWMsRUFDZCxnQkFBZ0IsQ0FDaEIsQ0FBQztBQUNGLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQzdDLDRDQUE2QztBQUM3QyxzQ0FBdUM7QUFFdkMsbUNBQXNDO0FBQ3RDLHlEQUFzRDtBQUN0RCxzREFBbUQ7QUFHbkQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDO0FBRTFCLG9CQUE0QixTQUFRLHFCQUFZO0lBa0IvQzs7Ozs7Ozs7Ozs7OztPQWFHO0lBQ0gsWUFBWSxJQUFTO1FBQ3BCLEtBQUssRUFBRSxDQUFDO1FBM0JELGFBQVEsR0FBRztZQUNsQixJQUFJLEVBQUUsV0FBVztZQUNqQixNQUFNLEVBQUUsYUFBYTtZQUNyQixPQUFPLEVBQUUsY0FBYztTQUN2QixDQUFDO1FBRU0sYUFBUSxHQUFJLEtBQUssQ0FBQyxlQUFlLENBQUM7UUFzQnpDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUN0QixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDcEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBRTFCLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBRWxCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDO1lBQ3ZELElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsSUFBSSxLQUFLLENBQUMsdUJBQXVCLENBQUM7WUFDbkUsSUFBSSxDQUFDLEtBQUssR0FBUSxJQUFJLHlCQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNQLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztZQUN0QixJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDbEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUM7WUFDcEUsSUFBSSxDQUFDLEtBQUssR0FBUSxJQUFJLDJCQUFZLENBQUM7Z0JBQ2xDLGNBQWMsRUFBRSxJQUFJO2dCQUNwQixFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTthQUNmLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxLQUFLLENBQUMsRUFBWTtRQUNqQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNqQixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBUSxFQUFFLEVBQUU7Z0JBQ3pDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNYLEtBQUssQ0FBQyxjQUFjLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUM5QixNQUFNLENBQUM7Z0JBQ1IsQ0FBQztnQkFFRCxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBQzFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQztnQkFDNUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUMzQyxPQUFPLENBQUMsUUFBUSxDQUFDO29CQUNoQixLQUFLLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMxQixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ1AsTUFBTSxDQUFDLElBQUksQ0FDVixtQ0FBbUMsRUFDbkMsSUFBSSxDQUFDLElBQUksRUFDVCxJQUFJLENBQUMsSUFBSSxFQUNULElBQUksQ0FBQyxJQUFJLENBQ1QsQ0FBQztZQUNGLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM5QyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUVELFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUV2QyxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM5QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILElBQUk7UUFDSCxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM5QixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3BCLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxRQUFRLENBQUMsUUFBZ0IsRUFBRSxNQUFXO1FBQ3JDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsY0FBYyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDakUsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsTUFBTSxDQUFDLFFBQWdCO1FBQ3RCLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEMsRUFBRSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDOUIsTUFBTSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7WUFDckIsYUFBYSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1QixNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxPQUFPLENBQUMsUUFBZ0I7UUFDdkIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwQyxFQUFFLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDdEIsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDckMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2pDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ3ZCLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDSCxPQUFPLENBQUMsUUFBZ0IsRUFBRSxNQUFjLEVBQUUsR0FBUSxFQUFFLEVBQVk7UUFDL0QsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDUixNQUFNLENBQUMsS0FBSyxDQUFDLHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzlDLEVBQUUsQ0FBQyxtQkFBbUIsR0FBRyxRQUFRLENBQUMsQ0FBQztZQUNuQyxNQUFNLENBQUM7UUFDUixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDaEQsRUFBRSxDQUFDLFNBQVMsR0FBRyxRQUFRLEdBQUcsYUFBYSxDQUFDLENBQUM7WUFDekMsTUFBTSxDQUFDO1FBQ1IsQ0FBQztRQUVELElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDdEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNyRCxNQUFNLENBQUMsS0FBSyxDQUNYLDZDQUE2QyxFQUM3QyxRQUFRLEVBQ1IsTUFBTSxDQUNOLENBQUM7WUFDRixFQUFFLENBQ0QsU0FBUztnQkFDUixRQUFRO2dCQUNSLGlDQUFpQztnQkFDakMsTUFBTSxDQUNQLENBQUM7WUFDRixNQUFNLENBQUM7UUFDUixDQUFDO1FBRUQsSUFBSSxHQUFHLEdBQUc7WUFDVCxNQUFNLEVBQUUsU0FBUztZQUNqQixRQUFRLEVBQUUsUUFBUTtZQUNsQixNQUFNLEVBQUUsTUFBTTtZQUNkLEdBQUcsRUFBRSxHQUFHO1lBQ1IsS0FBSyxFQUFFLElBQVc7U0FDbEIsQ0FBQztRQUVGLElBQUksTUFBTSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3RFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLE1BQWdCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN0QyxNQUFNLENBQUM7UUFDUixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsTUFBTSxLQUFLLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDN0IsQ0FBQztRQUVELE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQsT0FBTyxDQUFDLE9BQWUsRUFBRSxRQUFnQixFQUFFLEdBQVEsRUFBRSxFQUFZO1FBQ2hFLElBQUksR0FBRyxHQUFtQixJQUFJLENBQUMsUUFBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xELEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLE9BQU8sR0FBRyxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkMsRUFBRSxDQUFDLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQztRQUNSLENBQUM7UUFFRCxJQUFJLEdBQUcsR0FBRztZQUNULE1BQU0sRUFBRSxTQUFTO1lBQ2pCLFFBQVEsRUFBRSxRQUFRO1lBQ2xCLEdBQUcsRUFBRSxHQUFHO1lBQ1IsS0FBSyxFQUFFLElBQVc7U0FDbEIsQ0FBQztRQUVGLElBQUksTUFBTSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3JFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLE1BQWdCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN0QyxNQUFNLENBQUM7UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDNUIsR0FBRyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFFSCxHQUFHLENBQUMsUUFBZ0IsRUFBRSxLQUFVO1FBQy9CLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQy9CLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILEdBQUcsQ0FBQyxRQUFnQjtRQUNuQixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QixDQUFDO0NBQ0Q7QUF6UUQsd0NBeVFDO0FBQ0Q7Ozs7Ozs7R0FPRztBQUNILHdCQUNDLE9BQXVCLEVBQ3ZCLFFBQWdCLEVBQ2hCLE1BQVc7SUFFWCxJQUFJLE1BQU0sR0FBaUI7UUFDMUIsUUFBUSxFQUFFLFFBQVE7UUFDbEIsTUFBTSxFQUFFLE1BQU07UUFDZCxNQUFNLEVBQUUsS0FBSztLQUNiLENBQUM7SUFFRixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLEVBQUUsQ0FBQyxDQUNGLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQztZQUNsRCxDQUFDLE9BQU8sQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUNqRCxDQUFDLENBQUMsQ0FBQztZQUNGLCtDQUErQztZQUMvQyxNQUFNLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUM7WUFDdkMsMEJBQTBCO1lBQzFCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkIsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7WUFDbEIsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDckIsQ0FBQztZQUNELE1BQU0sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUyxDQUFDLENBQUM7WUFDOUMsTUFBTSxDQUFDLEtBQU0sSUFBSSxZQUFZLENBQUM7WUFDOUIsTUFBTSxDQUFDLFFBQVEsSUFBSSxZQUFZLENBQUM7WUFDaEMsTUFBTSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDeEIsQ0FBQztJQUNGLENBQUM7SUFFRCxNQUFNLENBQUMsTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILHVCQUF1QixPQUF1QixFQUFFLE1BQW9CO0lBQ25FLEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUMvQixNQUFNLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxXQUFXLENBQ2xDO1lBQ0MsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsS0FBTTtZQUNqQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFFBQVE7U0FDdkIsRUFDRCxhQUFhLEVBQ2I7WUFDQyxPQUFPLEVBQUUsT0FBTztZQUNoQixNQUFNLEVBQUUsTUFBTTtTQUNkLENBQ0QsQ0FBQztJQUNILENBQUM7QUFDRixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCx1QkFBdUIsSUFBUztJQUMvQixJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQzNCLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDN0QsTUFBTSxDQUFDO0lBQ1IsQ0FBQztJQUVELEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsR0FBUSxFQUFFLEVBQUU7WUFDN0QsTUFBTSxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQzNELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ1AsTUFBTSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxHQUFRLEVBQUUsRUFBRTtZQUM5RCxNQUFNLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0FBQ0YsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCxxQkFDQyxLQUFxQixFQUNyQixLQUFpQyxFQUNqQyxLQUFhO0lBRWIsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUU7UUFDZixJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEIsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQy9CLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVEOztHQUVHO0FBQ0gscUJBQ0MsY0FBOEIsRUFDOUIsUUFBZ0IsRUFDaEIsR0FBUSxFQUNSLEVBQVk7SUFFWixJQUFJLE9BQU8sR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDO0lBRXJDLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNoQixHQUFHLENBQUMsQ0FBQyxJQUFJLFFBQVEsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQzlCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLFFBQVEsQ0FBQztRQUNWLENBQUM7UUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxFQUFFLENBQUMsSUFBSSxFQUFFO1FBQ1IsT0FBTyxFQUFFLE1BQU07S0FDZixDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQ7O0dBRUc7QUFDSCx1QkFDQyxjQUE4QixFQUM5QixRQUFnQixFQUNoQixHQUFRLEVBQ1IsRUFBWTtJQUVaLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEdBQUcsUUFBUSxDQUFDLENBQUM7UUFDNUQsRUFBRSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDckIsTUFBTSxDQUFDO0lBQ1IsQ0FBQztJQUVELElBQUksT0FBTyxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUM7SUFDckMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLEVBQUUsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVCLE1BQU0sQ0FBQztJQUNSLENBQUM7SUFFRCxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUMzQixjQUFjLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hDLGNBQWMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDNUQsRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ1AsY0FBYyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNoQyxFQUFFLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQixDQUFDO0FBQ0YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsd0JBQ0MsY0FBOEIsRUFDOUIsUUFBZ0IsRUFDaEIsR0FBUSxFQUNSLEVBQVk7SUFFWixFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxHQUFHLFFBQVEsQ0FBQyxDQUFDO1FBQzVELEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQztJQUNSLENBQUM7SUFFRCxJQUFJLE9BQU8sR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDO0lBQ3JDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QixFQUFFLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUM7SUFDUixDQUFDO0lBRUQsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDM0IsY0FBYyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqQyxjQUFjLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzdELEVBQUUsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNQLGNBQWMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakMsRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0IsQ0FBQztBQUNGLENBQUM7QUFFRCxvQkFDQyxLQUFpQyxFQUNqQyxNQUFjLEVBQ2QsTUFBYyxFQUNkLFFBQWdCLEVBQ2hCLEdBQVE7SUFFUixFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztRQUMxQixFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssZUFBZSxJQUFJLFFBQVEsS0FBSyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQzlELE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDVixDQUFDO1FBRUQsSUFBSSxNQUFNLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztRQUN4QixFQUFFLENBQUMsQ0FDRixDQUFDLE1BQU07WUFDUCxDQUFDLENBQUMsTUFBTSxLQUFLLE1BQU0sSUFBSSxNQUFNLEtBQUssS0FBSyxJQUFJLE1BQU0sS0FBSyxNQUFNLENBQzdELENBQUMsQ0FBQyxDQUFDO1lBQ0YsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNWLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxRQUFRLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQztJQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDZixNQUFNLENBQUMsaUJBQWlCLENBQUM7SUFDMUIsQ0FBQztJQUVELElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUMsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ25ELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQy9CLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2YsTUFBTSxDQUFDLDJCQUEyQixDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDUCxNQUFNLENBQUMsbUJBQW1CLENBQUM7SUFDNUIsQ0FBQztJQUNELE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDVixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCw2QkFBb0MsSUFBUztJQUM1QyxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztJQUNsQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNuQixNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUpELGtEQUlDO0FBRUQ7Ozs7Ozs7O0dBUUc7QUFDSCw4QkFBcUMsSUFBUztJQUM3QyxNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUZELG9EQUVDIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbG9nZ2VyID0gcmVxdWlyZShcInBvbWVsby1sb2dnZXJcIikuZ2V0TG9nZ2VyKFxuXHRcInBvbWVsby1hZG1pblwiLFxuXHRcIkNvbnNvbGVTZXJ2aWNlXCJcbik7XG5jb25zdCBzY2hlZHVsZSA9IHJlcXVpcmUoXCJwb21lbG8tc2NoZWR1bGVyXCIpO1xuaW1wb3J0IHByb3RvY29sID0gcmVxdWlyZShcIi4vdXRpbC9wcm90b2NvbFwiKTtcbmltcG9ydCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWwvdXRpbHNcIik7XG5pbXBvcnQgdXRpbCA9IHJlcXVpcmUoXCJ1dGlsXCIpO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSBcImV2ZW50c1wiO1xuaW1wb3J0IHsgTW9uaXRvckFnZW50IH0gZnJvbSBcIi4vbW9uaXRvci9tb25pdG9yQWdlbnRcIjtcbmltcG9ydCB7IE1hc3RlckFnZW50IH0gZnJvbSBcIi4vbWFzdGVyL21hc3RlckFnZW50XCI7XG5pbXBvcnQgeyBNb2R1bGVSZWNvcmQgfSBmcm9tIFwiLi4vaW5kZXhcIjtcblxuY29uc3QgTVNfT0ZfU0VDT05EID0gMTAwMDtcblxuZXhwb3J0IGNsYXNzIENvbnNvbGVTZXJ2aWNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcblx0cHJpdmF0ZSBwb3J0OiBudW1iZXI7XG5cdHByaXZhdGUgZW52OiBzdHJpbmc7XG5cdHByaXZhdGUgdmFsdWVzOiB7IFtpZHg6IHN0cmluZ106IGFueSB9O1xuXHRyZWFkb25seSBtYXN0ZXI6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1vZHVsZXM6IHsgW2lkeDogc3RyaW5nXTogTW9kdWxlUmVjb3JkIH07XG5cdHByaXZhdGUgY29tbWFuZHMgPSB7XG5cdFx0bGlzdDogbGlzdENvbW1hbmQsXG5cdFx0ZW5hYmxlOiBlbmFibGVDb21tYW5kLFxuXHRcdGRpc2FibGU6IGRpc2FibGVDb21tYW5kXG5cdH07XG5cdHByaXZhdGUgYXV0aFNlcnZlcjogKG1zZzogYW55LCBlbnY6IHN0cmluZywgY2I6IEZ1bmN0aW9uKSA9PiB2b2lkO1xuXHRwcml2YXRlIGF1dGhVc2VyPyA9IHV0aWxzLmRlZmF1bHRBdXRoVXNlcjtcblx0cmVhZG9ubHkgYWdlbnQ6IE1hc3RlckFnZW50ICYgTW9uaXRvckFnZW50O1xuXG5cdHByaXZhdGUgdHlwZT86IHN0cmluZztcblx0cHJpdmF0ZSBpZD86IHN0cmluZztcblx0cHJpdmF0ZSBob3N0Pzogc3RyaW5nO1xuXHQvKipcblx0ICogQ29uc29sZVNlcnZpY2UgQ29uc3RydWN0b3Jcblx0ICpcblx0ICogQGNsYXNzIENvbnNvbGVTZXJ2aWNlXG5cdCAqIEBjb25zdHJ1Y3RvclxuXHQgKiBAcGFyYW0ge09iamVjdH0gb3B0cyBjb25zdHJ1Y3QgcGFyYW1ldGVyXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLnR5cGUgXHR7U3RyaW5nfSBzZXJ2ZXIgdHlwZSwgJ21hc3RlcicsICdjb25uZWN0b3InLCBldGMuXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLmlkIFx0XHR7U3RyaW5nfSBzZXJ2ZXIgaWRcblx0ICogICAgICAgICAgICAgICAgIG9wdHMuaG9zdCBcdHtTdHJpbmd9IChtb25pdG9yIG9ubHkpIG1hc3RlciBzZXJ2ZXIgaG9zdFxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5wb3J0IFx0e1N0cmluZyB8IE51bWJlcn0gbGlzdGVuIHBvcnQgZm9yIG1hc3RlciBvciBtYXN0ZXIgcG9ydCBmb3IgbW9uaXRvclxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5tYXN0ZXIgIHtCb29sZWFufSBjdXJyZW50IHNlcnZpY2UgaXMgbWFzdGVyIG9yIG1vbml0b3Jcblx0ICogICAgICAgICAgICAgICAgIG9wdHMuaW5mbyBcdHtPYmplY3R9IG1vcmUgc2VydmVyIGluZm8gZm9yIGN1cnJlbnQgc2VydmVyLCB7aWQsIHNlcnZlclR5cGUsIGhvc3QsIHBvcnR9XG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihvcHRzOiBhbnkpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucG9ydCA9IG9wdHMucG9ydDtcblx0XHR0aGlzLmVudiA9IG9wdHMuZW52O1xuXHRcdHRoaXMudmFsdWVzID0ge307XG5cdFx0dGhpcy5tYXN0ZXIgPSBvcHRzLm1hc3RlcjtcblxuXHRcdHRoaXMubW9kdWxlcyA9IHt9O1xuXG5cdFx0aWYgKHRoaXMubWFzdGVyKSB7XG5cdFx0XHR0aGlzLmF1dGhVc2VyID0gb3B0cy5hdXRoVXNlciB8fCB1dGlscy5kZWZhdWx0QXV0aFVzZXI7XG5cdFx0XHR0aGlzLmF1dGhTZXJ2ZXIgPSBvcHRzLmF1dGhTZXJ2ZXIgfHwgdXRpbHMuZGVmYXVsdEF1dGhTZXJ2ZXJNYXN0ZXI7XG5cdFx0XHR0aGlzLmFnZW50ID0gPGFueT5uZXcgTWFzdGVyQWdlbnQodGhpcywgb3B0cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHlwZSA9IG9wdHMudHlwZTtcblx0XHRcdHRoaXMuaWQgPSBvcHRzLmlkO1xuXHRcdFx0dGhpcy5ob3N0ID0gb3B0cy5ob3N0O1xuXHRcdFx0dGhpcy5hdXRoU2VydmVyID0gb3B0cy5hdXRoU2VydmVyIHx8IHV0aWxzLmRlZmF1bHRBdXRoU2VydmVyTW9uaXRvcjtcblx0XHRcdHRoaXMuYWdlbnQgPSA8YW55Pm5ldyBNb25pdG9yQWdlbnQoe1xuXHRcdFx0XHRjb25zb2xlU2VydmljZTogdGhpcyxcblx0XHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRcdHR5cGU6IHRoaXMudHlwZSxcblx0XHRcdFx0aW5mbzogb3B0cy5pbmZvXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogc3RhcnQgbWFzdGVyIG9yIG1vbml0b3Jcblx0ICpcblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2IgY2FsbGJhY2sgZnVuY3Rpb25cblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdHN0YXJ0KGNiOiBGdW5jdGlvbikge1xuXHRcdGlmICh0aGlzLm1hc3Rlcikge1xuXHRcdFx0dGhpcy5hZ2VudC5saXN0ZW4odGhpcy5wb3J0LCAoZXJyOiBhbnkpID0+IHtcblx0XHRcdFx0aWYgKCEhZXJyKSB7XG5cdFx0XHRcdFx0dXRpbHMuaW52b2tlQ2FsbGJhY2soY2IsIGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZXhwb3J0RXZlbnQodGhpcywgdGhpcy5hZ2VudCwgXCJyZWdpc3RlclwiKTtcblx0XHRcdFx0ZXhwb3J0RXZlbnQodGhpcywgdGhpcy5hZ2VudCwgXCJkaXNjb25uZWN0XCIpO1xuXHRcdFx0XHRleHBvcnRFdmVudCh0aGlzLCB0aGlzLmFnZW50LCBcInJlY29ubmVjdFwiKTtcblx0XHRcdFx0cHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcblx0XHRcdFx0XHR1dGlscy5pbnZva2VDYWxsYmFjayhjYik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ2dlci5pbmZvKFxuXHRcdFx0XHRcInRyeSB0byBjb25uZWN0IG1hc3RlcjogJWosICVqLCAlalwiLFxuXHRcdFx0XHR0aGlzLnR5cGUsXG5cdFx0XHRcdHRoaXMuaG9zdCxcblx0XHRcdFx0dGhpcy5wb3J0XG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5hZ2VudC5jb25uZWN0KHRoaXMucG9ydCwgdGhpcy5ob3N0ISwgY2IpO1xuXHRcdFx0ZXhwb3J0RXZlbnQodGhpcywgdGhpcy5hZ2VudCwgXCJjbG9zZVwiKTtcblx0XHR9XG5cblx0XHRleHBvcnRFdmVudCh0aGlzLCB0aGlzLmFnZW50LCBcImVycm9yXCIpO1xuXG5cdFx0Zm9yIChsZXQgbWlkIGluIHRoaXMubW9kdWxlcykge1xuXHRcdFx0dGhpcy5lbmFibGUobWlkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogc3RvcCBjb25zb2xlIG1vZHVsZXMgYW5kIHN0b3AgbWFzdGVyIHNlcnZlclxuXHQgKlxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0c3RvcCgpIHtcblx0XHRmb3IgKGxldCBtaWQgaW4gdGhpcy5tb2R1bGVzKSB7XG5cdFx0XHR0aGlzLmRpc2FibGUobWlkKTtcblx0XHR9XG5cdFx0dGhpcy5hZ2VudC5jbG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIHJlZ2lzdGVyIGEgbmV3IGFkbWluQ29uc29sZSBtb2R1bGVcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIGFkbWluQ29uc29sZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtb2R1bGUgbW9kdWxlIG9iamVjdFxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0cmVnaXN0ZXIobW9kdWxlSWQ6IHN0cmluZywgbW9kdWxlOiBhbnkpIHtcblx0XHR0aGlzLm1vZHVsZXNbbW9kdWxlSWRdID0gcmVnaXN0ZXJSZWNvcmQodGhpcywgbW9kdWxlSWQsIG1vZHVsZSk7XG5cdH1cblxuXHQvKipcblx0ICogZW5hYmxlIGFkbWluQ29uc29sZSBtb2R1bGVcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIGFkbWluQ29uc29sZSBpZC9uYW1lXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRlbmFibGUobW9kdWxlSWQ6IHN0cmluZykge1xuXHRcdGxldCByZWNvcmQgPSB0aGlzLm1vZHVsZXNbbW9kdWxlSWRdO1xuXHRcdGlmIChyZWNvcmQgJiYgIXJlY29yZC5lbmFibGUpIHtcblx0XHRcdHJlY29yZC5lbmFibGUgPSB0cnVlO1xuXHRcdFx0YWRkVG9TY2hlZHVsZSh0aGlzLCByZWNvcmQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBkaXNhYmxlIGFkbWluQ29uc29sZSBtb2R1bGVcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIGFkbWluQ29uc29sZSBpZC9uYW1lXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRkaXNhYmxlKG1vZHVsZUlkOiBzdHJpbmcpIHtcblx0XHRsZXQgcmVjb3JkID0gdGhpcy5tb2R1bGVzW21vZHVsZUlkXTtcblx0XHRpZiAocmVjb3JkICYmIHJlY29yZC5lbmFibGUpIHtcblx0XHRcdHJlY29yZC5lbmFibGUgPSBmYWxzZTtcblx0XHRcdGlmIChyZWNvcmQuc2NoZWR1bGUgJiYgcmVjb3JkLmpvYklkKSB7XG5cdFx0XHRcdHNjaGVkdWxlLmNhbmNlbEpvYihyZWNvcmQuam9iSWQpO1xuXHRcdFx0XHRzY2hlZHVsZS5qb2JJZCA9IG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIGNhbGwgY29uY3JldGUgbW9kdWxlIGFuZCBoYW5kbGVyKG1vbml0b3JIYW5kbGVyLG1hc3RlckhhbmRsZXIsY2xpZW50SGFuZGxlcilcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIGFkbWluQ29uc29sZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtZXRob2QgaGFuZGxlclxuXHQgKiBAcGFyYW0ge09iamVjdH0gbXNnIG1lc3NhZ2Vcblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2IgY2FsbGJhY2sgZnVuY3Rpb25cblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdGV4ZWN1dGUobW9kdWxlSWQ6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIG1zZzogYW55LCBjYjogRnVuY3Rpb24pIHtcblx0XHRsZXQgbSA9IHRoaXMubW9kdWxlc1ttb2R1bGVJZF07XG5cdFx0aWYgKCFtKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXCJ1bmtub3duIG1vZHVsZTogJWouXCIsIG1vZHVsZUlkKTtcblx0XHRcdGNiKFwidW5rbm93biBtb2R1bGVJZDpcIiArIG1vZHVsZUlkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW0uZW5hYmxlKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXCJtb2R1bGUgJWogaXMgZGlzYWJsZS5cIiwgbW9kdWxlSWQpO1xuXHRcdFx0Y2IoXCJtb2R1bGUgXCIgKyBtb2R1bGVJZCArIFwiIGlzIGRpc2FibGVcIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG1vZHVsZSA9IG0ubW9kdWxlO1xuXHRcdGlmICghbW9kdWxlIHx8IHR5cGVvZiBtb2R1bGVbbWV0aG9kXSAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXG5cdFx0XHRcdFwibW9kdWxlICVqIGRvc2Ugbm90IGhhdmUgYSBtZXRob2QgY2FsbGVkICVqLlwiLFxuXHRcdFx0XHRtb2R1bGVJZCxcblx0XHRcdFx0bWV0aG9kXG5cdFx0XHQpO1xuXHRcdFx0Y2IoXG5cdFx0XHRcdFwibW9kdWxlIFwiICtcblx0XHRcdFx0XHRtb2R1bGVJZCArXG5cdFx0XHRcdFx0XCIgZG9zZSBub3QgaGF2ZSBhIG1ldGhvZCBjYWxsZWQgXCIgK1xuXHRcdFx0XHRcdG1ldGhvZFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbG9nID0ge1xuXHRcdFx0YWN0aW9uOiBcImV4ZWN1dGVcIixcblx0XHRcdG1vZHVsZUlkOiBtb2R1bGVJZCxcblx0XHRcdG1ldGhvZDogbWV0aG9kLFxuXHRcdFx0bXNnOiBtc2csXG5cdFx0XHRlcnJvcjogbnVsbCBhcyBhbnlcblx0XHR9O1xuXG5cdFx0bGV0IGFjbE1zZyA9IGFjbENvbnRyb2wodGhpcy5hZ2VudCwgXCJleGVjdXRlXCIsIG1ldGhvZCwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0aWYgKGFjbE1zZyAhPT0gMCAmJiBhY2xNc2cgIT09IDEpIHtcblx0XHRcdGxvZ1tcImVycm9yXCJdID0gYWNsTXNnO1xuXHRcdFx0dGhpcy5lbWl0KFwiYWRtaW4tbG9nXCIsIGxvZywgYWNsTXNnKTtcblx0XHRcdGNiKG5ldyBFcnJvcihhY2xNc2cgYXMgc3RyaW5nKSwgbnVsbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1ldGhvZCA9PT0gXCJjbGllbnRIYW5kbGVyXCIpIHtcblx0XHRcdHRoaXMuZW1pdChcImFkbWluLWxvZ1wiLCBsb2cpO1xuXHRcdH1cblxuXHRcdG1vZHVsZVttZXRob2RdKHRoaXMuYWdlbnQsIG1zZywgY2IpO1xuXHR9XG5cblx0Y29tbWFuZChjb21tYW5kOiBzdHJpbmcsIG1vZHVsZUlkOiBzdHJpbmcsIG1zZzogYW55LCBjYjogRnVuY3Rpb24pIHtcblx0XHRsZXQgZnVuOiBGdW5jdGlvbiA9ICg8YW55PnRoaXMuY29tbWFuZHMpW2NvbW1hbmRdO1xuXHRcdGlmICghZnVuIHx8IHR5cGVvZiBmdW4gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0Y2IoXCJ1bmtub3duIGNvbW1hbmQ6XCIgKyBjb21tYW5kKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbG9nID0ge1xuXHRcdFx0YWN0aW9uOiBcImNvbW1hbmRcIixcblx0XHRcdG1vZHVsZUlkOiBtb2R1bGVJZCxcblx0XHRcdG1zZzogbXNnLFxuXHRcdFx0ZXJyb3I6IG51bGwgYXMgYW55XG5cdFx0fTtcblxuXHRcdGxldCBhY2xNc2cgPSBhY2xDb250cm9sKHRoaXMuYWdlbnQsIFwiY29tbWFuZFwiLCBudWxsISwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0aWYgKGFjbE1zZyAhPT0gMCAmJiBhY2xNc2cgIT09IDEpIHtcblx0XHRcdGxvZ1tcImVycm9yXCJdID0gYWNsTXNnO1xuXHRcdFx0dGhpcy5lbWl0KFwiYWRtaW4tbG9nXCIsIGxvZywgYWNsTXNnKTtcblx0XHRcdGNiKG5ldyBFcnJvcihhY2xNc2cgYXMgc3RyaW5nKSwgbnVsbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbWl0KFwiYWRtaW4tbG9nXCIsIGxvZyk7XG5cdFx0ZnVuKHRoaXMsIG1vZHVsZUlkLCBtc2csIGNiKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBzZXQgbW9kdWxlIGRhdGEgdG8gYSBtYXBcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIGFkbWluQ29uc29sZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSB2YWx1ZSBtb2R1bGUgZGF0YVxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblxuXHRzZXQobW9kdWxlSWQ6IHN0cmluZywgdmFsdWU6IGFueSkge1xuXHRcdHRoaXMudmFsdWVzW21vZHVsZUlkXSA9IHZhbHVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIGdldCBtb2R1bGUgZGF0YSBmcm9tIG1hcFxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgYWRtaW5Db25zb2xlIGlkL25hbWVcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdGdldChtb2R1bGVJZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWVzW21vZHVsZUlkXTtcblx0fVxufVxuLyoqXG4gKiByZWdpc3RlciBhIG1vZHVsZSBzZXJ2aWNlXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHNlcnZpY2UgY29uc29sZVNlcnZpY2Ugb2JqZWN0XG4gKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgYWRtaW5Db25zb2xlIGlkL25hbWVcbiAqIEBwYXJhbSB7T2JqZWN0fSBtb2R1bGUgbW9kdWxlIG9iamVjdFxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHJlZ2lzdGVyUmVjb3JkKFxuXHRzZXJ2aWNlOiBDb25zb2xlU2VydmljZSxcblx0bW9kdWxlSWQ6IHN0cmluZyxcblx0bW9kdWxlOiBhbnlcbikge1xuXHRsZXQgcmVjb3JkOiBNb2R1bGVSZWNvcmQgPSB7XG5cdFx0bW9kdWxlSWQ6IG1vZHVsZUlkLFxuXHRcdG1vZHVsZTogbW9kdWxlLFxuXHRcdGVuYWJsZTogZmFsc2Vcblx0fTtcblxuXHRpZiAobW9kdWxlLnR5cGUgJiYgbW9kdWxlLmludGVydmFsKSB7XG5cdFx0aWYgKFxuXHRcdFx0KCFzZXJ2aWNlLm1hc3RlciAmJiByZWNvcmQubW9kdWxlLnR5cGUgPT09IFwicHVzaFwiKSB8fFxuXHRcdFx0KHNlcnZpY2UubWFzdGVyICYmIHJlY29yZC5tb2R1bGUudHlwZSAhPT0gXCJwdXNoXCIpXG5cdFx0KSB7XG5cdFx0XHQvLyBwdXNoIGZvciBtb25pdG9yIG9yIHB1bGwgZm9yIG1hc3RlcihkZWZhdWx0KVxuXHRcdFx0cmVjb3JkLmRlbGF5ID0gbW9kdWxlLmRlbGF5IHx8IDA7XG5cdFx0XHRyZWNvcmQuaW50ZXJ2YWwgPSBtb2R1bGUuaW50ZXJ2YWwgfHwgMTtcblx0XHRcdC8vIG5vcm1hbGl6ZSB0aGUgYXJndW1lbnRzXG5cdFx0XHRpZiAocmVjb3JkLmRlbGF5ISA8IDApIHtcblx0XHRcdFx0cmVjb3JkLmRlbGF5ID0gMDtcblx0XHRcdH1cblx0XHRcdGlmIChyZWNvcmQuaW50ZXJ2YWwhIDwgMCkge1xuXHRcdFx0XHRyZWNvcmQuaW50ZXJ2YWwgPSAxO1xuXHRcdFx0fVxuXHRcdFx0cmVjb3JkLmludGVydmFsID0gTWF0aC5jZWlsKHJlY29yZC5pbnRlcnZhbCEpO1xuXHRcdFx0cmVjb3JkLmRlbGF5ISAqPSBNU19PRl9TRUNPTkQ7XG5cdFx0XHRyZWNvcmQuaW50ZXJ2YWwgKj0gTVNfT0ZfU0VDT05EO1xuXHRcdFx0cmVjb3JkLnNjaGVkdWxlID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVjb3JkO1xufVxuXG4vKipcbiAqIHNjaGVkdWxlIGNvbnNvbGUgbW9kdWxlXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHNlcnZpY2UgY29uc29sZVNlcnZpY2Ugb2JqZWN0XG4gKiBAcGFyYW0ge09iamVjdH0gcmVjb3JkICBtb2R1bGUgb2JqZWN0XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gYWRkVG9TY2hlZHVsZShzZXJ2aWNlOiBDb25zb2xlU2VydmljZSwgcmVjb3JkOiBNb2R1bGVSZWNvcmQpIHtcblx0aWYgKHJlY29yZCAmJiByZWNvcmQuc2NoZWR1bGUpIHtcblx0XHRyZWNvcmQuam9iSWQgPSBzY2hlZHVsZS5zY2hlZHVsZUpvYihcblx0XHRcdHtcblx0XHRcdFx0c3RhcnQ6IERhdGUubm93KCkgKyByZWNvcmQuZGVsYXkhLFxuXHRcdFx0XHRwZXJpb2Q6IHJlY29yZC5pbnRlcnZhbFxuXHRcdFx0fSxcblx0XHRcdGRvU2NoZWR1bGVKb2IsXG5cdFx0XHR7XG5cdFx0XHRcdHNlcnZpY2U6IHNlcnZpY2UsXG5cdFx0XHRcdHJlY29yZDogcmVjb3JkXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuXG4vKipcbiAqIHJ1biBzY2hlZHVsZSBqb2JcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYXJncyBhcmdtZW50c1xuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGRvU2NoZWR1bGVKb2IoYXJnczogYW55KSB7XG5cdGxldCBzZXJ2aWNlID0gYXJncy5zZXJ2aWNlO1xuXHRsZXQgcmVjb3JkID0gYXJncy5yZWNvcmQ7XG5cdGlmICghc2VydmljZSB8fCAhcmVjb3JkIHx8ICFyZWNvcmQubW9kdWxlIHx8ICFyZWNvcmQuZW5hYmxlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKHNlcnZpY2UubWFzdGVyKSB7XG5cdFx0cmVjb3JkLm1vZHVsZS5tYXN0ZXJIYW5kbGVyKHNlcnZpY2UuYWdlbnQsIG51bGwsIChlcnI6IGFueSkgPT4ge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFwiaW50ZXJ2YWwgcHVzaCBzaG91bGQgbm90IGhhdmUgYSBjYWxsYmFjay5cIik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0cmVjb3JkLm1vZHVsZS5tb25pdG9ySGFuZGxlcihzZXJ2aWNlLmFnZW50LCBudWxsLCAoZXJyOiBhbnkpID0+IHtcblx0XHRcdGxvZ2dlci5lcnJvcihcImludGVydmFsIHB1c2ggc2hvdWxkIG5vdCBoYXZlIGEgY2FsbGJhY2suXCIpO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogZXhwb3J0IGNsb3N1cmUgZnVuY3Rpb24gb3V0XG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gb3V0ZXIgb3V0ZXIgZnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGlubmVyIGlubmVyIGZ1bmN0aW9uXG4gKiBAcGFyYW0ge29iamVjdH0gZXZlbnRcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBleHBvcnRFdmVudChcblx0b3V0ZXI6IENvbnNvbGVTZXJ2aWNlLFxuXHRpbm5lcjogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGV2ZW50OiBzdHJpbmdcbikge1xuXHRpbm5lci5vbihldmVudCwgZnVuY3Rpb24oKSB7XG5cdFx0bGV0IGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuXHRcdGFyZ3MudW5zaGlmdChldmVudCk7XG5cdFx0b3V0ZXIuZW1pdC5hcHBseShvdXRlciwgYXJncyk7XG5cdH0pO1xufVxuXG4vKipcbiAqIExpc3QgY3VycmVudCBtb2R1bGVzXG4gKi9cbmZ1bmN0aW9uIGxpc3RDb21tYW5kKFxuXHRjb25zb2xlU2VydmljZTogQ29uc29sZVNlcnZpY2UsXG5cdG1vZHVsZUlkOiBzdHJpbmcsXG5cdG1zZzogYW55LFxuXHRjYjogRnVuY3Rpb25cbikge1xuXHRsZXQgbW9kdWxlcyA9IGNvbnNvbGVTZXJ2aWNlLm1vZHVsZXM7XG5cblx0bGV0IHJlc3VsdCA9IFtdO1xuXHRmb3IgKGxldCBtb2R1bGVJZCBpbiBtb2R1bGVzKSB7XG5cdFx0aWYgKC9eX19cXHcrX18kLy50ZXN0KG1vZHVsZUlkKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnB1c2gobW9kdWxlSWQpO1xuXHR9XG5cblx0Y2IobnVsbCwge1xuXHRcdG1vZHVsZXM6IHJlc3VsdFxuXHR9KTtcbn1cblxuLyoqXG4gKiBlbmFibGUgbW9kdWxlIGluIGN1cnJlbnQgc2VydmVyXG4gKi9cbmZ1bmN0aW9uIGVuYWJsZUNvbW1hbmQoXG5cdGNvbnNvbGVTZXJ2aWNlOiBDb25zb2xlU2VydmljZSxcblx0bW9kdWxlSWQ6IHN0cmluZyxcblx0bXNnOiBhbnksXG5cdGNiOiBGdW5jdGlvblxuKSB7XG5cdGlmICghbW9kdWxlSWQpIHtcblx0XHRsb2dnZXIuZXJyb3IoXCJmYWlsIHRvIGVuYWJsZSBhZG1pbiBtb2R1bGUgZm9yIFwiICsgbW9kdWxlSWQpO1xuXHRcdGNiKFwiZW1wdHkgbW9kdWxlSWRcIik7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0bGV0IG1vZHVsZXMgPSBjb25zb2xlU2VydmljZS5tb2R1bGVzO1xuXHRpZiAoIW1vZHVsZXNbbW9kdWxlSWRdKSB7XG5cdFx0Y2IobnVsbCwgcHJvdG9jb2wuUFJPX0ZBSUwpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChjb25zb2xlU2VydmljZS5tYXN0ZXIpIHtcblx0XHRjb25zb2xlU2VydmljZS5lbmFibGUobW9kdWxlSWQpO1xuXHRcdGNvbnNvbGVTZXJ2aWNlLmFnZW50Lm5vdGlmeUNvbW1hbmQoXCJlbmFibGVcIiwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0Y2IobnVsbCwgcHJvdG9jb2wuUFJPX09LKTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlU2VydmljZS5lbmFibGUobW9kdWxlSWQpO1xuXHRcdGNiKG51bGwsIHByb3RvY29sLlBST19PSyk7XG5cdH1cbn1cblxuLyoqXG4gKiBkaXNhYmxlIG1vZHVsZSBpbiBjdXJyZW50IHNlcnZlclxuICovXG5mdW5jdGlvbiBkaXNhYmxlQ29tbWFuZChcblx0Y29uc29sZVNlcnZpY2U6IENvbnNvbGVTZXJ2aWNlLFxuXHRtb2R1bGVJZDogc3RyaW5nLFxuXHRtc2c6IGFueSxcblx0Y2I6IEZ1bmN0aW9uXG4pIHtcblx0aWYgKCFtb2R1bGVJZCkge1xuXHRcdGxvZ2dlci5lcnJvcihcImZhaWwgdG8gZW5hYmxlIGFkbWluIG1vZHVsZSBmb3IgXCIgKyBtb2R1bGVJZCk7XG5cdFx0Y2IoXCJlbXB0eSBtb2R1bGVJZFwiKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRsZXQgbW9kdWxlcyA9IGNvbnNvbGVTZXJ2aWNlLm1vZHVsZXM7XG5cdGlmICghbW9kdWxlc1ttb2R1bGVJZF0pIHtcblx0XHRjYihudWxsLCBwcm90b2NvbC5QUk9fRkFJTCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKGNvbnNvbGVTZXJ2aWNlLm1hc3Rlcikge1xuXHRcdGNvbnNvbGVTZXJ2aWNlLmRpc2FibGUobW9kdWxlSWQpO1xuXHRcdGNvbnNvbGVTZXJ2aWNlLmFnZW50Lm5vdGlmeUNvbW1hbmQoXCJkaXNhYmxlXCIsIG1vZHVsZUlkLCBtc2cpO1xuXHRcdGNiKG51bGwsIHByb3RvY29sLlBST19PSyk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc29sZVNlcnZpY2UuZGlzYWJsZShtb2R1bGVJZCk7XG5cdFx0Y2IobnVsbCwgcHJvdG9jb2wuUFJPX09LKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhY2xDb250cm9sKFxuXHRhZ2VudDogTWFzdGVyQWdlbnQgJiBNb25pdG9yQWdlbnQsXG5cdGFjdGlvbjogc3RyaW5nLFxuXHRtZXRob2Q6IHN0cmluZyxcblx0bW9kdWxlSWQ6IHN0cmluZyxcblx0bXNnOiBhbnlcbikge1xuXHRpZiAoYWN0aW9uID09PSBcImV4ZWN1dGVcIikge1xuXHRcdGlmIChtZXRob2QgIT09IFwiY2xpZW50SGFuZGxlclwiIHx8IG1vZHVsZUlkICE9PSBcIl9fY29uc29sZV9fXCIpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGxldCBzaWduYWwgPSBtc2cuc2lnbmFsO1xuXHRcdGlmIChcblx0XHRcdCFzaWduYWwgfHxcblx0XHRcdCEoc2lnbmFsID09PSBcInN0b3BcIiB8fCBzaWduYWwgPT09IFwiYWRkXCIgfHwgc2lnbmFsID09PSBcImtpbGxcIilcblx0XHQpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxuXG5cdGxldCBjbGllbnRJZCA9IG1zZy5jbGllbnRJZDtcblx0aWYgKCFjbGllbnRJZCkge1xuXHRcdHJldHVybiBcIlVua25vdyBjbGllbnRJZFwiO1xuXHR9XG5cblx0bGV0IF9jbGllbnQgPSBhZ2VudC5nZXRDbGllbnRCeUlkKGNsaWVudElkKTtcblx0aWYgKF9jbGllbnQgJiYgX2NsaWVudC5pbmZvICYmIF9jbGllbnQuaW5mby5sZXZlbCkge1xuXHRcdGxldCBsZXZlbCA9IF9jbGllbnQuaW5mby5sZXZlbDtcblx0XHRpZiAobGV2ZWwgPiAxKSB7XG5cdFx0XHRyZXR1cm4gXCJDb21tYW5kIHBlcm1pc3Npb24gZGVuaWVkXCI7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBcIkNsaWVudCBpbmZvIGVycm9yXCI7XG5cdH1cblx0cmV0dXJuIDE7XG59XG5cbi8qKlxuICogQ3JlYXRlIG1hc3RlciBDb25zb2xlU2VydmljZVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIGNvbnN0cnVjdCBwYXJhbWV0ZXJcbiAqICAgICAgICAgICAgICAgICAgICAgIG9wdHMucG9ydCB7U3RyaW5nIHwgTnVtYmVyfSBsaXN0ZW4gcG9ydCBmb3IgbWFzdGVyIGNvbnNvbGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1hc3RlckNvbnNvbGUob3B0czogYW55KSB7XG5cdG9wdHMgPSBvcHRzIHx8IHt9O1xuXHRvcHRzLm1hc3RlciA9IHRydWU7XG5cdHJldHVybiBuZXcgQ29uc29sZVNlcnZpY2Uob3B0cyk7XG59XG5cbi8qKlxuICogQ3JlYXRlIG1vbml0b3IgQ29uc29sZVNlcnZpY2VcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyBjb25zdHJ1Y3QgcGFyYW1ldGVyXG4gKiAgICAgICAgICAgICAgICAgICAgICBvcHRzLnR5cGUge1N0cmluZ30gc2VydmVyIHR5cGUsICdtYXN0ZXInLCAnY29ubmVjdG9yJywgZXRjLlxuICogICAgICAgICAgICAgICAgICAgICAgb3B0cy5pZCB7U3RyaW5nfSBzZXJ2ZXIgaWRcbiAqICAgICAgICAgICAgICAgICAgICAgIG9wdHMuaG9zdCB7U3RyaW5nfSBtYXN0ZXIgc2VydmVyIGhvc3RcbiAqICAgICAgICAgICAgICAgICAgICAgIG9wdHMucG9ydCB7U3RyaW5nIHwgTnVtYmVyfSBtYXN0ZXIgcG9ydFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9uaXRvckNvbnNvbGUob3B0czogYW55KSB7XG5cdHJldHVybiBuZXcgQ29uc29sZVNlcnZpY2Uob3B0cyk7XG59XG4iXX0=