"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("pomelo-logger").getLogger("pomelo-admin", "MonitorAgent");
const protocol = require("../util/protocol");
const events_1 = require("events");
const mqttClient_1 = require("../protocol/mqtt/mqttClient");
const ST_INITED = 1;
const ST_CONNECTED = 2;
const ST_REGISTERED = 3;
const ST_CLOSED = 4;
const STATUS_INTERVAL = 5 * 1000; // 60 seconds
class MonitorAgent extends events_1.EventEmitter {
    /**
     * MonitorAgent Constructor
     *
     * @class MasterAgent
     * @constructor
     * @param {Object} opts construct parameter
     *                 opts.consoleService {Object} consoleService
     *                 opts.id             {String} server id
     *                 opts.type           {String} server type, 'master', 'connector', etc.
     *                 opts.info           {Object} more server info for current server, {id, serverType, host, port}
     * @api public
     */
    constructor(opts) {
        super();
        this.opts = opts;
        this.reqId = 1;
        this.id = opts.id;
        this.socket = null;
        this.callbacks = {};
        this.type = opts.type;
        this.info = opts.info;
        this.state = ST_INITED;
        this.consoleService = opts.consoleService;
    }
    /**
     * register and connect to master server
     *
     * @param {String} port
     * @param {String} host
     * @param {Function} cb callback function
     * @api public
     */
    connect(port, host, cb) {
        if (this.state > ST_INITED) {
            logger.error("monitor client has connected or closed.");
            return;
        }
        cb = cb || function () { };
        this.socket = new mqttClient_1.MqttClient(this.opts);
        this.socket.connect(host, port);
        // this.socket = sclient.connect(host + ':' + port, {
        //   'force new connection': true,
        //   'reconnect': true,
        //   'max reconnection attempts': 20
        // });
        this.socket.on("register", (msg) => {
            if (msg && msg.code === protocol.PRO_OK) {
                this.state = ST_REGISTERED;
                cb();
            }
            else {
                this.emit("close");
                logger.error("server %j %j register master failed", this.id, this.type);
            }
        });
        this.socket.on("monitor", msg => {
            if (this.state !== ST_REGISTERED) {
                return;
            }
            msg = protocol.parse(msg);
            if (msg.command) {
                // a command from master
                this.consoleService.command(msg.command, msg.moduleId, msg.body, (err, res) => {
                    //notify should not have a callback
                });
            }
            else {
                let respId = msg.respId;
                if (respId) {
                    // a response from monitor
                    let respCb = this.callbacks[respId];
                    if (!respCb) {
                        logger.warn("unknown resp id:" + respId);
                        return;
                    }
                    delete this.callbacks[respId];
                    respCb(msg.error, msg.body);
                    return;
                }
                // request from master
                this.consoleService.execute(msg.moduleId, "monitorHandler", msg.body, (err, res) => {
                    if (protocol.isRequest(msg)) {
                        let resp = protocol.composeResponse(msg, err, res);
                        if (resp) {
                            this.doSend("monitor", resp);
                        }
                    }
                    else {
                        //notify should not have a callback
                        logger.error("notify should not have a callback.");
                    }
                });
            }
        });
        this.socket.on("connect", () => {
            if (this.state > ST_INITED) {
                //ignore reconnect
                return;
            }
            this.state = ST_CONNECTED;
            let req = {
                id: this.id,
                type: "monitor",
                serverType: this.type,
                pid: process.pid,
                info: this.info,
                token: null
            };
            let authServer = this.consoleService.authServer;
            let env = this.consoleService.env;
            authServer(req, env, (token) => {
                req["token"] = token;
                this.doSend("register", req);
            });
        });
        this.socket.on("error", (err) => {
            if (this.state < ST_CONNECTED) {
                // error occurs during connecting stage
                cb(err);
            }
            else {
                this.emit("error", err);
            }
        });
        this.socket.on("disconnect", (reason) => {
            this.state = ST_CLOSED;
            this.emit("close");
        });
        this.socket.on("reconnect", () => {
            this.state = ST_CONNECTED;
            let req = {
                id: this.id,
                type: "monitor",
                info: this.info,
                pid: process.pid,
                serverType: this.type
            };
            this.doSend("reconnect", req);
        });
        this.socket.on("reconnect_ok", (msg) => {
            if (msg && msg.code === protocol.PRO_OK) {
                this.state = ST_REGISTERED;
            }
        });
    }
    /**
     * close monitor agent
     *
     * @api public
     */
    close() {
        if (this.state >= ST_CLOSED) {
            return;
        }
        this.state = ST_CLOSED;
        this.socket.disconnect();
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
     * notify master server without callback
     *
     * @param {String} moduleId module id/name
     * @param {Object} msg message
     * @api public
     */
    notify(moduleId, msg) {
        if (this.state !== ST_REGISTERED) {
            logger.error("agent can not notify now, state:" + this.state);
            return;
        }
        this.doSend("monitor", protocol.composeRequest(null, moduleId, msg));
        // this.socket.emit('monitor', protocol.composeRequest(null, moduleId, msg));
    }
    request(moduleId, msg, cb) {
        if (this.state !== ST_REGISTERED) {
            logger.error("agent can not request now, state:" + this.state);
            return;
        }
        let reqId = this.reqId++;
        this.callbacks[reqId] = cb;
        this.doSend("monitor", protocol.composeRequest(reqId, moduleId, msg));
        // this.socket.emit('monitor', protocol.composeRequest(reqId, moduleId, msg));
    }
    doSend(topic, msg) {
        this.socket.send(topic, msg);
    }
}
exports.MonitorAgent = MonitorAgent;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvckFnZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibW9uaXRvckFnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFNBQVMsQ0FDaEQsY0FBYyxFQUNkLGNBQWMsQ0FDZCxDQUFDO0FBQ0YsNkNBQThDO0FBRzlDLG1DQUFzQztBQUN0Qyw0REFBeUQ7QUFJekQsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ3BCLE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQztBQUN2QixNQUFNLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDeEIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ3BCLE1BQU0sZUFBZSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxhQUFhO0FBUy9DLGtCQUEwQixTQUFRLHFCQUFZO0lBVTdDOzs7Ozs7Ozs7OztPQVdHO0lBQ0gsWUFBb0IsSUFBc0I7UUFDekMsS0FBSyxFQUFFLENBQUM7UUFEVyxTQUFJLEdBQUosSUFBSSxDQUFrQjtRQUV6QyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNsQixJQUFJLENBQUMsTUFBTSxHQUFRLElBQUksQ0FBQztRQUN4QixJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDdEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUMzQyxDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNILE9BQU8sQ0FBQyxJQUFZLEVBQUUsSUFBWSxFQUFF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QUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLDZFQUE2RTtJQUM5RSxDQUFDO0lBRUQsT0FBTyxDQUFDLFFBQWdCLEVBQUUsR0FBUSxFQUFFLEVBQVk7UUFDL0MsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQztRQUNSLENBQUM7UUFDRCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdEUsOEVBQThFO0lBQy9FLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBYSxFQUFFLEdBQVE7UUFDN0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLENBQUM7Q0FDRDtBQW5QRCxvQ0FtUEMiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsb2dnZXIgPSByZXF1aXJlKFwicG9tZWxvLWxvZ2dlclwiKS5nZXRMb2dnZXIoXG5cdFwicG9tZWxvLWFkbWluXCIsXG5cdFwiTW9uaXRvckFnZW50XCJcbik7XG5pbXBvcnQgcHJvdG9jb2wgPSByZXF1aXJlKFwiLi4vdXRpbC9wcm90b2NvbFwiKTtcbmltcG9ydCB1dGlscyA9IHJlcXVpcmUoXCIuLi91dGlsL3V0aWxzXCIpO1xuaW1wb3J0IFV0aWwgPSByZXF1aXJlKFwidXRpbFwiKTtcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gXCJldmVudHNcIjtcbmltcG9ydCB7IE1xdHRDbGllbnQgfSBmcm9tIFwiLi4vcHJvdG9jb2wvbXF0dC9tcXR0Q2xpZW50XCI7XG5pbXBvcnQgeyBTZXJ2ZXJJbmZvIH0gZnJvbSBcIi4uLy4uL2luZGV4XCI7XG5pbXBvcnQgeyBDb25zb2xlU2VydmljZSB9IGZyb20gXCIuLi9jb25zb2xlU2VydmljZVwiO1xuXG5jb25zdCBTVF9JTklURUQgPSAxO1xuY29uc3QgU1RfQ09OTkVDVEVEID0gMjtcbmNvbnN0IFNUX1JFR0lTVEVSRUQgPSAzO1xuY29uc3QgU1RfQ0xPU0VEID0gNDtcbmNvbnN0IFNUQVRVU19JTlRFUlZBTCA9IDUgKiAxMDAwOyAvLyA2MCBzZWNvbmRzXG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9uaXRvckFnZW50T3B0cyB7XG5cdGlkPzogc3RyaW5nO1xuXHR0eXBlPzogc3RyaW5nO1xuXHRpbmZvOiBTZXJ2ZXJJbmZvO1xuXHRjb25zb2xlU2VydmljZTogQ29uc29sZVNlcnZpY2U7IC8vVE9ET1xufVxuXG5leHBvcnQgY2xhc3MgTW9uaXRvckFnZW50IGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcblx0cHJpdmF0ZSByZXFJZDogbnVtYmVyO1xuXHRyZWFkb25seSBpZD86IHN0cmluZztcblx0cHJpdmF0ZSBzb2NrZXQ6IE1xdHRDbGllbnQ7XG5cdHByaXZhdGUgY2FsbGJhY2tzOiB7IFtpZHg6IHN0cmluZ106IEZ1bmN0aW9uIH07XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluZm86IFNlcnZlckluZm87XG5cdHByaXZhdGUgc3RhdGU6IG51bWJlcjtcblx0cmVhZG9ubHkgY29uc29sZVNlcnZpY2U6IGFueTtcblxuXHQvKipcblx0ICogTW9uaXRvckFnZW50IENvbnN0cnVjdG9yXG5cdCAqXG5cdCAqIEBjbGFzcyBNYXN0ZXJBZ2VudFxuXHQgKiBAY29uc3RydWN0b3Jcblx0ICogQHBhcmFtIHtPYmplY3R9IG9wdHMgY29uc3RydWN0IHBhcmFtZXRlclxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5jb25zb2xlU2VydmljZSB7T2JqZWN0fSBjb25zb2xlU2VydmljZVxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5pZCAgICAgICAgICAgICB7U3RyaW5nfSBzZXJ2ZXIgaWRcblx0ICogICAgICAgICAgICAgICAgIG9wdHMudHlwZSAgICAgICAgICAge1N0cmluZ30gc2VydmVyIHR5cGUsICdtYXN0ZXInLCAnY29ubmVjdG9yJywgZXRjLlxuXHQgKiAgICAgICAgICAgICAgICAgb3B0cy5pbmZvICAgICAgICAgICB7T2JqZWN0fSBtb3JlIHNlcnZlciBpbmZvIGZvciBjdXJyZW50IHNlcnZlciwge2lkLCBzZXJ2ZXJUeXBlLCBob3N0LCBwb3J0fVxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBvcHRzOiBNb25pdG9yQWdlbnRPcHRzKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlcUlkID0gMTtcblx0XHR0aGlzLmlkID0gb3B0cy5pZDtcblx0XHR0aGlzLnNvY2tldCA9IDxhbnk+bnVsbDtcblx0XHR0aGlzLmNhbGxiYWNrcyA9IHt9O1xuXHRcdHRoaXMudHlwZSA9IG9wdHMudHlwZTtcblx0XHR0aGlzLmluZm8gPSBvcHRzLmluZm87XG5cdFx0dGhpcy5zdGF0ZSA9IFNUX0lOSVRFRDtcblx0XHR0aGlzLmNvbnNvbGVTZXJ2aWNlID0gb3B0cy5jb25zb2xlU2VydmljZTtcblx0fVxuXG5cdC8qKlxuXHQgKiByZWdpc3RlciBhbmQgY29ubmVjdCB0byBtYXN0ZXIgc2VydmVyXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBwb3J0XG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBob3N0XG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIGNhbGxiYWNrIGZ1bmN0aW9uXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRjb25uZWN0KHBvcnQ6IG51bWJlciwgaG9zdDogc3RyaW5nLCBjYjogRnVuY3Rpb24pIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+IFNUX0lOSVRFRCkge1xuXHRcdFx0bG9nZ2VyLmVycm9yKFwibW9uaXRvciBjbGllbnQgaGFzIGNvbm5lY3RlZCBvciBjbG9zZWQuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNiID0gY2IgfHwgZnVuY3Rpb24oKSB7fTtcblxuXHRcdHRoaXMuc29ja2V0ID0gbmV3IE1xdHRDbGllbnQodGhpcy5vcHRzKTtcblx0XHR0aGlzLnNvY2tldC5jb25uZWN0KGhvc3QsIHBvcnQpO1xuXG5cdFx0Ly8gdGhpcy5zb2NrZXQgPSBzY2xpZW50LmNvbm5lY3QoaG9zdCArICc6JyArIHBvcnQsIHtcblx0XHQvLyAgICdmb3JjZSBuZXcgY29ubmVjdGlvbic6IHRydWUsXG5cdFx0Ly8gICAncmVjb25uZWN0JzogdHJ1ZSxcblx0XHQvLyAgICdtYXggcmVjb25uZWN0aW9uIGF0dGVtcHRzJzogMjBcblx0XHQvLyB9KTtcblx0XHR0aGlzLnNvY2tldC5vbihcInJlZ2lzdGVyXCIsIChtc2c6IGFueSkgPT4ge1xuXHRcdFx0aWYgKG1zZyAmJiBtc2cuY29kZSA9PT0gcHJvdG9jb2wuUFJPX09LKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGUgPSBTVF9SRUdJU1RFUkVEO1xuXHRcdFx0XHRjYigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbWl0KFwiY2xvc2VcIik7XG5cdFx0XHRcdGxvZ2dlci5lcnJvcihcblx0XHRcdFx0XHRcInNlcnZlciAlaiAlaiByZWdpc3RlciBtYXN0ZXIgZmFpbGVkXCIsXG5cdFx0XHRcdFx0dGhpcy5pZCxcblx0XHRcdFx0XHR0aGlzLnR5cGVcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuc29ja2V0Lm9uKFwibW9uaXRvclwiLCBtc2cgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc3RhdGUgIT09IFNUX1JFR0lTVEVSRUQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRtc2cgPSBwcm90b2NvbC5wYXJzZShtc2cpO1xuXG5cdFx0XHRpZiAobXNnLmNvbW1hbmQpIHtcblx0XHRcdFx0Ly8gYSBjb21tYW5kIGZyb20gbWFzdGVyXG5cdFx0XHRcdHRoaXMuY29uc29sZVNlcnZpY2UuY29tbWFuZChcblx0XHRcdFx0XHRtc2cuY29tbWFuZCxcblx0XHRcdFx0XHRtc2cubW9kdWxlSWQsXG5cdFx0XHRcdFx0bXNnLmJvZHksXG5cdFx0XHRcdFx0KGVycjogYW55LCByZXM6IGFueSkgPT4ge1xuXHRcdFx0XHRcdFx0Ly9ub3RpZnkgc2hvdWxkIG5vdCBoYXZlIGEgY2FsbGJhY2tcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgcmVzcElkID0gbXNnLnJlc3BJZDtcblx0XHRcdFx0aWYgKHJlc3BJZCkge1xuXHRcdFx0XHRcdC8vIGEgcmVzcG9uc2UgZnJvbSBtb25pdG9yXG5cdFx0XHRcdFx0bGV0IHJlc3BDYiA9IHRoaXMuY2FsbGJhY2tzW3Jlc3BJZF07XG5cdFx0XHRcdFx0aWYgKCFyZXNwQ2IpIHtcblx0XHRcdFx0XHRcdGxvZ2dlci53YXJuKFwidW5rbm93biByZXNwIGlkOlwiICsgcmVzcElkKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVsZXRlIHRoaXMuY2FsbGJhY2tzW3Jlc3BJZF07XG5cdFx0XHRcdFx0cmVzcENiKG1zZy5lcnJvciwgbXNnLmJvZHkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHJlcXVlc3QgZnJvbSBtYXN0ZXJcblx0XHRcdFx0dGhpcy5jb25zb2xlU2VydmljZS5leGVjdXRlKFxuXHRcdFx0XHRcdG1zZy5tb2R1bGVJZCxcblx0XHRcdFx0XHRcIm1vbml0b3JIYW5kbGVyXCIsXG5cdFx0XHRcdFx0bXNnLmJvZHksXG5cdFx0XHRcdFx0KGVycjogYW55LCByZXM6IGFueSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHByb3RvY29sLmlzUmVxdWVzdChtc2cpKSB7XG5cdFx0XHRcdFx0XHRcdGxldCByZXNwID0gcHJvdG9jb2wuY29tcG9zZVJlc3BvbnNlKG1zZywgZXJyLCByZXMpO1xuXHRcdFx0XHRcdFx0XHRpZiAocmVzcCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZG9TZW5kKFwibW9uaXRvclwiLCByZXNwKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly9ub3RpZnkgc2hvdWxkIG5vdCBoYXZlIGEgY2FsbGJhY2tcblx0XHRcdFx0XHRcdFx0bG9nZ2VyLmVycm9yKFwibm90aWZ5IHNob3VsZCBub3QgaGF2ZSBhIGNhbGxiYWNrLlwiKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNvY2tldC5vbihcImNvbm5lY3RcIiwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc3RhdGUgPiBTVF9JTklURUQpIHtcblx0XHRcdFx0Ly9pZ25vcmUgcmVjb25uZWN0XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3RhdGUgPSBTVF9DT05ORUNURUQ7XG5cdFx0XHRsZXQgcmVxID0ge1xuXHRcdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdFx0dHlwZTogXCJtb25pdG9yXCIsXG5cdFx0XHRcdHNlcnZlclR5cGU6IHRoaXMudHlwZSxcblx0XHRcdFx0cGlkOiBwcm9jZXNzLnBpZCxcblx0XHRcdFx0aW5mbzogdGhpcy5pbmZvLFxuXHRcdFx0XHR0b2tlbjogbnVsbFxuXHRcdFx0fTtcblx0XHRcdGxldCBhdXRoU2VydmVyID0gdGhpcy5jb25zb2xlU2VydmljZS5hdXRoU2VydmVyO1xuXHRcdFx0bGV0IGVudiA9IHRoaXMuY29uc29sZVNlcnZpY2UuZW52O1xuXHRcdFx0YXV0aFNlcnZlcihyZXEsIGVudiwgKHRva2VuOiBhbnkpID0+IHtcblx0XHRcdFx0cmVxW1widG9rZW5cIl0gPSB0b2tlbjtcblx0XHRcdFx0dGhpcy5kb1NlbmQoXCJyZWdpc3RlclwiLCByZXEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNvY2tldC5vbihcImVycm9yXCIsIChlcnI6IGFueSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc3RhdGUgPCBTVF9DT05ORUNURUQpIHtcblx0XHRcdFx0Ly8gZXJyb3Igb2NjdXJzIGR1cmluZyBjb25uZWN0aW5nIHN0YWdlXG5cdFx0XHRcdGNiKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVtaXQoXCJlcnJvclwiLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5zb2NrZXQub24oXCJkaXNjb25uZWN0XCIsIChyZWFzb246IGFueSkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFNUX0NMT1NFRDtcblx0XHRcdHRoaXMuZW1pdChcImNsb3NlXCIpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5zb2NrZXQub24oXCJyZWNvbm5lY3RcIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFNUX0NPTk5FQ1RFRDtcblx0XHRcdGxldCByZXEgPSB7XG5cdFx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0XHR0eXBlOiBcIm1vbml0b3JcIixcblx0XHRcdFx0aW5mbzogdGhpcy5pbmZvLFxuXHRcdFx0XHRwaWQ6IHByb2Nlc3MucGlkLFxuXHRcdFx0XHRzZXJ2ZXJUeXBlOiB0aGlzLnR5cGVcblx0XHRcdH07XG5cblx0XHRcdHRoaXMuZG9TZW5kKFwicmVjb25uZWN0XCIsIHJlcSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNvY2tldC5vbihcInJlY29ubmVjdF9va1wiLCAobXNnOiBhbnkpID0+IHtcblx0XHRcdGlmIChtc2cgJiYgbXNnLmNvZGUgPT09IHByb3RvY29sLlBST19PSykge1xuXHRcdFx0XHR0aGlzLnN0YXRlID0gU1RfUkVHSVNURVJFRDtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBjbG9zZSBtb25pdG9yIGFnZW50XG5cdCAqXG5cdCAqIEBhcGkgcHVibGljXG5cdCAqL1xuXHRjbG9zZSgpIHtcblx0XHRpZiAodGhpcy5zdGF0ZSA+PSBTVF9DTE9TRUQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zdGF0ZSA9IFNUX0NMT1NFRDtcblx0XHR0aGlzLnNvY2tldC5kaXNjb25uZWN0KCk7XG5cdH1cblxuXHQvKipcblx0ICogc2V0IG1vZHVsZVxuXHQgKlxuXHQgKiBAcGFyYW0ge1N0cmluZ30gbW9kdWxlSWQgbW9kdWxlIGlkL25hbWVcblx0ICogQHBhcmFtIHtPYmplY3R9IHZhbHVlIG1vZHVsZSBvYmplY3Rcblx0ICogQGFwaSBwdWJsaWNcblx0ICovXG5cdHNldChtb2R1bGVJZDogc3RyaW5nLCB2YWx1ZTogYW55KSB7XG5cdFx0dGhpcy5jb25zb2xlU2VydmljZS5zZXQobW9kdWxlSWQsIHZhbHVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBnZXQgbW9kdWxlXG5cdCAqXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGVJZCBtb2R1bGUgaWQvbmFtZVxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0Z2V0KG1vZHVsZUlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5jb25zb2xlU2VydmljZS5nZXQobW9kdWxlSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIG5vdGlmeSBtYXN0ZXIgc2VydmVyIHdpdGhvdXQgY2FsbGJhY2tcblx0ICpcblx0ICogQHBhcmFtIHtTdHJpbmd9IG1vZHVsZUlkIG1vZHVsZSBpZC9uYW1lXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBtc2cgbWVzc2FnZVxuXHQgKiBAYXBpIHB1YmxpY1xuXHQgKi9cblx0bm90aWZ5KG1vZHVsZUlkOiBzdHJpbmcsIG1zZzogYW55KSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFNUX1JFR0lTVEVSRUQpIHtcblx0XHRcdGxvZ2dlci5lcnJvcihcImFnZW50IGNhbiBub3Qgbm90aWZ5IG5vdywgc3RhdGU6XCIgKyB0aGlzLnN0YXRlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5kb1NlbmQoXCJtb25pdG9yXCIsIHByb3RvY29sLmNvbXBvc2VSZXF1ZXN0KG51bGwhLCBtb2R1bGVJZCwgbXNnKSk7XG5cdFx0Ly8gdGhpcy5zb2NrZXQuZW1pdCgnbW9uaXRvcicsIHByb3RvY29sLmNvbXBvc2VSZXF1ZXN0KG51bGwsIG1vZHVsZUlkLCBtc2cpKTtcblx0fVxuXG5cdHJlcXVlc3QobW9kdWxlSWQ6IHN0cmluZywgbXNnOiBhbnksIGNiOiBGdW5jdGlvbikge1xuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBTVF9SRUdJU1RFUkVEKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IoXCJhZ2VudCBjYW4gbm90IHJlcXVlc3Qgbm93LCBzdGF0ZTpcIiArIHRoaXMuc3RhdGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgcmVxSWQgPSB0aGlzLnJlcUlkKys7XG5cdFx0dGhpcy5jYWxsYmFja3NbcmVxSWRdID0gY2I7XG5cdFx0dGhpcy5kb1NlbmQoXCJtb25pdG9yXCIsIHByb3RvY29sLmNvbXBvc2VSZXF1ZXN0KHJlcUlkLCBtb2R1bGVJZCwgbXNnKSk7XG5cdFx0Ly8gdGhpcy5zb2NrZXQuZW1pdCgnbW9uaXRvcicsIHByb3RvY29sLmNvbXBvc2VSZXF1ZXN0KHJlcUlkLCBtb2R1bGVJZCwgbXNnKSk7XG5cdH1cblxuXHRkb1NlbmQodG9waWM6IHN0cmluZywgbXNnOiBhbnkpIHtcblx0XHR0aGlzLnNvY2tldC5zZW5kKHRvcGljLCBtc2cpO1xuXHR9XG59XG4iXX0=