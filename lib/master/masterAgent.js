"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mqttServer_1 = require("../protocol/mqtt/mqttServer");
const logger = require("pomelo-logger").getLogger("pomelo-admin", "MasterAgent");
const protocol = require("../util/protocol");
const utils = require("../util/utils");
const events_1 = require("events");
const masterSocket_1 = require("./masterSocket");
let ST_INITED = 1;
let ST_STARTED = 2;
let ST_CLOSED = 3;
class MasterAgent extends events_1.EventEmitter {
    /**
     * MasterAgent Constructor
     *
     * @class MasterAgent
     * @constructor
     * @param {Object} opts construct parameter
     *                 opts.consoleService {Object} consoleService
     *                 opts.id             {String} server id
     *                 opts.type           {String} server type, 'master', 'connector', etc.
     *                 opts.socket         {Object} socket-io object
     *                 opts.reqId          {Number} reqId add by 1
     *                 opts.callbacks      {Object} callbacks
     *                 opts.state          {Number} MasterAgent state
     * @api public
     */
    constructor(consoleService, opts) {
        super();
        this.consoleService = consoleService;
        this.idMap = {};
        this.state = ST_INITED;
        this.reqId = 1;
        this.idMap = {};
        this.msgMap = {};
        this.typeMap = {};
        this.clients = {};
        this.sockets = {};
        this.slaveMap = {};
        this.server = null;
        this.callbacks = {};
        this.state = ST_INITED;
        this.whitelist = opts.whitelist;
    }
    /**
     * master listen to a port and handle register and request
     *
     * @param {String} port
     * @api public
     */
    listen(port, cb) {
        if (this.state > ST_INITED) {
            logger.error("master agent has started or closed.");
            return;
        }
        this.state = ST_STARTED;
        this.server = new mqttServer_1.MqttServer();
        this.server.listen(port);
        // this.server = sio.listen(port);
        // this.server.set('log level', 0);
        cb = cb || function () { };
        let self = this;
        this.server.on("error", function (err) {
            self.emit("error", err);
            cb(err);
        });
        this.server.once("listening", function () {
            setImmediate(function () {
                cb();
            });
        });
        this.server.on("connection", (socket) => {
            // let id, type, info, registered, username;
            let masterSocket = new masterSocket_1.MasterSocket();
            masterSocket["agent"] = self;
            masterSocket["socket"] = socket;
            self.sockets[socket.id] = socket;
            socket.on("register", function (msg) {
                // register a new connection
                masterSocket.onRegister(msg);
            }); // end of on 'register'
            // message from monitor
            socket.on("monitor", function (msg) {
                masterSocket.onMonitor(msg);
            }); // end of on 'monitor'
            // message from client
            socket.on("client", function (msg) {
                masterSocket.onClient(msg);
            }); // end of on 'client'
            socket.on("reconnect", function (msg) {
                masterSocket.onReconnect(msg);
            });
            socket.on("disconnect", function () {
                masterSocket.onDisconnect();
            });
            socket.on("close", function () {
                masterSocket.onDisconnect();
            });
            socket.on("error", function (err) {
                masterSocket.onError(err);
            });
        }); // end of on 'connection'
    } // end of listen
    /**
     * close master agent
     *
     * @api public
     */
    close() {
        if (this.state > ST_STARTED) {
            return;
        }
        this.state = ST_CLOSED;
        this.server.close();
    }
    /**
     * set module
     *
     * @param {String} moduleId module id/name
     * @param {Object} value module object
     * @api public
     */
    set(moduleId, value) {
        this.consoleService.set(moduleId, value);
    }
    /**
     * get module
     *
     * @param {String} moduleId module id/name
     * @api public
     */
    get(moduleId) {
        return this.consoleService.get(moduleId);
    }
    /**
     * getClientById
     *
     * @param {String} clientId
     * @api public
     */
    getClientById(clientId) {
        return this.clients[clientId];
    }
    /**
     * request monitor{master node} data from monitor
     *
     * @param {String} serverId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @param {Function} callback function
     * @api public
     */
    request(serverId, moduleId, msg, cb) {
        if (this.state > ST_STARTED) {
            return false;
        }
        cb = cb || function () { };
        let curId = this.reqId++;
        this.callbacks[curId] = cb;
        if (!this.msgMap[serverId]) {
            this.msgMap[serverId] = {};
        }
        this.msgMap[serverId][curId] = {
            moduleId: moduleId,
            msg: msg
        };
        let record = this.idMap[serverId];
        if (!record) {
            cb(new Error("unknown server id:" + serverId));
            return false;
        }
        sendToMonitor(record.socket, curId, moduleId, msg);
        return true;
    }
    /**
     * request server data from monitor by serverInfo{host:port}
     *
     * @param {String} serverId
     * @param {Object} serverInfo
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @param {Function} callback function
     * @api public
     */
    requestServer(serverId, serverInfo, moduleId, msg, cb) {
        if (this.state > ST_STARTED) {
            return false;
        }
        let record = this.idMap[serverId];
        if (!record) {
            utils.invokeCallback(cb, new Error("unknown server id:" + serverId));
            return false;
        }
        let curId = this.reqId++;
        this.callbacks[curId] = cb;
        if (utils.compareServer(record, serverInfo)) {
            sendToMonitor(record.socket, curId, moduleId, msg);
        }
        else {
            let slaves = this.slaveMap[serverId];
            for (let i = 0, l = slaves.length; i < l; i++) {
                if (utils.compareServer(slaves[i], serverInfo)) {
                    sendToMonitor(slaves[i].socket, curId, moduleId, msg);
                    break;
                }
            }
        }
        return true;
    }
    /**
     * notify a monitor{master node} by id without callback
     *
     * @param {String} serverId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyById(serverId, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        let record = this.idMap[serverId];
        if (!record) {
            logger.error("fail to notifyById for unknown server id:" + serverId);
            return false;
        }
        sendToMonitor(record.socket, null, moduleId, msg);
        return true;
    }
    /**
     * notify a monitor by server{host:port} without callback
     *
     * @param {String} serverId
     * @param {Object} serverInfo{host:port}
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyByServer(serverId, serverInfo, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        let record = this.idMap[serverId];
        if (!record) {
            logger.error("fail to notifyByServer for unknown server id:" + serverId);
            return false;
        }
        if (utils.compareServer(record, serverInfo)) {
            sendToMonitor(record.socket, null, moduleId, msg);
        }
        else {
            let slaves = this.slaveMap[serverId];
            for (let i = 0, l = slaves.length; i < l; i++) {
                if (utils.compareServer(slaves[i], serverInfo)) {
                    sendToMonitor(slaves[i].socket, null, moduleId, msg);
                    break;
                }
            }
        }
        return true;
    }
    /**
     * notify slaves by id without callback
     *
     * @param {String} serverId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifySlavesById(serverId, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        let slaves = this.slaveMap[serverId];
        if (!slaves || slaves.length === 0) {
            logger.error("fail to notifySlavesById for unknown server id:" + serverId);
            return false;
        }
        broadcastMonitors(slaves, moduleId, msg);
        return true;
    }
    /**
     * notify monitors by type without callback
     *
     * @param {String} type serverType
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyByType(type, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        let list = this.typeMap[type];
        if (!list || list.length === 0) {
            logger.error("fail to notifyByType for unknown server type:" + type);
            return false;
        }
        broadcastMonitors(list, moduleId, msg);
        return true;
    }
    /**
     * notify all the monitors without callback
     *
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyAll(moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        broadcastMonitors(this.idMap, moduleId, msg);
        return true;
    }
    /**
     * notify a client by id without callback
     *
     * @param {String} clientId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @api public
     */
    notifyClient(clientId, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        let record = this.clients[clientId];
        if (!record) {
            logger.error("fail to notifyClient for unknown client id:" + clientId);
            return false;
        }
        sendToClient(record.socket, null, moduleId, msg);
    }
    notifyCommand(command, moduleId, msg) {
        if (this.state > ST_STARTED) {
            return false;
        }
        broadcastCommand(this.idMap, command, moduleId, msg);
        return true;
    }
    doAuthUser(msg, socket, cb) {
        if (!msg.id) {
            // client should has a client id
            return cb(new Error("client should has a client id"));
        }
        let username = msg.username;
        if (!username) {
            // client should auth with username
            doSend(socket, "register", {
                code: protocol.PRO_FAIL,
                msg: "client should auth with username"
            });
            return cb(new Error("client should auth with username"));
        }
        let authUser = this.consoleService.authUser;
        let env = this.consoleService.env;
        authUser(msg, env, (user) => {
            if (!user) {
                // client should auth with username
                doSend(socket, "register", {
                    code: protocol.PRO_FAIL,
                    msg: "client auth failed with username or password error"
                });
                return cb(new Error("client auth failed with username or password error"));
            }
            if (this.clients[msg.id]) {
                doSend(socket, "register", {
                    code: protocol.PRO_FAIL,
                    msg: "id has been registered. id:" + msg.id
                });
                return cb(new Error("id has been registered. id:" + msg.id));
            }
            logger.info("client user : " + username + " login to master");
            this.addConnection(msg.id, msg.type, null, user, socket);
            this.doSend(socket, "register", {
                code: protocol.PRO_OK,
                msg: "ok"
            });
            cb();
        });
    }
    doAuthServer(msg, socket, cb) {
        let self = this;
        let authServer = self.consoleService.authServer;
        let env = self.consoleService.env;
        authServer(msg, env, (status) => {
            if (status !== "ok") {
                doSend(socket, "register", {
                    code: protocol.PRO_FAIL,
                    msg: "server auth failed"
                });
                cb(new Error("server auth failed"));
                return;
            }
            let record = addConnection(self, msg.id, msg.serverType, msg.pid, msg.info, socket);
            doSend(socket, "register", {
                code: protocol.PRO_OK,
                msg: "ok"
            });
            msg.info = msg.info || {};
            msg.info.pid = msg.pid;
            self.emit("register", msg.info);
            cb(null);
        });
    }
    doSend(socket, topic, msg) {
        doSend(socket, topic, msg);
    }
    sendToMonitor(socket, reqId, moduleId, msg) {
        sendToMonitor(socket, reqId, moduleId, msg);
    }
    addConnection(id, type, pid, info, socket) {
        addConnection(this, id, type, pid, info, socket);
    }
    removeConnection(id, type, info) {
        removeConnection(this, id, type, info);
    }
}
exports.MasterAgent = MasterAgent;
/**
 * add monitor,client to connection -- idMap
 *
 * @param {Object} agent agent object
 * @param {String} id
 * @param {String} type serverType
 * @param {Object} socket socket-io object
 * @api private
 */
