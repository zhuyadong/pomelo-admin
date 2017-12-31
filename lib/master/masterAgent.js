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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFzdGVyQWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtYXN0ZXJBZ2VudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDREQUF5RDtBQUV6RCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsU0FBUyxDQUNoRCxjQUFjLEVBQ2QsYUFBYSxDQUNiLENBQUM7QUFFRiw2Q0FBOEM7QUFDOUMsdUNBQXdDO0FBRXhDLG1DQUFzQztBQUN0QyxpREFBOEM7QUFLOUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ2xCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNuQixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFhbEIsaUJBQXlCLFNBQVEscUJBQVk7SUFZNUM7Ozs7Ozs7Ozs7Ozs7O09BY0c7SUFDSCxZQUFxQixjQUFtQixFQUFFLElBQXFCO1FBQzlELEtBQUssRUFBRSxDQUFDO1FBRFksbUJBQWMsR0FBZCxjQUFjLENBQUs7UUExQi9CLFVBQUssR0FBMkIsRUFBRSxDQUFDO1FBU3BDLFVBQUssR0FBRyxTQUFTLENBQUM7UUFtQnpCLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBUSxJQUFJLENBQUM7UUFDeEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7UUFDdkIsSUFBSSxDQUFDLFNB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RyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDUCxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDaEMsTUFBTSxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTXF0dFNlcnZlciB9IGZyb20gXCIuLi9wcm90b2NvbC9tcXR0L21xdHRTZXJ2ZXJcIjtcblxuY29uc3QgbG9nZ2VyID0gcmVxdWlyZShcInBvbWVsby1sb2dnZXJcIikuZ2V0TG9nZ2VyKFxuXHRcInBvbWVsby1hZG1pblwiLFxuXHRcIk1hc3RlckFnZW50XCJcbik7XG5pbXBvcnQgTXF0dENvbiA9IHJlcXVpcmUoXCJtcXR0LWNvbm5lY3Rpb25cIik7XG5pbXBvcnQgcHJvdG9jb2wgPSByZXF1aXJlKFwiLi4vdXRpbC9wcm90b2NvbFwiKTtcbmltcG9ydCB1dGlscyA9IHJlcXVpcmUoXCIuLi91dGlsL3V0aWxzXCIpO1xuaW1wb3J0IFV0aWwgPSByZXF1aXJlKFwidXRpbFwiKTtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCJldmVudHNcIjtcbmltcG9ydCB7IE1hc3RlclNvY2tldCB9IGZyb20gXCIuL21hc3RlclNvY2tldFwiO1xuaW1wb3J0IHsgU2VydmVySW5mbywgU2xhdmVSZWNvcmQgfSBmcm9tIFwiLi4vLi4vaW5kZXhcIjtcbmltcG9ydCB7IE1vbml0b3JBZ2VudCB9IGZyb20gXCIuLi9tb25pdG9yL21vbml0b3JBZ2VudFwiO1xuaW1wb3J0IHsgTXF0dENsaWVudCB9IGZyb20gXCIuLi9wcm90b2NvbC9tcXR0L21xdHRDbGllbnRcIjtcblxubGV0IFNUX0lOSVRFRCA9IDE7XG5sZXQgU1RfU1RBUlRFRCA9IDI7XG5sZXQgU1RfQ0xPU0VEID0gMztcblxuZXhwb3J0IGludGVyZmFjZSBNYXN0ZXJBZ2VudE9wdHMge1xuXHRjb25zb2xlU2VydmljZTogYW55O1xuXHRpZDogc3RyaW5nO1xuXHR0eXBlOiBzdHJpbmc7XG5cdHNvY2tldDogTXF0dENvbjtcblx0cmVxSWQ6IG51bWJlcjtcblx0Y2FsbGJhY2tzOiBhbnk7XG5cdHN0YXRlOiBudW1iZXI7XG5cdHdoaXRlbGlzdDogYW55O1xufVxuXG5leHBvcnQgY2xhc3MgTWFzdGVyQWdlbnQgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuXHRyZWFkb25seSBpZE1hcDogeyBbaWR4OiBzdHJpbmddOiBhbnkgfSA9IHt9O1xuXHRyZWFkb25seSBtc2dNYXA6IHsgW2lkeDogc3RyaW5nXTogYW55IH07XG5cdHJlYWRvbmx5IHR5cGVNYXA6IHsgW2lkeDogc3RyaW5nXTogYW55W10gfTtcblx0cmVhZG9ubHkgY2xpZW50czogeyBbaWR4OiBzdHJpbmddOiBhbnkgfTsgLy9UT0RPXG5cdHJlYWRvbmx5IHNvY2tldHM6IHsgW2lkeDogc3RyaW5nXTogTXF0dENvbiB9O1xuXHRyZWFkb25seSBzbGF2ZU1hcDogeyBbaWR4OiBzdHJpbmddOiBTbGF2ZVJlY29yZFtdIH07XG5cdHJlYWRvbmx5IGNhbGxiYWNrczogeyBbaWR4OiBzdHJpbmddOiBGdW5jdGlvbiB9O1xuXHRyZWFkb25seSB3aGl0ZWxpc3Q6IGFueTtcblx0cHJpdmF0ZSBzZXJ2ZXI6IE1xdHRTZXJ2ZXI7XG5cdHByaXZhdGUgc3RhdGUgPSBTVF9JTklURUQ7XG5cdHByaXZhdGUgcmVxSWQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIE1hc3RlckFnZW50IENvbnN0cnVjdG9yXG5cdCAqXG5cdCAqIEBjbGFzcyBNYXN0ZXJBZ2VudFxuXHQgKiBAY29uc3RydWN0b3Jcblx0ICogQHBhcmFtIHtPYmplY3R9IG9wdHMgY29uc3RydWN0IHBhcmFtZXRlclxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5jb25zb2xlU2VydmljZSB7T2JqZWN0fSBjb25zb2xlU2VydmljZVxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5pZCAgICAgICAgICAgICB7U3RyaW5nfSBzZXJ2ZXIgaWRcblx0ICogICAgICAgICAgICAgICAgIG9wdHMudHlwZSAgICAgICAgICAge1N0cmluZ30gc2VydmVyIHR5cGUsICdtYXN0ZXInLCAnY29ubmVjdG9yJywgZXRjLlxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5zb2NrZXQgICAgICAgICB7T2JqZWN0fSBzb2NrZXQtaW8gb2JqZWN0XG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLnJlcUlkICAgICAgICAgIHtOdW1iZXJ9IHJlcUlkIGFkZCBieSAxXG5cdCAqICAgICAgICAgICAgICAgICBvcHRzLmNhbGxiYWNrcyAgICAgIHtPYmplY3R9IGNhbGxiYWNrc1xuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5zdGF0ZSAgICAgICAgICB7TnVtYmVyfSBNYXN0ZXJBZ2VudCBzdGF0ZVxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgY29uc29sZVNlcnZpY2U6IGFueSwgb3B0czogTWFzdGVyQWdlbnRPcHRzKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlcUlkID0gMTtcblx0XHR0aGlzLmlkTWFwID0ge307XG5cdFx0dGhpcy5tc2dNYXAgPSB7fTtcblx0XHR0aGlzLnR5cGVNYXAgPSB7fTtcblx0XHR0aGlzLmNsaWVudHMgPSB7fTtcblx0XHR0aGlzLnNvY2tldHMgPSB7fTtcblx0XHR0aGlzLnNsYXZlTWFwID0ge307XG5cdFx0dGhpcy5zZXJ2ZXIgPSA8YW55Pm51bGw7XG5cdFx0dGhpcy5jYWxsYmFja3MgPSB7fTtcblx0XHR0aGlzLnN0YXRlID0gU1RfSU5JVEVEO1xuXHRcdHRoaXMud2hpdGVsaXN0ID0gb3B0cy53aGl0ZWxpc3Q7XG5cdH1cblxuXHQvKipcblx0ICogbWFzdGVyIGxpc3RlbiB0byBhIHBvcnQgYW5kIGhhbmRsZSByZWdpc3RlciBhbmQgcmVxdWVzdFxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gcG9ydFxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0bGlzdGVuKHBvcnQ6IG51bWJlciwgY2I6IEZ1bmN0aW9uKSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPiBTVF9JTklURUQpIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcIm1hc3RlciBhZ2VudCBoYXMgc3RhcnRlZCBvciBjbG9zZWQuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGUgPSBTVF9TVEFSVEVEO1xuXHRcdHRoaXMuc2VydmVyID0gbmV3IE1xdHRTZXJ2ZXIoKTtcblx0XHR0aGlzLnNlcnZlci5saXN0ZW4ocG9ydCk7XG5cdFx0Ly8gdGhpcy5zZXJ2ZXIgPSBzaW8ubGlzdGVuKHBvcnQpO1xuXHRcdC8vIHRoaXMuc2VydmVyLnNldCgnbG9nIGxldmVsJywgMCk7XG5cblx0XHRjYiA9IGNiIHx8IGZ1bmN0aW9uKCkge307XG5cblx0XHRsZXQgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5zZXJ2ZXIub24oXCJlcnJvclwiLCBmdW5jdGlvbihlcnIpIHtcblx0XHRcdHNlbGYuZW1pdChcImVycm9yXCIsIGVycik7XG5cdFx0XHRjYihlcnIpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5zZXJ2ZXIub25jZShcImxpc3RlbmluZ1wiLCBmdW5jdGlvbigpIHtcblx0XHRcdHNldEltbWVkaWF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0Y2IoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5zZXJ2ZXIub24oXCJjb25uZWN0aW9uXCIsIChzb2NrZXQ6IE1xdHRDb24pID0+IHtcblx0XHRcdC8vIGxldCBpZCwgdHlwZSwgaW5mbywgcmVnaXN0ZXJlZCwgdXNlcm5hbWU7XG5cdFx0XHRsZXQgbWFzdGVyU29ja2V0ID0gbmV3IE1hc3RlclNvY2tldCgpO1xuXHRcdFx0bWFzdGVyU29ja2V0W1wiYWdlbnRcIl0gPSBzZWxmO1xuXHRcdFx0bWFzdGVyU29ja2V0W1wic29ja2V0XCJdID0gc29ja2V0O1xuXG5cdFx0XHRzZWxmLnNvY2tldHNbc29ja2V0LmlkXSA9IHNvY2tldDtcblxuXHRcdFx0c29ja2V0Lm9uKFwicmVnaXN0ZXJcIiwgZnVuY3Rpb24obXNnKSB7XG5cdFx0XHRcdC8vIHJlZ2lzdGVyIGEgbmV3IGNvbm5lY3Rpb25cblx0XHRcdFx0bWFzdGVyU29ja2V0Lm9uUmVnaXN0ZXIobXNnKTtcblx0XHRcdH0pOyAvLyBlbmQgb2Ygb24gJ3JlZ2lzdGVyJ1xuXG5cdFx0XHQvLyBtZXNzYWdlIGZyb20gbW9uaXRvclxuXHRcdFx0c29ja2V0Lm9uKFwibW9uaXRvclwiLCBmdW5jdGlvbihtc2cpIHtcblx0XHRcdFx0bWFzdGVyU29ja2V0Lm9uTW9uaXRvcihtc2cpO1xuXHRcdFx0fSk7IC8vIGVuZCBvZiBvbiAnbW9uaXRvcidcblxuXHRcdFx0Ly8gbWVzc2FnZSBmcm9tIGNsaWVudFxuXHRcdFx0c29ja2V0Lm9uKFwiY2xpZW50XCIsIGZ1bmN0aW9uKG1zZykge1xuXHRcdFx0XHRtYXN0ZXJTb2NrZXQub25DbGllbnQobXNnKTtcblx0XHRcdH0pOyAvLyBlbmQgb2Ygb24gJ2NsaWVudCdcblxuXHRcdFx0c29ja2V0Lm9uKFwicmVjb25uZWN0XCIsIGZ1bmN0aW9uKG1zZykge1xuXHRcdFx0XHRtYXN0ZXJTb2NrZXQub25SZWNvbm5lY3QobXNnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzb2NrZXQub24oXCJkaXNjb25uZWN0XCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRtYXN0ZXJTb2NrZXQub25EaXNjb25uZWN0KCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c29ja2V0Lm9uKFwiY2xvc2VcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdG1hc3RlclNvY2tldC5vbkRpc2Nvbm5lY3QoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzb2NrZXQub24oXCJlcnJvclwiLCBmdW5jdGlvbihlcnIpIHtcblx0XHRcdFx0bWFzdGVyU29ja2V0Lm9uRXJyb3IoZXJyKTtcblx0XHRcdH0pO1xuXHRcdH0pOyAvLyBlbmQgb2Ygb24gJ2Nvbm5lY3Rpb24nXG5cdH0gLy8gZW5kIG9mIGxpc3RlblxuXG5cdC8qKlxuXHQgKiBjbG9zZSBtYXN0ZXIgYWdlbnRcblx0ICpcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdGNsb3NlKCkge1xuXHRcdGlmICh0aGlzLnN0YXRlID4gU1RfU1RBUlRFRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnN0YXRlID0gU1RfQ0xPU0VEO1xuXHRcdHRoaXMuc2VydmVyLmNsb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogc2V0IG1vZHVsZVxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgbW9kdWxlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IHZhbHVlIG1vZHVsZSBvYmplY3Rcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdHNldChtb2R1bGVJZDogc3RyaW5nLCB2YWx1ZTogYW55KSB7XG5cdFx0dGhpcy5jb25zb2xlU2VydmljZS5zZXQobW9kdWxlSWQsIHZhbHVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBnZXQgbW9kdWxlXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0Z2V0KG1vZHVsZUlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5jb25zb2xlU2VydmljZS5nZXQobW9kdWxlSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIGdldENsaWVudEJ5SWRcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IGNsaWVudElkXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRnZXRDbGllbnRCeUlkKGNsaWVudElkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5jbGllbnRzW2NsaWVudElkXTtcblx0fVxuXG5cdC8qKlxuXHQgKiByZXF1ZXN0IG1vbml0b3J7bWFzdGVyIG5vZGV9IGRhdGEgZnJvbSBtb25pdG9yXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzZXJ2ZXJJZFxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgbW9kdWxlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IG1zZ1xuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBmdW5jdGlvblxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0cmVxdWVzdChzZXJ2ZXJJZDogc3RyaW5nLCBtb2R1bGVJZDogc3RyaW5nLCBtc2c6IGFueSwgY2I6IEZ1bmN0aW9uKSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPiBTVF9TVEFSVEVEKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y2IgPSBjYiB8fCBmdW5jdGlvbigpIHt9O1xuXG5cdFx0bGV0IGN1cklkID0gdGhpcy5yZXFJZCsrO1xuXHRcdHRoaXMuY2FsbGJhY2tzW2N1cklkXSA9IGNiO1xuXG5cdFx0aWYgKCF0aGlzLm1zZ01hcFtzZXJ2ZXJJZF0pIHtcblx0XHRcdHRoaXMubXNnTWFwW3NlcnZlcklkXSA9IHt9O1xuXHRcdH1cblxuXHRcdHRoaXMubXNnTWFwW3NlcnZlcklkXVtjdXJJZF0gPSB7XG5cdFx0XHRtb2R1bGVJZDogbW9kdWxlSWQsXG5cdFx0XHRtc2c6IG1zZ1xuXHRcdH07XG5cblx0XHRsZXQgcmVjb3JkID0gdGhpcy5pZE1hcFtzZXJ2ZXJJZF07XG5cdFx0aWYgKCFyZWNvcmQpIHtcblx0XHRcdGNiKG5ldyBFcnJvcihcInVua25vd24gc2VydmVyIGlkOlwiICsgc2VydmVySWQpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRzZW5kVG9Nb25pdG9yKHJlY29yZC5zb2NrZXQsIGN1cklkLCBtb2R1bGVJZCwgbXNnKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIHJlcXVlc3Qgc2VydmVyIGRhdGEgZnJvbSBtb25pdG9yIGJ5IHNlcnZlckluZm97aG9zdDpwb3J0fVxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc2VydmVySWRcblx0ICogQHBhcmFtIHtPYmplY3R9IHNlcnZlckluZm9cblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2dcblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgZnVuY3Rpb25cblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdHJlcXVlc3RTZXJ2ZXIoXG5cdFx0c2VydmVySWQ6IHN0cmluZyxcblx0XHRzZXJ2ZXJJbmZvOiBTZXJ2ZXJJbmZvLFxuXHRcdG1vZHVsZUlkOiBzdHJpbmcsXG5cdFx0bXNnOiBhbnksXG5cdFx0Y2I6IEZ1bmN0aW9uXG5cdCkge1xuXHRcdGlmICh0aGlzLnN0YXRlID4gU1RfU1RBUlRFRCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCByZWNvcmQgPSB0aGlzLmlkTWFwW3NlcnZlcklkXTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0dXRpbHMuaW52b2tlQ2FsbGJhY2soXG5cdFx0XHRcdGNiLFxuXHRcdFx0XHRuZXcgRXJyb3IoXCJ1bmtub3duIHNlcnZlciBpZDpcIiArIHNlcnZlcklkKVxuXHRcdFx0KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgY3VySWQgPSB0aGlzLnJlcUlkKys7XG5cdFx0dGhpcy5jYWxsYmFja3NbY3VySWRdID0gY2I7XG5cblx0XHRpZiAodXRpbHMuY29tcGFyZVNlcnZlcihyZWNvcmQsIHNlcnZlckluZm8pKSB7XG5cdFx0XHRzZW5kVG9Nb25pdG9yKHJlY29yZC5zb2NrZXQsIGN1cklkLCBtb2R1bGVJZCwgbXNnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHNsYXZlcyA9IHRoaXMuc2xhdmVNYXBbc2VydmVySWRdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGwgPSBzbGF2ZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRcdGlmICh1dGlscy5jb21wYXJlU2VydmVyKHNsYXZlc1tpXSwgc2VydmVySW5mbykpIHtcblx0XHRcdFx0XHRzZW5kVG9Nb25pdG9yKHNsYXZlc1tpXS5zb2NrZXQsIGN1cklkLCBtb2R1bGVJZCwgbXNnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIG5vdGlmeSBhIG1vbml0b3J7bWFzdGVyIG5vZGV9IGJ5IGlkIHdpdGhvdXQgY2FsbGJhY2tcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IHNlcnZlcklkXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAcGFyYW0ge09iamVjdH0gbXNnXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRub3RpZnlCeUlkKHNlcnZlcklkOiBzdHJpbmcsIG1vZHVsZUlkOiBzdHJpbmcsIG1zZzogYW55KSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPiBTVF9TVEFSVEVEKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IHJlY29yZCA9IHRoaXMuaWRNYXBbc2VydmVySWRdO1xuXHRcdGlmICghcmVjb3JkKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXG5cdFx0XHRcdFwiZmFpbCB0byBub3RpZnlCeUlkIGZvciB1bmtub3duIHNlcnZlciBpZDpcIiArIHNlcnZlcklkXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHNlbmRUb01vbml0b3IocmVjb3JkLnNvY2tldCwgbnVsbCEsIG1vZHVsZUlkLCBtc2cpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogbm90aWZ5IGEgbW9uaXRvciBieSBzZXJ2ZXJ7aG9zdDpwb3J0fSB3aXRob3V0IGNhbGxiYWNrXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzZXJ2ZXJJZFxuXHQgKiBAcGFyYW0ge09iamVjdH0gc2VydmVySW5mb3tob3N0OnBvcnR9XG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAcGFyYW0ge09iamVjdH0gbXNnXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRub3RpZnlCeVNlcnZlcihcblx0XHRzZXJ2ZXJJZDogc3RyaW5nLFxuXHRcdHNlcnZlckluZm86IFNlcnZlckluZm8sXG5cdFx0bW9kdWxlSWQ6IHN0cmluZyxcblx0XHRtc2c6IGFueVxuXHQpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgcmVjb3JkID0gdGhpcy5pZE1hcFtzZXJ2ZXJJZF07XG5cdFx0aWYgKCFyZWNvcmQpIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcblx0XHRcdFx0XCJmYWlsIHRvIG5vdGlmeUJ5U2VydmVyIGZvciB1bmtub3duIHNlcnZlciBpZDpcIiArIHNlcnZlcklkXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh1dGlscy5jb21wYXJlU2VydmVyKHJlY29yZCwgc2VydmVySW5mbykpIHtcblx0XHRcdHNlbmRUb01vbml0b3IocmVjb3JkLnNvY2tldCwgbnVsbCEsIG1vZHVsZUlkLCBtc2cpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgc2xhdmVzID0gdGhpcy5zbGF2ZU1hcFtzZXJ2ZXJJZF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbCA9IHNsYXZlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdFx0aWYgKHV0aWxzLmNvbXBhcmVTZXJ2ZXIoc2xhdmVzW2ldLCBzZXJ2ZXJJbmZvKSkge1xuXHRcdFx0XHRcdHNlbmRUb01vbml0b3Ioc2xhdmVzW2ldLnNvY2tldCwgbnVsbCEsIG1vZHVsZUlkLCBtc2cpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIG5vdGlmeSBzbGF2ZXMgYnkgaWQgd2l0aG91dCBjYWxsYmFja1xuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc2VydmVySWRcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2dcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdG5vdGlmeVNsYXZlc0J5SWQoc2VydmVySWQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgc2xhdmVzID0gdGhpcy5zbGF2ZU1hcFtzZXJ2ZXJJZF07XG5cdFx0aWYgKCFzbGF2ZXMgfHwgc2xhdmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFxuXHRcdFx0XHRcImZhaWwgdG8gbm90aWZ5U2xhdmVzQnlJZCBmb3IgdW5rbm93biBzZXJ2ZXIgaWQ6XCIgKyBzZXJ2ZXJJZFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRicm9hZGNhc3RNb25pdG9ycyhzbGF2ZXMsIG1vZHVsZUlkLCBtc2cpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIG5vdGlmeSBtb25pdG9ycyBieSB0eXBlIHdpdGhvdXQgY2FsbGJhY2tcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgc2VydmVyVHlwZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgbW9kdWxlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IG1zZ1xuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0bm90aWZ5QnlUeXBlKHR5cGU6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgbGlzdCA9IHRoaXMudHlwZU1hcFt0eXBlXTtcblx0XHRpZiAoIWxpc3QgfHwgbGlzdC5sZW5ndGggPT09IDApIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcblx0XHRcdFx0XCJmYWlsIHRvIG5vdGlmeUJ5VHlwZSBmb3IgdW5rbm93biBzZXJ2ZXIgdHlwZTpcIiArIHR5cGVcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGJyb2FkY2FzdE1vbml0b3JzKGxpc3QsIG1vZHVsZUlkLCBtc2cpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIG5vdGlmeSBhbGwgdGhlIG1vbml0b3JzIHdpdGhvdXQgY2FsbGJhY2tcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2dcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdG5vdGlmeUFsbChtb2R1bGVJZDogc3RyaW5nLCBtc2c/OiBhbnkpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0YnJvYWRjYXN0TW9uaXRvcnModGhpcy5pZE1hcCwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogbm90aWZ5IGEgY2xpZW50IGJ5IGlkIHdpdGhvdXQgY2FsbGJhY2tcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IGNsaWVudElkXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAcGFyYW0ge09iamVjdH0gbXNnXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRub3RpZnlDbGllbnQoY2xpZW50SWQ6IHN0cmluZywgbW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX1NUQVJURUQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgcmVjb3JkID0gdGhpcy5jbGllbnRzW2NsaWVudElkXTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFxuXHRcdFx0XHRcImZhaWwgdG8gbm90aWZ5Q2xpZW50IGZvciB1bmtub3duIGNsaWVudCBpZDpcIiArIGNsaWVudElkXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRzZW5kVG9DbGllbnQocmVjb3JkLnNvY2tldCwgbnVsbCEsIG1vZHVsZUlkLCBtc2cpO1xuXHR9XG5cblx0bm90aWZ5Q29tbWFuZChjb21tYW5kOiBzdHJpbmcsIG1vZHVsZUlkOiBzdHJpbmcsIG1zZzogYW55KSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPiBTVF9TVEFSVEVEKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGJyb2FkY2FzdENvbW1hbmQodGhpcy5pZE1hcCwgY29tbWFuZCwgbW9kdWxlSWQsIG1zZyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRkb0F1dGhVc2VyKG1zZzogYW55LCBzb2NrZXQ6IE1xdHRDb24sIGNiOiBGdW5jdGlvbikge1xuXHRcdGlmICghbXNnLmlkKSB7XG5cdFx0XHQvLyBjbGllbnQgc2hvdWxkIGhhcyBhIGNsaWVudCBpZFxuXHRcdFx0cmV0dXJuIGNiKG5ldyBFcnJvcihcImNsaWVudCBzaG91bGQgaGFzIGEgY2xpZW50IGlkXCIpKTtcblx0XHR9XG5cblx0XHRsZXQgdXNlcm5hbWUgPSBtc2cudXNlcm5hbWU7XG5cdFx0aWYgKCF1c2VybmFtZSkge1xuXHRcdFx0Ly8gY2xpZW50IHNob3VsZCBhdXRoIHdpdGggdXNlcm5hbWVcblx0XHRcdGRvU2VuZChzb2NrZXQsIFwicmVnaXN0ZXJcIiwge1xuXHRcdFx0XHRjb2RlOiBwcm90b2NvbC5QUk9fRkFJTCxcblx0XHRcdFx0bXNnOiBcImNsaWVudCBzaG91bGQgYXV0aCB3aXRoIHVzZXJuYW1lXCJcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGNiKG5ldyBFcnJvcihcImNsaWVudCBzaG91bGQgYXV0aCB3aXRoIHVzZXJuYW1lXCIpKTtcblx0XHR9XG5cblx0XHRsZXQgYXV0aFVzZXIgPSB0aGlzLmNvbnNvbGVTZXJ2aWNlLmF1dGhVc2VyO1xuXHRcdGxldCBlbnYgPSB0aGlzLmNvbnNvbGVTZXJ2aWNlLmVudjtcblx0XHRhdXRoVXNlcihtc2csIGVudiwgKHVzZXI6IGFueSkgPT4ge1xuXHRcdFx0aWYgKCF1c2VyKSB7XG5cdFx0XHRcdC8vIGNsaWVudCBzaG91bGQgYXV0aCB3aXRoIHVzZXJuYW1lXG5cdFx0XHRcdGRvU2VuZChzb2NrZXQsIFwicmVnaXN0ZXJcIiwge1xuXHRcdFx0XHRcdGNvZGU6IHByb3RvY29sLlBST19GQUlMLFxuXHRcdFx0XHRcdG1zZzogXCJjbGllbnQgYXV0aCBmYWlsZWQgd2l0aCB1c2VybmFtZSBvciBwYXNzd29yZCBlcnJvclwiXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gY2IoXG5cdFx0XHRcdFx0bmV3IEVycm9yKFxuXHRcdFx0XHRcdFx0XCJjbGllbnQgYXV0aCBmYWlsZWQgd2l0aCB1c2VybmFtZSBvciBwYXNzd29yZCBlcnJvclwiXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jbGllbnRzW21zZy5pZF0pIHtcblx0XHRcdFx0ZG9TZW5kKHNvY2tldCwgXCJyZWdpc3RlclwiLCB7XG5cdFx0XHRcdFx0Y29kZTogcHJvdG9jb2wuUFJPX0ZBSUwsXG5cdFx0XHRcdFx0bXNnOiBcImlkIGhhcyBiZWVuIHJlZ2lzdGVyZWQuIGlkOlwiICsgbXNnLmlkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gY2IobmV3IEVycm9yKFwiaWQgaGFzIGJlZW4gcmVnaXN0ZXJlZC4gaWQ6XCIgKyBtc2cuaWQpKTtcblx0XHRcdH1cblxuXHRcdFx0bG9nZ2VyLmluZm8oXCJjbGllbnQgdXNlciA6IFwiICsgdXNlcm5hbWUgKyBcIiBsb2dpbiB0byBtYXN0ZXJcIik7XG5cdFx0XHR0aGlzLmFkZENvbm5lY3Rpb24obXNnLmlkLCBtc2cudHlwZSwgbnVsbCEsIHVzZXIsIHNvY2tldCk7XG5cdFx0XHR0aGlzLmRvU2VuZChzb2NrZXQsIFwicmVnaXN0ZXJcIiwge1xuXHRcdFx0XHRjb2RlOiBwcm90b2NvbC5QUk9fT0ssXG5cdFx0XHRcdG1zZzogXCJva1wiXG5cdFx0XHR9KTtcblxuXHRcdFx0Y2IoKTtcblx0XHR9KTtcblx0fVxuXG5cdGRvQXV0aFNlcnZlcihtc2c6IGFueSwgc29ja2V0OiBNcXR0Q29uLCBjYjogRnVuY3Rpb24pIHtcblx0XHRsZXQgc2VsZiA9IHRoaXM7XG5cdFx0bGV0IGF1dGhTZXJ2ZXIgPSBzZWxmLmNvbnNvbGVTZXJ2aWNlLmF1dGhTZXJ2ZXI7XG5cdFx0bGV0IGVudiA9IHNlbGYuY29uc29sZVNlcnZpY2UuZW52O1xuXHRcdGF1dGhTZXJ2ZXIobXNnLCBlbnYsIChzdGF0dXM6IGFueSkgPT4ge1xuXHRcdFx0aWYgKHN0YXR1cyAhPT0gXCJva1wiKSB7XG5cdFx0XHRcdGRvU2VuZChzb2NrZXQsIFwicmVnaXN0ZXJcIiwge1xuXHRcdFx0XHRcdGNvZGU6IHByb3RvY29sLlBST19GQUlMLFxuXHRcdFx0XHRcdG1zZzogXCJzZXJ2ZXIgYXV0aCBmYWlsZWRcIlxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y2IobmV3IEVycm9yKFwic2VydmVyIGF1dGggZmFpbGVkXCIpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmVjb3JkID0gYWRkQ29ubmVjdGlvbihcblx0XHRcdFx0c2VsZixcblx0XHRcdFx0bXNnLmlkLFxuXHRcdFx0XHRtc2cuc2VydmVyVHlwZSxcblx0XHRcdFx0bXNnLnBpZCxcblx0XHRcdFx0bXNnLmluZm8sXG5cdFx0XHRcdHNvY2tldFxuXHRcdFx0KTtcblxuXHRcdFx0ZG9TZW5kKHNvY2tldCwgXCJyZWdpc3RlclwiLCB7XG5cdFx0XHRcdGNvZGU6IHByb3RvY29sLlBST19PSyxcblx0XHRcdFx0bXNnOiBcIm9rXCJcblx0XHRcdH0pO1xuXHRcdFx0bXNnLmluZm8gPSBtc2cuaW5mbyB8fCB7fTtcblx0XHRcdG1zZy5pbmZvLnBpZCA9IG1zZy5waWQ7XG5cdFx0XHRzZWxmLmVtaXQoXCJyZWdpc3RlclwiLCBtc2cuaW5mbyk7XG5cdFx0XHRjYihudWxsKTtcblx0XHR9KTtcblx0fVxuXG5cdGRvU2VuZChzb2NrZXQ6IE1xdHRDb24sIHRvcGljOiBzdHJpbmcsIG1zZzogYW55KSB7XG5cdFx0ZG9TZW5kKHNvY2tldCwgdG9waWMsIG1zZyk7XG5cdH1cblxuXHRzZW5kVG9Nb25pdG9yKHNvY2tldDogTXF0dENvbiwgcmVxSWQ6IG51bWJlciwgbW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHRzZW5kVG9Nb25pdG9yKHNvY2tldCwgcmVxSWQsIG1vZHVsZUlkLCBtc2cpO1xuXHR9XG5cblx0YWRkQ29ubmVjdGlvbihcblx0XHRpZDogc3RyaW5nLFxuXHRcdHR5cGU6IHN0cmluZyxcblx0XHRwaWQ6IG51bWJlcixcblx0XHRpbmZvOiBTZXJ2ZXJJbmZvLFxuXHRcdHNvY2tldDogTXF0dENvblxuXHQpIHtcblx0XHRhZGRDb25uZWN0aW9uKHRoaXMsIGlkLCB0eXBlLCBwaWQsIGluZm8sIHNvY2tldCk7XG5cdH1cblxuXHRyZW1vdmVDb25uZWN0aW9uKGlkOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgaW5mbzogU2VydmVySW5mbykge1xuXHRcdHJlbW92ZUNvbm5lY3Rpb24odGhpcywgaWQsIHR5cGUsIGluZm8pO1xuXHR9XG59XG5cbi8qKlxuICogYWRkIG1vbml0b3IsY2xpZW50IHRvIGNvbm5lY3Rpb24gLS0gaWRNYXBcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYWdlbnQgYWdlbnQgb2JqZWN0XG4gKiBAcGFyYW0ge1N0cmluZ30gaWRcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIHNlcnZlclR5cGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBzb2NrZXQgc29ja2V0LWlvIG9iamVjdFxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGFkZENvbm5lY3Rpb24oXG5cdGFnZW50OiBNYXN0ZXJBZ2VudCxcblx0aWQ6IHN0cmluZyxcblx0dHlwZTogc3RyaW5nLFxuXHRwaWQ6IG51bWJlcixcblx0aW5mbzogU2VydmVySW5mbyxcblx0c29ja2V0OiBNcXR0Q29uXG4pIHtcblx0bGV0IHJlY29yZCA9IHtcblx0XHRpZDogaWQsXG5cdFx0dHlwZTogdHlwZSxcblx0XHRwaWQ6IHBpZCxcblx0XHRpbmZvOiBpbmZvLFxuXHRcdHNvY2tldDogc29ja2V0XG5cdH07XG5cdGlmICh0eXBlID09PSBcImNsaWVudFwiKSB7XG5cdFx0YWdlbnQuY2xpZW50c1tpZF0gPSByZWNvcmQ7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKCFhZ2VudC5pZE1hcFtpZF0pIHtcblx0XHRcdGFnZW50LmlkTWFwW2lkXSA9IHJlY29yZDtcblx0XHRcdGxldCBsaXN0ID0gKGFnZW50LnR5cGVNYXBbdHlwZV0gPSBhZ2VudC50eXBlTWFwW3R5cGVdIHx8IFtdKTtcblx0XHRcdGxpc3QucHVzaChyZWNvcmQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgc2xhdmVzID0gKGFnZW50LnNsYXZlTWFwW2lkXSA9IGFnZW50LnNsYXZlTWFwW2lkXSB8fCBbXSk7XG5cdFx0XHRzbGF2ZXMucHVzaChyZWNvcmQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVjb3JkO1xufVxuXG4vKipcbiAqIHJlbW92ZSBtb25pdG9yLGNsaWVudCBjb25uZWN0aW9uIC0tIGlkTWFwXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGFnZW50IGFnZW50IG9iamVjdFxuICogQHBhcmFtIHtTdHJpbmd9IGlkXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBzZXJ2ZXJUeXBlXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gcmVtb3ZlQ29ubmVjdGlvbihcblx0YWdlbnQ6IE1hc3RlckFnZW50LFxuXHRpZDogc3RyaW5nLFxuXHR0eXBlOiBzdHJpbmcsXG5cdGluZm86IFNlcnZlckluZm9cbikge1xuXHRpZiAodHlwZSA9PT0gXCJjbGllbnRcIikge1xuXHRcdGRlbGV0ZSAoPGFueT5hZ2VudCkuY2xpZW50c1tpZF07XG5cdH0gZWxzZSB7XG5cdFx0Ly8gcmVtb3ZlIG1hc3RlciBub2RlIGluIGlkTWFwIGFuZCB0eXBlTWFwXG5cdFx0bGV0IHJlY29yZCA9IGFnZW50LmlkTWFwW2lkXTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgX2luZm8gPSByZWNvcmRbXCJpbmZvXCJdOyAvLyBpbmZvIHtob3N0LCBwb3J0fVxuXHRcdGlmICh1dGlscy5jb21wYXJlU2VydmVyKF9pbmZvLCBpbmZvKSkge1xuXHRcdFx0ZGVsZXRlIGFnZW50LmlkTWFwW2lkXTtcblx0XHRcdGxldCBsaXN0ID0gYWdlbnQudHlwZU1hcFt0eXBlXTtcblx0XHRcdGlmIChsaXN0KSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdFx0XHRpZiAobGlzdFtpXS5pZCA9PT0gaWQpIHtcblx0XHRcdFx0XHRcdGxpc3Quc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBhZ2VudC50eXBlTWFwW3R5cGVdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHJlbW92ZSBzbGF2ZSBub2RlIGluIHNsYXZlTWFwXG5cdFx0XHRsZXQgc2xhdmVzID0gYWdlbnQuc2xhdmVNYXBbaWRdO1xuXHRcdFx0aWYgKHNsYXZlcykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbCA9IHNsYXZlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdFx0XHRpZiAodXRpbHMuY29tcGFyZVNlcnZlcihzbGF2ZXNbaV1bXCJpbmZvXCJdLCBpbmZvKSkge1xuXHRcdFx0XHRcdFx0c2xhdmVzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2xhdmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBhZ2VudC5zbGF2ZU1hcFtpZF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbi8qKlxuICogc2VuZCBtc2cgdG8gbW9uaXRvclxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBzb2NrZXQgc29ja2V0LWlvIG9iamVjdFxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcUlkIHJlcXVlc3QgaWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuICogQHBhcmFtIHtPYmplY3R9IG1zZyBtZXNzYWdlXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gc2VuZFRvTW9uaXRvcihcblx0c29ja2V0OiBNcXR0Q29uLFxuXHRyZXFJZDogbnVtYmVyLFxuXHRtb2R1bGVJZDogc3RyaW5nLFxuXHRtc2c6IGFueVxuKSB7XG5cdGRvU2VuZChzb2NrZXQsIFwibW9uaXRvclwiLCBwcm90b2NvbC5jb21wb3NlUmVxdWVzdChyZXFJZCwgbW9kdWxlSWQsIG1zZykpO1xufVxuXG4vKipcbiAqIHNlbmQgbXNnIHRvIGNsaWVudFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBzb2NrZXQgc29ja2V0LWlvIG9iamVjdFxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcUlkIHJlcXVlc3QgaWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuICogQHBhcmFtIHtPYmplY3R9IG1zZyBtZXNzYWdlXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gc2VuZFRvQ2xpZW50KFxuXHRzb2NrZXQ6IE1xdHRDb24sXG5cdHJlcUlkOiBudW1iZXIsXG5cdG1vZHVsZUlkOiBzdHJpbmcsXG5cdG1zZzogYW55XG4pIHtcblx0ZG9TZW5kKHNvY2tldCwgXCJjbGllbnRcIiwgcHJvdG9jb2wuY29tcG9zZVJlcXVlc3QocmVxSWQsIG1vZHVsZUlkLCBtc2cpKTtcbn1cblxuZnVuY3Rpb24gZG9TZW5kKHNvY2tldDogTXF0dENvbiwgdG9waWM6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0c29ja2V0LnNlbmQodG9waWMsIG1zZyk7XG59XG5cbi8qKlxuICogYnJvYWRjYXN0IG1zZyB0byBtb25pdG9yXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHJlY29yZCByZWdpc3RlcmVkIG1vZHVsZXNcbiAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuICogQHBhcmFtIHtPYmplY3R9IG1zZyBtZXNzYWdlXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gYnJvYWRjYXN0TW9uaXRvcnMocmVjb3JkczogYW55LCBtb2R1bGVJZDogc3RyaW5nLCBtc2c6IGFueSkge1xuXHRtc2cgPSBwcm90b2NvbC5jb21wb3NlUmVxdWVzdChudWxsISwgbW9kdWxlSWQsIG1zZyk7XG5cblx0aWYgKHJlY29yZHMgaW5zdGFuY2VvZiBBcnJheSkge1xuXHRcdGZvciAobGV0IGkgPSAwLCBsID0gcmVjb3Jkcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdGxldCBzb2NrZXQgPSByZWNvcmRzW2ldLnNvY2tldDtcblx0XHRcdGRvU2VuZChzb2NrZXQsIFwibW9uaXRvclwiLCBtc2cpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRmb3IgKGxldCBpZCBpbiByZWNvcmRzKSB7XG5cdFx0XHRsZXQgc29ja2V0OiBhbnkgPSByZWNvcmRzW2lkXS5zb2NrZXQ7XG5cdFx0XHRkb1NlbmQoc29ja2V0LCBcIm1vbml0b3JcIiwgbXNnKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gYnJvYWRjYXN0Q29tbWFuZChcblx0cmVjb3JkczogYW55LFxuXHRjb21tYW5kOiBzdHJpbmcsXG5cdG1vZHVsZUlkOiBzdHJpbmcsXG5cdG1zZzogYW55XG4pIHtcblx0bXNnID0gcHJvdG9jb2wuY29tcG9zZUNvbW1hbmQobnVsbCEsIGNvbW1hbmQsIG1vZHVsZUlkLCBtc2cpO1xuXG5cdGlmIChyZWNvcmRzIGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbCA9IHJlY29yZHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRsZXQgc29ja2V0ID0gcmVjb3Jkc1tpXS5zb2NrZXQ7XG5cdFx0XHRkb1NlbmQoc29ja2V0LCBcIm1vbml0b3JcIiwgbXNnKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChsZXQgaWQgaW4gcmVjb3Jkcykge1xuXHRcdFx0bGV0IHNvY2tldCA9IHJlY29yZHNbaWRdLnNvY2tldDtcblx0XHRcdGRvU2VuZChzb2NrZXQsIFwibW9uaXRvclwiLCBtc2cpO1xuXHRcdH1cblx0fVxufVxuIl19