function addConnection(agent, id, type, pid, info, socket) {
    let record = {
        id: id,
        type: type,
        pid: pid,
        info: info,
        socket: socket
    };
    if (type === "client") {
        agent.clients[id] = record;
    }
    else {
        if (!agent.idMap[id]) {
            agent.idMap[id] = record;
            let list = (agent.typeMap[type] = agent.typeMap[type] || []);
            list.push(record);
        }
        else {
            let slaves = (agent.slaveMap[id] = agent.slaveMap[id] || []);
            slaves.push(record);
        }
    }
    return record;
}
/**
 * remove monitor,client connection -- idMap
 *
 * @param {Object} agent agent object
 * @param {String} id
 * @param {String} type serverType
 * @api private
 */
function removeConnection(agent, id, type, info) {
    if (type === "client") {
        delete agent.clients[id];
    }
    else {
        // remove master node in idMap and typeMap
        let record = agent.idMap[id];
        if (!record) {
            return;
        }
        let _info = record["info"]; // info {host, port}
        if (utils.compareServer(_info, info)) {
            delete agent.idMap[id];
            let list = agent.typeMap[type];
            if (list) {
                for (let i = 0, l = list.length; i < l; i++) {
                    if (list[i].id === id) {
                        list.splice(i, 1);
                        break;
                    }
                }
                if (list.length === 0) {
                    delete agent.typeMap[type];
                }
            }
        }
        else {
            // remove slave node in slaveMap
            let slaves = agent.slaveMap[id];
            if (slaves) {
                for (let i = 0, l = slaves.length; i < l; i++) {
                    if (utils.compareServer(slaves[i]["info"], info)) {
                        slaves.splice(i, 1);
                        break;
                    }
                }
                if (slaves.length === 0) {
                    delete agent.slaveMap[id];
                }
            }
        }
    }
}
/**
 * send msg to monitor
 *
 * @param {Object} socket socket-io object
 * @param {Number} reqId request id
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function sendToMonitor(socket, reqId, moduleId, msg) {
    doSend(socket, "monitor", protocol.composeRequest(reqId, moduleId, msg));
}
/**
 * send msg to client
 *
 * @param {Object} socket socket-io object
 * @param {Number} reqId request id
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function sendToClient(socket, reqId, moduleId, msg) {
    doSend(socket, "client", protocol.composeRequest(reqId, moduleId, msg));
}
function doSend(socket, topic, msg) {
    socket.send(topic, msg);
}
/**
 * broadcast msg to monitor
 *
 * @param {Object} record registered modules
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function broadcastMonitors(records, moduleId, msg) {
    msg = protocol.composeRequest(null, moduleId, msg);
    if (records instanceof Array) {
        for (let i = 0, l = records.length; i < l; i++) {
            let socket = records[i].socket;
            doSend(socket, "monitor", msg);
        }
    }
    else {
        for (let id in records) {
            let socket = records[id].socket;
            doSend(socket, "monitor", msg);
        }
    }
}
function broadcastCommand(records, command, moduleId, msg) {
    msg = protocol.composeCommand(null, command, moduleId, msg);
    if (records instanceof Array) {
        for (let i = 0, l = records.length; i < l; i++) {
            let socket = records[i].socket;
            doSend(socket, "monitor", msg);
        }
    }
    else {
        for (let id in records) {
            let socket = records[id].socket;
            doSend(socket, "monitor", msg);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFzdGVyQWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtYXN0ZXJBZ2VudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDREQUF5RDtBQUV6RCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsU0FBUyxDQUNoRCxjQUFjLEVBQ2QsYUFBYSxDQUNiLENBQUM7QUFFRiw2Q0FBOEM7QUFDOUMsdUNBQXdDO0FBRXhDLG1DQUFzQztBQUN0QyxpREFBOEM7QUFNOUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ2xCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNuQixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFRbEIsaUJBQXlCLFNBQVEscUJBQVk7SUFZNUM7Ozs7Ozs7Ozs7Ozs7O09BY0c7SUFDSCxZQUFxQixjQUFtQixFQUFFLElBQXFCO1FBQzlELEtBQUssRUFBRSxDQUFDO1FBRFksbUJBQWMsR0FBZCxjQUFjLENBQUs7UUExQi9CLFVBQUssR0FBMkIsRUFBRSxDQUFDO1FBU3BDLFVBQUssR0FBRyxTQUFTLENBQUM7UUFtQnpCLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBUSxJQUFJLENBQUM7UUFDeEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7UUFDdkIsSUFBSSxDQUFDLFNB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RyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDUCxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDaEMsTUFBTSxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTXF0dFNlcnZlciB9IGZyb20gXCIuLi9wcm90b2NvbC9tcXR0L21xdHRTZXJ2ZXJcIjtcblxuY29uc3QgbG9nZ2VyID0gcmVxdWlyZShcInBvbWVsby1sb2dnZXJcIikuZ2V0TG9nZ2VyKFxuXHRcInBvbWVsby1hZG1pblwiLFxuXHRcIk1hc3RlckFnZW50XCJcbik7XG5pbXBvcnQgTXF0dENvbiA9IHJlcXVpcmUoXCJtcXR0LWNvbm5lY3Rpb25cIik7XG5pbXBvcnQgcHJvdG9jb2wgPSByZXF1aXJlKFwiLi4vdXRpbC9wcm90b2NvbFwiKTtcbmltcG9ydCB1dGlscyA9IHJlcXVpcmUoXCIuLi91dGlsL3V0aWxzXCIpO1xuaW1wb3J0IFV0aWwgPSByZXF1aXJlKFwidXRpbFwiKTtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCJldmVudHNcIjtcbmltcG9ydCB7IE1hc3RlclNvY2tldCB9IGZyb20gXCIuL21hc3RlclNvY2tldFwiO1xuaW1wb3J0IHsgU2VydmVySW5mbywgU2xhdmVSZWNvcmQgfSBmcm9tIFwiLi4vLi4vaW5kZXhcIjtcbmltcG9ydCB7IE1vbml0b3JBZ2VudCB9IGZyb20gXCIuLi9tb25pdG9yL21vbml0b3JBZ2VudFwiO1xuaW1wb3J0IHsgTXF0dENsaWVudCB9IGZyb20gXCIuLi9wcm90b2NvbC9tcXR0L21xdHRDbGllbnRcIjtcbmltcG9ydCB7IENvbnNvbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29uc29sZVNlcnZpY2UnO1xuXG5sZXQgU1RfSU5JVEVEID0gMTtcbmxldCBTVF9TVEFSVEVEID0gMjtcbmxldCBTVF9DTE9TRUQgPSAzO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1hc3RlckFnZW50T3B0cyB7XG5cdGlkOiBzdHJpbmc7XG5cdHR5cGU6IHN0cmluZztcblx0d2hpdGVsaXN0Pzphbnk7XG59XG5cbmV4cG9ydCBjbGFzcyBNYXN0ZXJBZ2VudCBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG5cdHJlYWRvbmx5IGlkTWFwOiB7IFtpZHg6IHN0cmluZ106IGFueSB9ID0ge307XG5cdHJlYWRvbmx5IG1zZ01hcDogeyBbaWR4OiBzdHJpbmddOiBhbnkgfTtcblx0cmVhZG9ubHkgdHlwZU1hcDogeyBbaWR4OiBzdHJpbmddOiBhbnlbXSB9O1xuXHRyZWFkb25seSBjbGllbnRzOiB7IFtpZHg6IHN0cmluZ106IGFueSB9OyAvL1RPRE9cblx0cmVhZG9ubHkgc29ja2V0czogeyBbaWR4OiBzdHJpbmddOiBNcXR0Q29uIH07XG5cdHJlYWRvbmx5IHNsYXZlTWFwOiB7IFtpZHg6IHN0cmluZ106IFNsYXZlUmVjb3JkW10gfTtcblx0cmVhZG9ubHkgY2FsbGJhY2tzOiB7IFtpZHg6IHN0cmluZ106IEZ1bmN0aW9uIH07XG5cdHJlYWRvbmx5IHdoaXRlbGlzdDogYW55O1xuXHRwcml2YXRlIHNlcnZlcjogTXF0dFNlcnZlcjtcblx0cHJpdmF0ZSBzdGF0ZSA9IFNUX0lOSVRFRDtcblx0cHJpdmF0ZSByZXFJZDogbnVtYmVyO1xuXHQvKipcblx0ICogTWFzdGVyQWdlbnQgQ29uc3RydWN0b3Jcblx0ICpcblx0ICogQGNsYXNzIE1hc3RlckFnZW50XG5cdCAqIEBjb25zdHJ1Y3RvclxuXHQgKiBAcGFyYW0ge09iamVjdH0gb3B0cyBjb25zdHJ1Y3QgcGFyYW1ldGVyXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLmNvbnNvbGVTZXJ2aWNlIHtPYmplY3R9IGNvbnNvbGVTZXJ2aWNlXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLmlkICAgICAgICAgICAgIHtTdHJpbmd9IHNlcnZlciBpZFxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy50eXBlICAgICAgICAgICB7U3RyaW5nfSBzZXJ2ZXIgdHlwZSwgJ21hc3RlcicsICdjb25uZWN0b3InLCBldGMuXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLnNvY2tldCAgICAgICAgIHtPYmplY3R9IHNvY2tldC1pbyBvYmplY3Rcblx0ICogICAgICAgICAgICAgICAgIG9wdHMucmVxSWQgICAgICAgICAge051bWJlcn0gcmVxSWQgYWRkIGJ5IDFcblx0ICogICAgICAgICAgICAgICAgIG9wdHMuY2FsbGJhY2tzICAgICAge09iamVjdH0gY2FsbGJhY2tzXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLnN0YXRlICAgICAgICAgIHtOdW1iZXJ9IE1hc3RlckFnZW50IHN0YXRlXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBjb25zb2xlU2VydmljZTogYW55LCBvcHRzOiBNYXN0ZXJBZ2VudE9wdHMpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVxSWQgPSAxO1xuXHRcdHRoaXMuaWRNYXAgPSB7fTtcblx0XHR0aGlzLm1zZ01hcCA9IHt9O1xuXHRcdHRoaXMudHlwZU1hcCA9IHt9O1xuXHRcdHRoaXMuY2xpZW50cyA9IHt9O1xuXHRcdHRoaXMuc29ja2V0cyA9IHt9O1xuXHRcdHRoaXMuc2xhdmVNYXAgPSB7fTtcblx0XHR0aGlzLnNlcnZlciA9IDxhbnk+bnVsbDtcblx0XHR0aGlzLmNhbGxiYWNrcyA9IHt9O1xuXHRcdHRoaXMuc3RhdGUgPSBTVF9JTklURUQ7XG5cdFx0dGhpcy53aGl0ZWxpc3QgPSBvcHRzLndoaXRlbGlzdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBtYXN0ZXIgbGlzdGVuIHRvIGEgcG9ydCBhbmQgaGFuZGxlIHJlZ2lzdGVyIGFuZCByZXF1ZXN0XG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBwb3J0XG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRsaXN0ZW4ocG9ydDogbnVtYmVyLCBjYjogRnVuY3Rpb24pIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX0lOSVRFRCkge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFwibWFzdGVyIGFnZW50IGhhcyBzdGFydGVkIG9yIGNsb3NlZC5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0ZSA9IFNUX1NUQVJURUQ7XG5cdFx0dGhpcy5zZXJ2ZXIgPSBuZXcgTXF0dFNlcnZlcigpO1xuXHRcdHRoaXMuc2VydmVyLmxpc3Rlbihwb3J0KTtcblx0XHQvLyB0aGlzLnNlcnZlciA9IHNpby5saXN0ZW4ocG9ydCk7XG5cdFx0Ly8gdGhpcy5zZXJ2ZXIuc2V0KCdsb2cgbGV2ZWwnLCAwKTtcblxuXHRcdGNiID0gY2IgfHwgZnVuY3Rpb24oKSB7fTtcblxuXHRcdGxldCBzZWxmID0gdGhpcztcblx0XHR0aGlzLnNlcnZlci5vbihcImVycm9yXCIsIGZ1bmN0aW9uKGVycikge1xuXHRcdFx0c2VsZi5lbWl0KFwiZXJyb3JcIiwgZXJyKTtcblx0XHRcdGNiKGVycik7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNlcnZlci5vbmNlKFwibGlzdGVuaW5nXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0c2V0SW1tZWRpYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRjYigpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNlcnZlci5vbihcImNvbm5lY3Rpb25cIiwgKHNvY2tldDogTXF0dENvbikgPT4ge1xuXHRcdFx0Ly8gbGV0IGlkLCB0eXBlLCBpbmZvLCByZWdpc3RlcmVkLCB1c2VybmFtZTtcblx0XHRcdGxldCBtYXN0ZXJTb2NrZXQgPSBuZXcgTWFzdGVyU29ja2V0KCk7XG5cdFx0XHRtYXN0ZXJTb2NrZXRbXCJhZ2VudFwiXSA9IHNlbGY7XG5cdFx0XHRtYXN0ZXJTb2NrZXRbXCJzb2NrZXRcIl0gPSBzb2NrZXQ7XG5cblx0XHRcdHNlbGYuc29ja2V0c1tzb2NrZXQuaWRdID0gc29ja2V0O1xuXG5cdFx0XHRzb2NrZXQub24oXCJyZWdpc3RlclwiLCBmdW5jdGlvbihtc2cpIHtcblx0XHRcdFx0Ly8gcmVnaXN0ZXIgYSBuZXcgY29ubmVjdGlvblxuXHRcdFx0XHRtYXN0ZXJTb2NrZXQub25SZWdpc3Rlcihtc2cpO1xuXHRcdFx0fSk7IC8vIGVuZCBvZiBvbiAncmVnaXN0ZXInXG5cblx0XHRcdC8vIG1lc3NhZ2UgZnJvbSBtb25pdG9yXG5cdFx0XHRzb2NrZXQub24oXCJtb25pdG9yXCIsIGZ1bmN0aW9uKG1zZykge1xuXHRcdFx0XHRtYXN0ZXJTb2NrZXQub25Nb25pdG9yKG1zZyk7XG5cdFx0XHR9KTsgLy8gZW5kIG9mIG9uICdtb25pdG9yJ1xuXG5cdFx0XHQvLyBtZXNzYWdlIGZyb20gY2xpZW50XG5cdFx0XHRzb2NrZXQub24oXCJjbGllbnRcIiwgZnVuY3Rpb24obXNnKSB7XG5cdFx0XHRcdG1hc3RlclNvY2tldC5vbkNsaWVudChtc2cpO1xuXHRcdFx0fSk7IC8vIGVuZCBvZiBvbiAnY2xpZW50J1xuXG5cdFx0XHRzb2NrZXQub24oXCJyZWNvbm5lY3RcIiwgZnVuY3Rpb24obXNnKSB7XG5cdFx0XHRcdG1hc3RlclNvY2tldC5vblJlY29ubmVjdChtc2cpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNvY2tldC5vbihcImRpc2Nvbm5lY3RcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdG1hc3RlclNvY2tldC5vbkRpc2Nvbm5lY3QoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzb2NrZXQub24oXCJjbG9zZVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0bWFzdGVyU29ja2V0Lm9uRGlzY29ubmVjdCgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNvY2tldC5vbihcImVycm9yXCIsIGZ1bmN0aW9uKGVycikge1xuXHRcdFx0XHRtYXN0ZXJTb2NrZXQub25FcnJvcihlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7IC8vIGVuZCBvZiBvbiAnY29ubmVjdGlvbidcblx0fSAvLyBlbmQgb2YgbGlzdGVuXG5cblx0LyoqXG5cdCAqIGNsb3NlIG1hc3RlciBhZ2VudFxuXHQgKlxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0Y2xvc2UoKSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPiBTVF9TVEFSVEVEKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc3RhdGUgPSBTVF9DTE9TRUQ7XG5cdFx0dGhpcy5zZXJ2ZXIuY2xvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBzZXQgbW9kdWxlXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAcGFyYW0ge09iamVjdH0gdmFsdWUgbW9kdWxlIG9iamVjdFxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0c2V0KG1vZHVsZUlkOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcblx0XHR0aGlzLmNvbnNvbGVTZXJ2aWNlLnNldChtb2R1bGVJZCwgdmFsdWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIGdldCBtb2R1bGVcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRnZXQobW9kdWxlSWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmNvbnNvbGVTZXJ2aWNlLmdldChtb2R1bGVJZCk7XG5cdH1cblxuXHQvKipcblx0ICogZ2V0Q2xpZW50QnlJZFxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gY2xpZW50SWRcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdGdldENsaWVudEJ5SWQoY2xpZW50SWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmNsaWVudHNbY2xpZW50SWRdO1xuXHR9XG5cblx0LyoqXG5cdCAqIHJlcXVlc3QgbW9uaXRvcnttYXN0ZXIgbm9kZX0gZGF0YSBmcm9tIG1vbml0b3Jcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IHNlcnZlcklkXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAcGFyYW0ge09iamVjdH0gbXNnXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGZ1bmN0aW9uXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRyZXF1ZXN0KHNlcnZlcklkOiBzdHJpbmcsIG1vZHVsZUlkOiBzdHJpbmcsIG1zZzogYW55LCBjYjogRnVuY3Rpb24pIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjYiA9IGNiIHx8IGZ1bmN0aW9uKCkge307XG5cblx0XHRsZXQgY3VySWQgPSB0aGlzLnJlcUlkKys7XG5cdFx0dGhpcy5jYWxsYmFja3NbY3VySWRdID0gY2I7XG5cblx0XHRpZiAoIXRoaXMubXNnTWFwW3NlcnZlcklkXSkge1xuXHRcdFx0dGhpcy5tc2dNYXBbc2VydmVySWRdID0ge307XG5cdFx0fVxuXG5cdFx0dGhpcy5tc2dNYXBbc2VydmVySWRdW2N1cklkXSA9IHtcblx0XHRcdG1vZHVsZUlkOiBtb2R1bGVJZCxcblx0XHRcdG1zZzogbXNnXG5cdFx0fTtcblxuXHRcdGxldCByZWNvcmQgPSB0aGlzLmlkTWFwW3NlcnZlcklkXTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0Y2IobmV3IEVycm9yKFwidW5rbm93biBzZXJ2ZXIgaWQ6XCIgKyBzZXJ2ZXJJZCkpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHNlbmRUb01vbml0b3IocmVjb3JkLnNvY2tldCwgY3VySWQsIG1vZHVsZUlkLCBtc2cpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogcmVxdWVzdCBzZXJ2ZXIgZGF0YSBmcm9tIG1vbml0b3IgYnkgc2VydmVySW5mb3tob3N0OnBvcnR9XG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzZXJ2ZXJJZFxuXHQgKiBAcGFyYW0ge09iamVjdH0gc2VydmVySW5mb1xuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgbW9kdWxlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IG1zZ1xuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvblxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0cmVxdWVzdFNlcnZlcihcblx0XHRzZXJ2ZXJJZDogc3RyaW5nLFxuXHRcdHNlcnZlckluZm86IFNlcnZlckluZm8sXG5cdFx0bW9kdWxlSWQ6IHN0cmluZyxcblx0XHRtc2c6IGFueSxcblx0XHRjYjogRnVuY3Rpb25cblx0KSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPiBTVF9TVEFSVEVEKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IHJlY29yZCA9IHRoaXMuaWRNYXBbc2VydmVySWRdO1xuXHRcdGlmICghcmVjb3JkKSB7XG5cdFx0XHR1dGlscy5pbnZva2VDYWxsYmFjayhcblx0XHRcdFx0Y2IsXG5cdFx0XHRcdG5ldyBFcnJvcihcInVua25vd24gc2VydmVyIGlkOlwiICsgc2VydmVySWQpXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBjdXJJZCA9IHRoaXMucmVxSWQrKztcblx0XHR0aGlzLmNhbGxiYWNrc1tjdXJJZF0gPSBjYjtcblxuXHRcdGlmICh1dGlscy5jb21wYXJlU2VydmVyKHJlY29yZCwgc2VydmVySW5mbykpIHtcblx0XHRcdHNlbmRUb01vbml0b3IocmVjb3JkLnNvY2tldCwgY3VySWQsIG1vZHVsZUlkLCBtc2cpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgc2xhdmVzID0gdGhpcy5zbGF2ZU1hcFtzZXJ2ZXJJZF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbCA9IHNsYXZlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdFx0aWYgKHV0aWxzLmNvbXBhcmVTZXJ2ZXIoc2xhdmVzW2ldLCBzZXJ2ZXJJbmZvKSkge1xuXHRcdFx0XHRcdHNlbmRUb01vbml0b3Ioc2xhdmVzW2ldLnNvY2tldCwgY3VySWQsIG1vZHVsZUlkLCBtc2cpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogbm90aWZ5IGEgbW9uaXRvcnttYXN0ZXIgbm9kZX0gYnkgaWQgd2l0aG91dCBjYWxsYmFja1xuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc2VydmVySWRcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2dcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdG5vdGlmeUJ5SWQoc2VydmVySWQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgcmVjb3JkID0gdGhpcy5pZE1hcFtzZXJ2ZXJJZF07XG5cdFx0aWYgKCFyZWNvcmQpIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcblx0XHRcdFx0XCJmYWlsIHRvIG5vdGlmeUJ5SWQgZm9yIHVua25vd24gc2VydmVyIGlkOlwiICsgc2VydmVySWRcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0c2VuZFRvTW9uaXRvcihyZWNvcmQuc29ja2V0LCBudWxsISwgbW9kdWxlSWQsIG1zZyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBub3RpZnkgYSBtb25pdG9yIGJ5IHNlcnZlcntob3N0OnBvcnR9IHdpdGhvdXQgY2FsbGJhY2tcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IHNlcnZlcklkXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBzZXJ2ZXJJbmZve2hvc3Q6cG9ydH1cblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2dcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdG5vdGlmeUJ5U2VydmVyKFxuXHRcdHNlcnZlcklkOiBzdHJpbmcsXG5cdFx0c2VydmVySW5mbzogU2VydmVySW5mbyxcblx0XHRtb2R1bGVJZDogc3RyaW5nLFxuXHRcdG1zZzogYW55XG5cdCkge1xuXHRcdGlmICh0aGlzLnN0YXRlID4gU1RfU1RBUlRFRCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCByZWNvcmQgPSB0aGlzLmlkTWFwW3NlcnZlcklkXTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFxuXHRcdFx0XHRcImZhaWwgdG8gbm90aWZ5QnlTZXJ2ZXIgZm9yIHVua25vd24gc2VydmVyIGlkOlwiICsgc2VydmVySWRcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHV0aWxzLmNvbXBhcmVTZXJ2ZXIocmVjb3JkLCBzZXJ2ZXJJbmZvKSkge1xuXHRcdFx0c2VuZFRvTW9uaXRvcihyZWNvcmQuc29ja2V0LCBudWxsISwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBzbGF2ZXMgPSB0aGlzLnNsYXZlTWFwW3NlcnZlcklkXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsID0gc2xhdmVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0XHRpZiAodXRpbHMuY29tcGFyZVNlcnZlcihzbGF2ZXNbaV0sIHNlcnZlckluZm8pKSB7XG5cdFx0XHRcdFx0c2VuZFRvTW9uaXRvcihzbGF2ZXNbaV0uc29ja2V0LCBudWxsISwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogbm90aWZ5IHNsYXZlcyBieSBpZCB3aXRob3V0IGNhbGxiYWNrXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzZXJ2ZXJJZFxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgbW9kdWxlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IG1zZ1xuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0bm90aWZ5U2xhdmVzQnlJZChzZXJ2ZXJJZDogc3RyaW5nLCBtb2R1bGVJZDogc3RyaW5nLCBtc2c6IGFueSkge1xuXHRcdGlmICh0aGlzLnN0YXRlID4gU1RfU1RBUlRFRCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBzbGF2ZXMgPSB0aGlzLnNsYXZlTWFwW3NlcnZlcklkXTtcblx0XHRpZiAoIXNsYXZlcyB8fCBzbGF2ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXG5cdFx0XHRcdFwiZmFpbCB0byBub3RpZnlTbGF2ZXNCeUlkIGZvciB1bmtub3duIHNlcnZlciBpZDpcIiArIHNlcnZlcklkXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGJyb2FkY2FzdE1vbml0b3JzKHNsYXZlcywgbW9kdWxlSWQsIG1zZyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogbm90aWZ5IG1vbml0b3JzIGJ5IHR5cGUgd2l0aG91dCBjYWxsYmFja1xuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBzZXJ2ZXJUeXBlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAcGFyYW0ge09iamVjdH0gbXNnXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRub3RpZnlCeVR5cGUodHlwZTogc3RyaW5nLCBtb2R1bGVJZDogc3RyaW5nLCBtc2c6IGFueSkge1xuXHRcdGlmICh0aGlzLnN0YXRlID4gU1RfU1RBUlRFRCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBsaXN0ID0gdGhpcy50eXBlTWFwW3R5cGVdO1xuXHRcdGlmICghbGlzdCB8fCBsaXN0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFxuXHRcdFx0XHRcImZhaWwgdG8gbm90aWZ5QnlUeXBlIGZvciB1bmtub3duIHNlcnZlciB0eXBlOlwiICsgdHlwZVxuXHRcdFx0KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0YnJvYWRjYXN0TW9uaXRvcnMobGlzdCwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogbm90aWZ5IGFsbCB0aGUgbW9uaXRvcnMgd2l0aG91dCBjYWxsYmFja1xuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgbW9kdWxlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IG1zZ1xuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0bm90aWZ5QWxsKG1vZHVsZUlkOiBzdHJpbmcsIG1zZz86IGFueSkge1xuXHRcdGlmICh0aGlzLnN0YXRlID4gU1RfU1RBUlRFRCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRicm9hZGNhc3RNb25pdG9ycyh0aGlzLmlkTWFwLCBtb2R1bGVJZCwgbXNnKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBub3RpZnkgYSBjbGllbnQgYnkgaWQgd2l0aG91dCBjYWxsYmFja1xuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gY2xpZW50SWRcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2dcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdG5vdGlmeUNsaWVudChjbGllbnRJZDogc3RyaW5nLCBtb2R1bGVJZDogc3RyaW5nLCBtc2c6IGFueSkge1xuXHRcdGlmICh0aGlzLnN0YXRlID4gU1RfU1RBUlRFRCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCByZWNvcmQgPSB0aGlzLmNsaWVudHNbY2xpZW50SWRdO1xuXHRcdGlmICghcmVjb3JkKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXG5cdFx0XHRcdFwiZmFpbCB0byBub3RpZnlDbGllbnQgZm9yIHVua25vd24gY2xpZW50IGlkOlwiICsgY2xpZW50SWRcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHNlbmRUb0NsaWVudChyZWNvcmQuc29ja2V0LCBudWxsISwgbW9kdWxlSWQsIG1zZyk7XG5cdH1cblxuXHRub3RpZnlDb21tYW5kKGNvbW1hbmQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0YnJvYWRjYXN0Q29tbWFuZCh0aGlzLmlkTWFwLCBjb21tYW5kLCBtb2R1bGVJZCwgbXNnKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGRvQXV0aFVzZXIobXNnOiBhbnksIHNvY2tldDogTXF0dENvbiwgY2I6IEZ1bmN0aW9uKSB7XG5cdFx0aWYgKCFtc2cuaWQpIHtcblx0XHRcdC8vIGNsaWVudCBzaG91bGQgaGFzIGEgY2xpZW50IGlkXG5cdFx0XHRyZXR1cm4gY2IobmV3IEVycm9yKFwiY2xpZW50IHNob3VsZCBoYXMgYSBjbGllbnQgaWRcIikpO1xuXHRcdH1cblxuXHRcdGxldCB1c2VybmFtZSA9IG1zZy51c2VybmFtZTtcblx0XHRpZiAoIXVzZXJuYW1lKSB7XG5cdFx0XHQvLyBjbGllbnQgc2hvdWxkIGF1dGggd2l0aCB1c2VybmFtZVxuXHRcdFx0ZG9TZW5kKHNvY2tldCwgXCJyZWdpc3RlclwiLCB7XG5cdFx0XHRcdGNvZGU6IHByb3RvY29sLlBST19GQUlMLFxuXHRcdFx0XHRtc2c6IFwiY2xpZW50IHNob3VsZCBhdXRoIHdpdGggdXNlcm5hbWVcIlxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gY2IobmV3IEVycm9yKFwiY2xpZW50IHNob3VsZCBhdXRoIHdpdGggdXNlcm5hbWVcIikpO1xuXHRcdH1cblxuXHRcdGxldCBhdXRoVXNlciA9IHRoaXMuY29uc29sZVNlcnZpY2UuYXV0aFVzZXI7XG5cdFx0bGV0IGVudiA9IHRoaXMuY29uc29sZVNlcnZpY2UuZW52O1xuXHRcdGF1dGhVc2VyKG1zZywgZW52LCAodXNlcjogYW55KSA9PiB7XG5cdFx0XHRpZiAoIXVzZXIpIHtcblx0XHRcdFx0Ly8gY2xpZW50IHNob3VsZCBhdXRoIHdpdGggdXNlcm5hbWVcblx0XHRcdFx0ZG9TZW5kKHNvY2tldCwgXCJyZWdpc3RlclwiLCB7XG5cdFx0XHRcdFx0Y29kZTogcHJvdG9jb2wuUFJPX0ZBSUwsXG5cdFx0XHRcdFx0bXNnOiBcImNsaWVudCBhdXRoIGZhaWxlZCB3aXRoIHVzZXJuYW1lIG9yIHBhc3N3b3JkIGVycm9yXCJcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBjYihcblx0XHRcdFx0XHRuZXcgRXJyb3IoXG5cdFx0XHRcdFx0XHRcImNsaWVudCBhdXRoIGZhaWxlZCB3aXRoIHVzZXJuYW1lIG9yIHBhc3N3b3JkIGVycm9yXCJcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmNsaWVudHNbbXNnLmlkXSkge1xuXHRcdFx0XHRkb1NlbmQoc29ja2V0LCBcInJlZ2lzdGVyXCIsIHtcblx0XHRcdFx0XHRjb2RlOiBwcm90b2NvbC5QUk9fRkFJTCxcblx0XHRcdFx0XHRtc2c6IFwiaWQgaGFzIGJlZW4gcmVnaXN0ZXJlZC4gaWQ6XCIgKyBtc2cuaWRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBjYihuZXcgRXJyb3IoXCJpZCBoYXMgYmVlbiByZWdpc3RlcmVkLiBpZDpcIiArIG1zZy5pZCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRsb2dnZXIuaW5mbyhcImNsaWVudCB1c2VyIDogXCIgKyB1c2VybmFtZSArIFwiIGxvZ2luIHRvIG1hc3RlclwiKTtcblx0XHRcdHRoaXMuYWRkQ29ubmVjdGlvbihtc2cuaWQsIG1zZy50eXBlLCBudWxsISwgdXNlciwgc29ja2V0KTtcblx0XHRcdHRoaXMuZG9TZW5kKHNvY2tldCwgXCJyZWdpc3RlclwiLCB7XG5cdFx0XHRcdGNvZGU6IHByb3RvY29sLlBST19PSyxcblx0XHRcdFx0bXNnOiBcIm9rXCJcblx0XHRcdH0pO1xuXG5cdFx0XHRjYigpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZG9BdXRoU2VydmVyKG1zZzogYW55LCBzb2NrZXQ6IE1xdHRDb24sIGNiOiBGdW5jdGlvbikge1xuXHRcdGxldCBzZWxmID0gdGhpcztcblx0XHRsZXQgYXV0aFNlcnZlciA9IHNlbGYuY29uc29sZVNlcnZpY2UuYXV0aFNlcnZlcjtcblx0XHRsZXQgZW52ID0gc2VsZi5jb25zb2xlU2VydmljZS5lbnY7XG5cdFx0YXV0aFNlcnZlcihtc2csIGVudiwgKHN0YXR1czogYW55KSA9PiB7XG5cdFx0XHRpZiAoc3RhdHVzICE9PSBcIm9rXCIpIHtcblx0XHRcdFx0ZG9TZW5kKHNvY2tldCwgXCJyZWdpc3RlclwiLCB7XG5cdFx0XHRcdFx0Y29kZTogcHJvdG9jb2wuUFJPX0ZBSUwsXG5cdFx0XHRcdFx0bXNnOiBcInNlcnZlciBhdXRoIGZhaWxlZFwiXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjYihuZXcgRXJyb3IoXCJzZXJ2ZXIgYXV0aCBmYWlsZWRcIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCByZWNvcmQgPSBhZGRDb25uZWN0aW9uKFxuXHRcdFx0XHRzZWxmLFxuXHRcdFx0XHRtc2cuaWQsXG5cdFx0XHRcdG1zZy5zZXJ2ZXJUeXBlLFxuXHRcdFx0XHRtc2cucGlkLFxuXHRcdFx0XHRtc2cuaW5mbyxcblx0XHRcdFx0c29ja2V0XG5cdFx0XHQpO1xuXG5cdFx0XHRkb1NlbmQoc29ja2V0LCBcInJlZ2lzdGVyXCIsIHtcblx0XHRcdFx0Y29kZTogcHJvdG9jb2wuUFJPX09LLFxuXHRcdFx0XHRtc2c6IFwib2tcIlxuXHRcdFx0fSk7XG5cdFx0XHRtc2cuaW5mbyA9IG1zZy5pbmZvIHx8IHt9O1xuXHRcdFx0bXNnLmluZm8ucGlkID0gbXNnLnBpZDtcblx0XHRcdHNlbGYuZW1pdChcInJlZ2lzdGVyXCIsIG1zZy5pbmZvKTtcblx0XHRcdGNiKG51bGwpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZG9TZW5kKHNvY2tldDogTXF0dENvbiwgdG9waWM6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHRkb1NlbmQoc29ja2V0LCB0b3BpYywgbXNnKTtcblx0fVxuXG5cdHNlbmRUb01vbml0b3Ioc29ja2V0OiBNcXR0Q29uLCByZXFJZDogbnVtYmVyLCBtb2R1bGVJZDogc3RyaW5nLCBtc2c6IGFueSkge1xuXHRcdHNlbmRUb01vbml0b3Ioc29ja2V0LCByZXFJZCwgbW9kdWxlSWQsIG1zZyk7XG5cdH1cblxuXHRhZGRDb25uZWN0aW9uKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0dHlwZTogc3RyaW5nLFxuXHRcdHBpZDogbnVtYmVyLFxuXHRcdGluZm86IFNlcnZlckluZm8sXG5cdFx0c29ja2V0OiBNcXR0Q29uXG5cdCkge1xuXHRcdGFkZENvbm5lY3Rpb24odGhpcywgaWQsIHR5cGUsIHBpZCwgaW5mbywgc29ja2V0KTtcblx0fVxuXG5cdHJlbW92ZUNvbm5lY3Rpb24oaWQ6IHN0cmluZywgdHlwZTogc3RyaW5nLCBpbmZvOiBTZXJ2ZXJJbmZvKSB7XG5cdFx0cmVtb3ZlQ29ubmVjdGlvbih0aGlzLCBpZCwgdHlwZSwgaW5mbyk7XG5cdH1cbn1cblxuLyoqXG4gKiBhZGQgbW9uaXRvcixjbGllbnQgdG8gY29ubmVjdGlvbiAtLSBpZE1hcFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhZ2VudCBhZ2VudCBvYmplY3RcbiAqIEBwYXJhbSB7U3RyaW5nfSBpZFxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgc2VydmVyVHlwZVxuICogQHBhcmFtIHtPYmplY3R9IHNvY2tldCBzb2NrZXQtaW8gb2JqZWN0XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gYWRkQ29ubmVjdGlvbihcblx0YWdlbnQ6IE1hc3RlckFnZW50LFxuXHRpZDogc3RyaW5nLFxuXHR0eXBlOiBzdHJpbmcsXG5cdHBpZDogbnVtYmVyLFxuXHRpbmZvOiBTZXJ2ZXJJbmZvLFxuXHRzb2NrZXQ6IE1xdHRDb25cbikge1xuXHRsZXQgcmVjb3JkID0ge1xuXHRcdGlkOiBpZCxcblx0XHR0eXBlOiB0eXBlLFxuXHRcdHBpZDogcGlkLFxuXHRcdGluZm86IGluZm8sXG5cdFx0c29ja2V0OiBzb2NrZXRcblx0fTtcblx0aWYgKHR5cGUgPT09IFwiY2xpZW50XCIpIHtcblx0XHRhZ2VudC5jbGllbnRzW2lkXSA9IHJlY29yZDtcblx0fSBlbHNlIHtcblx0XHRpZiAoIWFnZW50LmlkTWFwW2lkXSkge1xuXHRcdFx0YWdlbnQuaWRNYXBbaWRdID0gcmVjb3JkO1xuXHRcdFx0bGV0IGxpc3QgPSAoYWdlbnQudHlwZU1hcFt0eXBlXSA9IGFnZW50LnR5cGVNYXBbdHlwZV0gfHwgW10pO1xuXHRcdFx0bGlzdC5wdXNoKHJlY29yZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBzbGF2ZXMgPSAoYWdlbnQuc2xhdmVNYXBbaWRdID0gYWdlbnQuc2xhdmVNYXBbaWRdIHx8IFtdKTtcblx0XHRcdHNsYXZlcy5wdXNoKHJlY29yZCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZWNvcmQ7XG59XG5cbi8qKlxuICogcmVtb3ZlIG1vbml0b3IsY2xpZW50IGNvbm5lY3Rpb24gLS0gaWRNYXBcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYWdlbnQgYWdlbnQgb2JqZWN0XG4gKiBAcGFyYW0ge1N0cmluZ30gaWRcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIHNlcnZlclR5cGVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiByZW1vdmVDb25uZWN0aW9uKFxuXHRhZ2VudDogTWFzdGVyQWdlbnQsXG5cdGlkOiBzdHJpbmcsXG5cdHR5cGU6IHN0cmluZyxcblx0aW5mbzogU2VydmVySW5mb1xuKSB7XG5cdGlmICh0eXBlID09PSBcImNsaWVudFwiKSB7XG5cdFx0ZGVsZXRlICg8YW55PmFnZW50KS5jbGllbnRzW2lkXTtcblx0fSBlbHNlIHtcblx0XHQvLyByZW1vdmUgbWFzdGVyIG5vZGUgaW4gaWRNYXAgYW5kIHR5cGVNYXBcblx0XHRsZXQgcmVjb3JkID0gYWdlbnQuaWRNYXBbaWRdO1xuXHRcdGlmICghcmVjb3JkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBfaW5mbyA9IHJlY29yZFtcImluZm9cIl07IC8vIGluZm8ge2hvc3QsIHBvcnR9XG5cdFx0aWYgKHV0aWxzLmNvbXBhcmVTZXJ2ZXIoX2luZm8sIGluZm8pKSB7XG5cdFx0XHRkZWxldGUgYWdlbnQuaWRNYXBbaWRdO1xuXHRcdFx0bGV0IGxpc3QgPSBhZ2VudC50eXBlTWFwW3R5cGVdO1xuXHRcdFx0aWYgKGxpc3QpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGwgPSBsaXN0Lmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0XHRcdGlmIChsaXN0W2ldLmlkID09PSBpZCkge1xuXHRcdFx0XHRcdFx0bGlzdC5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGFnZW50LnR5cGVNYXBbdHlwZV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gcmVtb3ZlIHNsYXZlIG5vZGUgaW4gc2xhdmVNYXBcblx0XHRcdGxldCBzbGF2ZXMgPSBhZ2VudC5zbGF2ZU1hcFtpZF07XG5cdFx0XHRpZiAoc2xhdmVzKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsID0gc2xhdmVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0XHRcdGlmICh1dGlscy5jb21wYXJlU2VydmVyKHNsYXZlc1tpXVtcImluZm9cIl0sIGluZm8pKSB7XG5cdFx0XHRcdFx0XHRzbGF2ZXMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzbGF2ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGFnZW50LnNsYXZlTWFwW2lkXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuLyoqXG4gKiBzZW5kIG1zZyB0byBtb25pdG9yXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHNvY2tldCBzb2NrZXQtaW8gb2JqZWN0XG4gKiBAcGFyYW0ge051bWJlcn0gcmVxSWQgcmVxdWVzdCBpZFxuICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG4gKiBAcGFyYW0ge09iamVjdH0gbXNnIG1lc3NhZ2VcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBzZW5kVG9Nb25pdG9yKFxuXHRzb2NrZXQ6IE1xdHRDb24sXG5cdHJlcUlkOiBudW1iZXIsXG5cdG1vZHVsZUlkOiBzdHJpbmcsXG5cdG1zZzogYW55XG4pIHtcblx0ZG9TZW5kKHNvY2tldCwgXCJtb25pdG9yXCIsIHByb3RvY29sLmNvbXBvc2VSZXF1ZXN0KHJlcUlkLCBtb2R1bGVJZCwgbXNnKSk7XG59XG5cbi8qKlxuICogc2VuZCBtc2cgdG8gY2xpZW50XG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHNvY2tldCBzb2NrZXQtaW8gb2JqZWN0XG4gKiBAcGFyYW0ge051bWJlcn0gcmVxSWQgcmVxdWVzdCBpZFxuICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG4gKiBAcGFyYW0ge09iamVjdH0gbXNnIG1lc3NhZ2VcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBzZW5kVG9DbGllbnQoXG5cdHNvY2tldDogTXF0dENvbixcblx0cmVxSWQ6IG51bWJlcixcblx0bW9kdWxlSWQ6IHN0cmluZyxcblx0bXNnOiBhbnlcbikge1xuXHRkb1NlbmQoc29ja2V0LCBcImNsaWVudFwiLCBwcm90b2NvbC5jb21wb3NlUmVxdWVzdChyZXFJZCwgbW9kdWxlSWQsIG1zZykpO1xufVxuXG5mdW5jdGlvbiBkb1NlbmQoc29ja2V0OiBNcXR0Q29uLCB0b3BpYzogc3RyaW5nLCBtc2c6IGFueSkge1xuXHRzb2NrZXQuc2VuZCh0b3BpYywgbXNnKTtcbn1cblxuLyoqXG4gKiBicm9hZGNhc3QgbXNnIHRvIG1vbml0b3JcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcmVjb3JkIHJlZ2lzdGVyZWQgbW9kdWxlc1xuICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG4gKiBAcGFyYW0ge09iamVjdH0gbXNnIG1lc3NhZ2VcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBicm9hZGNhc3RNb25pdG9ycyhyZWNvcmRzOiBhbnksIG1vZHVsZUlkOiBzdHJpbmcsIG1zZzogYW55KSB7XG5cdG1zZyA9IHByb3RvY29sLmNvbXBvc2VSZXF1ZXN0KG51bGwhLCBtb2R1bGVJZCwgbXNnKTtcblxuXHRpZiAocmVjb3JkcyBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGwgPSByZWNvcmRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0bGV0IHNvY2tldCA9IHJlY29yZHNbaV0uc29ja2V0O1xuXHRcdFx0ZG9TZW5kKHNvY2tldCwgXCJtb25pdG9yXCIsIG1zZyk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGZvciAobGV0IGlkIGluIHJlY29yZHMpIHtcblx0XHRcdGxldCBzb2NrZXQ6IGFueSA9IHJlY29yZHNbaWRdLnNvY2tldDtcblx0XHRcdGRvU2VuZChzb2NrZXQsIFwibW9uaXRvclwiLCBtc2cpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBicm9hZGNhc3RDb21tYW5kKFxuXHRyZWNvcmRzOiBhbnksXG5cdGNvbW1hbmQ6IHN0cmluZyxcblx0bW9kdWxlSWQ6IHN0cmluZyxcblx0bXNnOiBhbnlcbikge1xuXHRtc2cgPSBwcm90b2NvbC5jb21wb3NlQ29tbWFuZChudWxsISwgY29tbWFuZCwgbW9kdWxlSWQsIG1zZyk7XG5cblx0aWYgKHJlY29yZHMgaW5zdGFuY2VvZiBBcnJheSkge1xuXHRcdGZvciAobGV0IGkgPSAwLCBsID0gcmVjb3Jkcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdGxldCBzb2NrZXQgPSByZWNvcmRzW2ldLnNvY2tldDtcblx0XHRcdGRvU2VuZChzb2NrZXQsIFwibW9uaXRvclwiLCBtc2cpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRmb3IgKGxldCBpZCBpbiByZWNvcmRzKSB7XG5cdFx0XHRsZXQgc29ja2V0ID0gcmVjb3Jkc1tpZF0uc29ja2V0O1xuXHRcdFx0ZG9TZW5kKHNvY2tldCwgXCJtb25pdG9yXCIsIG1zZyk7XG5cdFx0fVxuXHR9XG59XG4iXX0=